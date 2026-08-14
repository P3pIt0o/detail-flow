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

/**
 * Assure l'existence de la ligne settings du tenant.
 */
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

/**
 * Construit les champs obligatoires AllMySMS à partir
 * des données réellement présentes dans companies.
 */
function resolveAllMySmsTenantIdentity(input: {
  companyName: string
  phone: string | null | undefined
}) {
  const companyName = input.companyName.trim()

  const words = companyName
    .split(/\s+/)
    .filter(Boolean)

  /**
   * Le schéma companies ne possède actuellement
   * ni firstName ni lastName.
   *
   * Pour le provisioning technique AllMySMS,
   * on dérive donc ces champs depuis le nom
   * de l'entreprise.
   */
  const firstName =
    words[0] || "DetailFlow"

  const lastName =
    words.length > 1
      ? words.slice(1).join(" ")
      : "Professionnel"

  return {
    companyName,
    firstName,
    lastName,
    mobile: input.phone?.trim() || "",
  }
}

/**
 * Enregistre les préférences de rappels SMS
 * du tenant actuellement connecté.
 */
export async function saveSmsReminderSettings(input: {
  enabled: boolean
  offsetHours: 24 | 48
  template: string
}): Promise<SmsActionResult> {
  const { tenant } = await requireCompanyMember()

  await ensureSettingsRow(tenant.id)

  const offset =
    input.offsetHours === 48 ? 48 : 24

  const template =
    input.template.trim()

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
   * Première activation :
   * provisionnement idempotent du sous-compte AllMySMS.
   */
  if (input.enabled) {
    await ensureSmsCreditsRow(tenant.id)

    const identity =
      resolveAllMySmsTenantIdentity({
        companyName: tenant.name,
        phone: tenant.phone,
      })

    if (!identity.mobile) {
      console.log(
        "[sms] Sous-compte AllMySMS non provisionné pour tenant",
        tenant.id,
        ": companies.phone absent",
      )

      revalidatePath("/admin/parametres")

      return {
        ok: false,
        error:
          "Renseigne le numéro de téléphone professionnel de l’entreprise avant d’activer les rappels SMS.",
      }
    }

    const sub =
      await ensureTenantSubAccount({
        companyId: tenant.id,
        companyName: identity.companyName,
        firstName: identity.firstName,
        lastName: identity.lastName,
        mobile: identity.mobile,
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
 * Crée une demande de recharge.
 * Aucun crédit n'est ajouté ici.
 */
export async function createRechargeRequest(
  quantity: number,
): Promise<CreateRechargeResult> {
  const { tenant } =
    await requireCompanyMember()

  const qty =
    Math.floor(Number(quantity))

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
   * Notification DetailFlow.
   * Non bloquante.
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
  } catch (error) {
    console.log(
      "[sms] Notification recharge SMS échouée:",
      error instanceof Error
        ? error.message
        : error,
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

/**
 * Retourne le solde du tenant connecté.
 */
export async function getMySmsBalance() {
  const { tenant } =
    await requireCompanyMember()

  return getSmsBalance(tenant.id)
}