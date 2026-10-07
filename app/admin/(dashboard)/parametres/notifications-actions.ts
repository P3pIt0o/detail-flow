"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature, FEATURE_LOCKED_MESSAGE } from "@/lib/licensing/enforce"
import {
  saveProReminderSettings,
  saveReviewRequestSettings,
  getLotDSettings,
  type LotDSettings,
} from "@/lib/notifications/settings-store"
import { validateGoogleReviewLink } from "@/lib/notifications/review-link"
import { resolveTenantReviewLink } from "@/lib/notifications/review-resolver"
import { getReviewsSourceConfig } from "@/lib/reviews/config"
import {
  proReminderInfrastructureReady,
  reviewRequestInfrastructureReady,
} from "@/lib/notifications/runtime"
import {
  checkProReminderActivation,
  checkReviewRequestActivation,
  type ActivationCheck,
} from "@/lib/notifications/activation"

export type NotifActionResult = { ok: boolean; error?: string; migrationRequired?: boolean }

/** Assure l'existence de la ligne settings du tenant courant. */
async function ensureSettingsRow(companyId: number) {
  const rows = await db.select({ id: settings.id }).from(settings).where(eq(settings.companyId, companyId)).limit(1)
  if (!rows.length) await db.insert(settings).values({ companyId })
}

function activationError(check: ActivationCheck): NotifActionResult | null {
  if (check.ok) return null
  return { ok: false, error: check.reason === "locked" ? FEATURE_LOCKED_MESSAGE : check.error }
}

async function loadBusinessEmail(companyId: number): Promise<string | null> {
  const rows = await db
    .select({ businessEmail: settings.businessEmail })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1)
  return rows[0]?.businessEmail ?? null
}

/**
 * Réglages du RAPPEL PRO (email AU PROFESSIONNEL avant le RDV). Activer exige,
 * côté serveur : `email_reminders`, disponibilité globale (nouvelle activation),
 * email professionnel valide, puis migration (settings-store). Désactiver est
 * toujours possible. companyId = session serveur (jamais le client).
 */
export async function saveProReminderAction(input: {
  enabled: boolean
  offsetHours: number
}): Promise<NotifActionResult> {
  const { tenant } = await requireCompanyMember()
  if (input.enabled) {
    const [licensed, current, businessEmail] = await Promise.all([
      canUseFeature(tenant.id, "email_reminders"),
      getLotDSettings(tenant.id),
      loadBusinessEmail(tenant.id),
    ])
    const denied = activationError(
      checkProReminderActivation({
        enabled: true,
        alreadyEnabled: current.proReminderEnabled,
        // Flag global + fournisseur email configuré (booléen serveur uniquement).
        runtimeEnabled: proReminderInfrastructureReady(),
        licensed,
        businessEmail,
      }),
    )
    if (denied) return denied
  }
  await ensureSettingsRow(tenant.id)
  const res = await saveProReminderSettings(tenant.id, input.enabled, input.offsetHours)
  if (res.ok) revalidatePath("/admin/parametres")
  return res
}

/**
 * Réglages de la DEMANDE D'AVIS (email AU CLIENT après completed_at). Activer
 * exige `review_requests`, disponibilité globale (nouvelle activation) et un
 * lien d'avis effectif (Place ID Google configuré OU lien manuel valide).
 * Le lien manuel est validé (HTTPS + domaine Google) avant stockage.
 */
export async function saveReviewRequestAction(input: {
  enabled: boolean
  offsetHours: number
  link: string | null
}): Promise<NotifActionResult> {
  const { tenant } = await requireCompanyMember()
  if (input.enabled) {
    const [licensed, current, reviewsConfig] = await Promise.all([
      canUseFeature(tenant.id, "review_requests"),
      getLotDSettings(tenant.id),
      getReviewsSourceConfig(tenant.id).catch(() => ({ source: "manual" as const, googlePlaceId: null })),
    ])
    const denied = activationError(
      checkReviewRequestActivation({
        enabled: true,
        alreadyEnabled: current.reviewRequestEnabled,
        // Flag global + fournisseur email + capacité de lien de désinscription.
        runtimeEnabled: reviewRequestInfrastructureReady(),
        licensed,
        placeId: reviewsConfig.source === "google" ? reviewsConfig.googlePlaceId : null,
        manualLink: input.link,
      }),
    )
    if (denied) return denied
  }
  await ensureSettingsRow(tenant.id)
  const res = await saveReviewRequestSettings(tenant.id, input.enabled, input.offsetHours, input.link)
  if (res.ok) revalidatePath("/admin/parametres")
  return res
}

/**
 * « Tester le lien » : valide le lien fourni (ou le lien effectif résolu) SANS
 * envoyer d'email. Renvoie l'URL sûre à ouvrir côté client (target _blank).
 */
export async function testReviewLinkAction(input: {
  link: string | null
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { tenant } = await requireCompanyMember()
  // Si un lien est saisi, on le valide directement ; sinon on résout le lien
  // effectif (Place ID Google configuré) pour ce tenant.
  if (typeof input.link === "string" && input.link.trim()) {
    const v = validateGoogleReviewLink(input.link)
    return v.ok ? { ok: true, url: v.url } : { ok: false, error: v.error }
  }
  const resolved = await resolveTenantReviewLink(tenant.id)
  return resolved
    ? { ok: true, url: resolved }
    : { ok: false, error: "Aucun lien d'avis Google configuré." }
}

/** Charge les réglages LOT D + droits (pour l'affichage initial de l'UI). */
export async function loadNotificationSettings(): Promise<{
  settings: LotDSettings
  canReminders: boolean
  canReviews: boolean
}> {
  const { tenant } = await requireCompanyMember()
  const [s, canReminders, canReviews] = await Promise.all([
    getLotDSettings(tenant.id),
    canUseFeature(tenant.id, "email_reminders"),
    canUseFeature(tenant.id, "review_requests"),
  ])
  return { settings: s, canReminders, canReviews }
}
