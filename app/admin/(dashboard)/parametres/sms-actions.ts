"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings, smsRechargeRequests } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import {
  getSmsBalance,
  generateRechargeReference,
  ensureSmsCreditsRow,
} from "@/lib/sms/credits"
import { ensureTenantSubAccount } from "@/lib/sms/send"
import {
  SMS_MIN_CUSTOM_QUANTITY,
  amountForQuantity,
  formatSmsAmount,
  SMS_NOTIFY_EMAIL,
} from "@/lib/sms/config"
import { sendEmail } from "@/lib/email/send"
import { smsRechargeRequestEmail } from "@/lib/email/templates"

export type SmsActionResult = {
  ok: boolean
  error?: string
}

/** Assure l'existence de la ligne settings de l'entreprise courante. */
async function ensureSettingsRow(companyId: number) {
  const rows = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1)

  if (!rows.length) {
    await db.insert(settings).values({ companyId })
  }
}

/** Enregistre les préférences de rappels SMS (tenant courant uniquement). */
export async function saveSmsReminderSettings(input: {
  enabled: boolean
  offsetHours: 24 | 48
  template: string
}): Promise<SmsActionResult> {
  const { tenant } = await requireCompanyMember()

  await ensureSettingsRow(tenant.id)

  const offset = input.offsetHours === 48 ? 48 : 24
  const template = input.template.trim()

  await db
    .update(settings)
    .set({
      smsRemindersEnabled: input.enabled,
      smsReminderOffsetHours: offset,
      smsReminderTemplate: template || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.companyId, tenant.id))

  /**
   * À la première activation des rappels SMS :
   * provisionne de façon idempotente le sous-compte AllMySMS.
   *
   * Le companyId provient toujours de la session serveur.
   */
  if (input.enabled) {
    await ensureSmsCreditsRow(tenant.id)

    /**
     * Récupère le téléphone professionnel configuré dans les paramètres.
     * On utilise ensuite companies.phone uniquement comme fallback.
     */
    const [businessSettings] = await db
      .select({
        businessPhone: settings.businessPhone,
      })
      .from(settings)
      .where(eq(settings.companyId, tenant.id))
      .limit(1)

    const mobile =
      businessSettings?.businessPhone?.trim() ||
      tenant.phone?.trim() ||
      ""

    if (!mobile) {
      console.log(
        "[sms] Sous-compte AllMySMS non provisionné pour tenant",
        tenant.id,
        ": numéro professionnel absent",
      )

      revalidatePath("/admin/parametres")

      return {
        ok: false,
        error:
          "Renseigne le numéro de téléphone professionnel avant d'activer les rappels SMS.",
      }
    }

    /**
     * Le schéma actuel ne possède pas de prénom / nom du propriétaire.
     * On dérive donc temporairement ces champs depuis le nom de l'entreprise
     * uniquement pour satisfaire les champs obligatoires AllMySMS.
     */
    const companyName = tenant.name.trim()

    const companyParts = companyName
      .split(/\s+/)
      .filter(Boolean)

    const firstName =
      companyParts[0] || "DetailFlow"

    const lastName =
      companyParts.length > 1
        ? companyParts.slice(1).join(" ")
        : "Professionnel"

    const sub = await ensureTenantSubAccount({
      companyId: tenant.id,
      companyName,
      firstName,
      lastName,
      mobile,
    })

    if (!sub.ok) {
      console.log(
        "[sms] Sous-compte AllMySMS non provisionné pour tenant",
        tenant.id,
        ":",
        sub.error || "erreur inconnue",
      )

      revalidatePath("/admin/parametres")

      return {
        ok: false,
        error:
          sub.error ||
          "Impossible de configurer le sous-compte SMS.",
      }
    }

    if (sub.created) {
      console.log(
        "[sms] Sous-compte AllMySMS créé pour tenant",
        tenant.id,
      )
    }
  }

  revalidatePath("/admin/parametres")

  return { ok: true }
}

export type CreateRechargeResult =
  | {
      ok: true
      reference: string
      quantity: number
      amountLabel: string
    }
  | {
      ok: false
      error: string
    }

/**
 * Crée une demande de recharge (statut "pending").
 * NE crédite JAMAIS.
 *
 * L'entreprise est TOUJOURS celle de la session.
 */
export async function createRechargeRequest(
  quantity: number,
): Promise<CreateRechargeResult> {
  const { tenant } = await requireCompanyMember()

  const qty = Math.floor(Number(quantity))

  if (
    !Number.isFinite(qty) ||
    qty < SMS_MIN_CUSTOM_QUANTITY
  ) {
    return {
      ok: false,
      error: `Quantité minimale : ${SMS_MIN_CUSTOM_QUANTITY} SMS.`,
    }
  }

  if (qty > 5000) {
    return {
      ok: false,
      error: "Quantité trop élevée.",
    }
  }

  const amountCents =
    amountForQuantity(qty)

  const reference =
    generateRechargeReference()

  await db
    .insert(smsRechargeRequests)
    .values({
      companyId: tenant.id,
      reference,
      quantity: qty,
      amountCents,
      status: "pending",
    })

  /**
   * Notification interne non bloquante :
   * la demande reste enregistrée même si l'email échoue.
   */
  try {
    const mail =
      smsRechargeRequestEmail({
        companyName: tenant.name,
        companyEmail:
          tenant.email ?? "—",
        quantity: qty,
        amountLabel:
          formatSmsAmount(amountCents),
        reference,
        createdAt:
          new Date().toLocaleString("fr-FR"),
      })

    await sendEmail({
      to: SMS_NOTIFY_EMAIL,
      subject: mail.subject,
      html: mail.html,
    })
  } catch (e) {
    console.log(
      "[v0] Notification recharge SMS échouée:",
      e instanceof Error
        ? e.message
        : e,
    )
  }

  revalidatePath("/admin/parametres")

  return {
    ok: true,
    reference,
    quantity: qty,
    amountLabel:
      formatSmsAmount(amountCents),
  }
}

/** Lit le solde SMS du tenant courant. */
export async function getMySmsBalance() {
  const { tenant } =
    await requireCompanyMember()

  return getSmsBalance(tenant.id)
}