import { NextResponse } from "next/server"
import { and, eq, isNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, settings as settingsTable, companies } from "@/lib/db/schema"
import { sendReminderEmail } from "@/lib/email/notifications"
import { sendSms } from "@/lib/sms/send"
import { debitOneSms } from "@/lib/sms/credits"
import { renderSmsTemplate, SMS_DEFAULT_TEMPLATE } from "@/lib/sms/config"

// Toujours dynamique : ne jamais mettre en cache l'exécution du cron.
export const dynamic = "force-dynamic"

/**
 * Rappel automatique de RDV.
 *
 * Déclenché quotidiennement par le cron Vercel (voir vercel.json). Envoie un
 * email de rappel pour chaque réservation CONFIRMÉE dont le RDV a lieu le
 * lendemain et dont le rappel n'a pas encore été envoyé.
 *
 * Sécurité : en production, Vercel Cron ajoute l'en-tête
 * `Authorization: Bearer <CRON_SECRET>`. On refuse toute requête sans ce jeton
 * dès lors qu'un CRON_SECRET est configuré.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
    }
  }

  // Renvoie la date à J+n au format YYYY-MM-DD (colonne `date` de type date).
  const dateInDays = (days: number) => {
    const dt = new Date()
    dt.setDate(dt.getDate() + days)
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, "0")
    const d = String(dt.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  // Date du lendemain (rappel email : toujours à 24 h).
  const target = dateInDays(1)

  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.date, target),
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminderSentAt),
      ),
    )

  let sent = 0
  for (const row of due) {
    const ok = await sendReminderEmail(row.id)
    if (ok) {
      await db
        .update(bookings)
        .set({ reminderSentAt: new Date() })
        .where(eq(bookings.id, row.id))
      sent += 1
    }
  }

  /* ------------------------------ Rappels SMS ------------------------------ */
  // Une passe indépendante : chaque entreprise choisit son délai (24 h ou 48 h)
  // et n'envoie que si la fonctionnalité est activée ET le solde > 0. Le débit
  // du solde ET le marquage smsReminderSentAt sont atomiques/uniques par RDV
  // (protection anti double-envoi), et le SMS n'est jamais tenté deux fois.
  let smsSent = 0
  let smsSkippedNoCredit = 0
  for (const offset of [24, 48]) {
    const smsTarget = dateInDays(offset / 24)
    // Entreprises ayant activé le rappel SMS pour CE délai.
    const enabledSettings = await db
      .select({ companyId: settingsTable.companyId, template: settingsTable.smsReminderTemplate })
      .from(settingsTable)
      .where(
        and(
          eq(settingsTable.smsRemindersEnabled, true),
          eq(settingsTable.smsReminderOffsetHours, offset),
        ),
      )
    if (enabledSettings.length === 0) continue
    const tmplByCompany = new Map(enabledSettings.map((s) => [s.companyId, s.template]))
    const companyIds = enabledSettings.map((s) => s.companyId)

    const nameById = new Map(
      (
        await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(inArray(companies.id, companyIds))
      ).map((c) => [c.id, c.name]),
    )

    // RDV confirmés à J+offset, non encore rappelés par SMS, des tenants concernés.
    const dueSms = await db
      .select({
        id: bookings.id,
        companyId: bookings.companyId,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        date: bookings.date,
        startTime: bookings.startTime,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.date, smsTarget),
          eq(bookings.status, "confirmed"),
          isNull(bookings.smsReminderSentAt),
          inArray(bookings.companyId, companyIds),
        ),
      )

    for (const b of dueSms) {
      if (!b.customerPhone) continue
      // 1) Débit atomique + marquage : ne réussit qu'une fois et seulement si solde>0.
      const debit = await debitOneSms(b.companyId, b.id)
      if (!debit.ok) {
        if (debit.reason === "no_credit") smsSkippedNoCredit += 1
        continue // déjà envoyé, solde nul, ou inconnu -> on n'envoie pas
      }
      // 2) Envoi réel (le solde est déjà débité de façon idempotente).
      const message = renderSmsTemplate(tmplByCompany.get(b.companyId) || SMS_DEFAULT_TEMPLATE, {
        prenom: (b.customerName || "").trim().split(/\s+/)[0] || "",
        entreprise: nameById.get(b.companyId) || "",
        date: b.date,
        heure: b.startTime,
      })
      await sendSms({ to: b.customerPhone, message })
      smsSent += 1
    }
  }

  return NextResponse.json({
    ok: true,
    date: target,
    candidates: due.length,
    sent,
    smsSent,
    smsSkippedNoCredit,
  })
}
