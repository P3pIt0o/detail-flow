import { NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"
import { sendReminderEmail } from "@/lib/email/notifications"

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

  // Date du lendemain au format YYYY-MM-DD (colonne `date` de type date).
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const y = tomorrow.getFullYear()
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0")
  const d = String(tomorrow.getDate()).padStart(2, "0")
  const target = `${y}-${m}-${d}`

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

  return NextResponse.json({ ok: true, date: target, candidates: due.length, sent })
}
