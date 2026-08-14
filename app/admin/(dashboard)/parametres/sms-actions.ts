"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  settings,
  smsRechargeRequests,
} from "@/lib/db/schema"

import { requireCompanyMember } from "@/lib/admin"

import {
  getSmsBalance,
  generateRechargeReference,
  ensureSmsCreditsRow,
} from "@/lib/sms/credits"

import {
  ensureTenantSubAccount,
} from "@/lib/sms/send"

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
 * Assure l'existence de la ligne settings
 * de l'entreprise courante.
 */
async function ensureSettingsRow(companyId: number) {
  const rows = await db
    .select({
      id: settings.id,
    })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1)

  if (!rows.length) {
    await db
      .insert(settings)
      .values({
        companyId,
      })
  }
}

/**
 * Récupère proprement les informations nécessaires
 * au provisioning AllMySMS.
 *
 * On évite de dépendre d'un nom de champ unique
 * tant que le schéma tenant n'est pas uniformisé.
 */
function resolveTenantContact(tenant: unknown) {
  const t = tenant as {
    name?: string | null

    firstName?: string | null
    lastName?: string | null

    ownerFirstName?: string | null
    ownerLastName?: string | null

    contactFirstName?: string | null
    contactLastName?: string | null

    phone?: string | null
    mobile?: string | null
    phoneNumber?: string | null
    contactPhone?: string | null
  }

  const companyName =
    (t.name || "").trim()

  /**
   * Si aucun prénom/nom propriétaire n'est directement disponible,
   * on utilise temporairement le nom de l'entreprise comme fallback
   * pour fournir les champs obligatoires FIRSTNAME/LASTNAME à AllMySMS.
   */
  const companyWords =
    companyName
      .split(/\s+/)
      .filter(Boolean)

  const fallbackFirstName =
    companyWords[0] || "DetailFlow"

  const fallbackLastName =
    companyWords.length > 1
      ? companyWords.slice(1).join(" ")
      : "Client"

  const firstName =
    (
      t.firstName ||
      t.ownerFirstName ||
      t.contactFirstName ||
      fallbackFirstName
    ).trim()

  const lastName =
    (
      t.lastName ||
      t.ownerLastName ||
      t.contactLastName ||
      fallbackLastName
    ).trim()

  const mobile =
    (
      t.mobile ||
      t.phone ||
      t.phoneNumber ||
      t.contactPhone ||
      ""
    ).trim()

  return {
    companyName,
    firstName,
    lastName,
    mobile,
  }
}

/**
 * Enregistre les préférences de rappels SMS
 * du tenant actuellement connecté.
 *
 * Le companyId est TOUJOURS issu de la session serveur.
 */
export async function saveSmsReminderSettings(input: {
  enabled: boolean
  offsetHours: 24 | 48
  template: string
}): Promise<SmsActionResult> {
  const { tenant } =
    await requireCompanyMember()

  await ensureSettingsRow(
    tenant.id,
  )

  const offset =
    input.offsetHours === 48
      ? 48
      : 24

  const template =
    input.template.trim()

  await db
    .update(settings)
    .set({
      smsRemindersEnabled:
        input.enabled,

      smsReminderOffsetHours:
        offset,

      smsReminderTemplate:
        template || null,

      updatedAt:
        new Date(),
    })
    .where(
      eq(
        settings.companyId,
        tenant.id,
      ),
    )

  /**
   * Lors de l'activation :
   *
   * 1. garantit l'existence du portefeuille SMS ;
   * 2. tente de provisionner le sous-compte AllMySMS ;
   * 3. création idempotente :
   *    s'il existe déjà, aucun nouveau compte n'est créé.
   *
   * L'activation des rappels reste enregistrée même si
   * AllMySMS refuse temporairement le provisioning.
   */
  if (input.enabled) {
    await ensureSmsCreditsRow(
      tenant.id,
    )

    const contact =
      resolveTenantContact(
        tenant,
      )

    if (!contact.mobile) {
      console.log(
        "[sms] Sous-compte AllMySMS non provisionné pour tenant",
        tenant.id,
        ": numéro professionnel absent",
      )
    } else {
      const sub =
        await ensureTenantSubAccount({
          companyId:
            tenant.id,

          companyName:
            contact.companyName,

          firstName:
            contact.firstName,

          lastName:
            contact.lastName,

          mobile:
            contact.mobile,
        })

      if (!sub.ok) {
        console.log(
          "[sms] Sous-compte AllMySMS non provisionné pour tenant",
          tenant.id,
          ":",
          sub.error ||
            "erreur inconnue",
        )
      } else if (
        sub.created
      ) {
        console.log(
          "[sms] Sous-compte AllMySMS créé pour tenant",
          tenant.id,
        )
      }
    }
  }

  revalidatePath(
    "/admin/parametres",
  )

  return {
    ok: true,
  }
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
 * Crée une demande de recharge SMS.
 *
 * IMPORTANT :
 * cette action NE crédite jamais directement
 * le compte du tenant.
 *
 * La validation finale reste réservée au Super Admin.
 */
export async function createRechargeRequest(
  quantity: number,
): Promise<CreateRechargeResult> {
  const { tenant } =
    await requireCompanyMember()

  const qty =
    Math.floor(
      Number(quantity),
    )

  if (
    !Number.isFinite(qty) ||
    qty <
      SMS_MIN_CUSTOM_QUANTITY
  ) {
    return {
      ok: false,
      error:
        `Quantité minimale : ${SMS_MIN_CUSTOM_QUANTITY} SMS.`,
    }
  }

  if (qty > 5000) {
    return {
      ok: false,
      error:
        "Quantité trop élevée.",
    }
  }

  const amountCents =
    amountForQuantity(qty)

  const reference =
    generateRechargeReference()

  await db
    .insert(
      smsRechargeRequests,
    )
    .values({
      companyId:
        tenant.id,

      reference,

      quantity:
        qty,

      amountCents,

      status:
        "pending",
    })

  /**
   * Notification interne.
   *
   * L'échec de l'e-mail ne doit JAMAIS
   * annuler la demande enregistrée en base.
   */
  try {
    const mail =
      smsRechargeRequestEmail({
        companyName:
          tenant.name,

        companyEmail:
          tenant.email ??
          "—",

        quantity:
          qty,

        amountLabel:
          formatSmsAmount(
            amountCents,
          ),

        reference,

        createdAt:
          new Date()
            .toLocaleString(
              "fr-FR",
            ),
      })

    await sendEmail({
      to:
        SMS_NOTIFY_EMAIL,

      subject:
        mail.subject,

      html:
        mail.html,
    })
  } catch (error) {
    console.log(
      "[sms] Notification recharge SMS échouée:",
      error instanceof Error
        ? error.message
        : error,
    )
  }

  revalidatePath(
    "/admin/parametres",
  )

  return {
    ok: true,
    reference,
    quantity: qty,
    amountLabel:
      formatSmsAmount(
        amountCents,
      ),
  }
}

/**
 * Lit le solde SMS du tenant connecté.
 */
export async function getMySmsBalance() {
  const { tenant } =
    await requireCompanyMember()

  return getSmsBalance(
    tenant.id,
  )
}