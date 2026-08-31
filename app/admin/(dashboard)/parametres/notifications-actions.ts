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

export type NotifActionResult = { ok: boolean; error?: string; migrationRequired?: boolean }

/** Assure l'existence de la ligne settings du tenant courant. */
async function ensureSettingsRow(companyId: number) {
  const rows = await db.select({ id: settings.id }).from(settings).where(eq(settings.companyId, companyId)).limit(1)
  if (!rows.length) await db.insert(settings).values({ companyId })
}

/**
 * Réglages du RAPPEL PRO. Droit `email_reminders` requis UNIQUEMENT pour activer
 * (désactiver toujours possible). companyId = session serveur (jamais le client).
 */
export async function saveProReminderAction(input: {
  enabled: boolean
  offsetHours: number
}): Promise<NotifActionResult> {
  const { tenant } = await requireCompanyMember()
  if (input.enabled && !(await canUseFeature(tenant.id, "email_reminders"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
  }
  await ensureSettingsRow(tenant.id)
  const res = await saveProReminderSettings(tenant.id, input.enabled, input.offsetHours)
  if (res.ok) revalidatePath("/admin/parametres")
  return res
}

/**
 * Réglages de la DEMANDE D'AVIS. Droit `review_requests` requis pour activer.
 * Le lien est validé (HTTPS + domaine Google) avant stockage.
 */
export async function saveReviewRequestAction(input: {
  enabled: boolean
  offsetHours: number
  link: string | null
}): Promise<NotifActionResult> {
  const { tenant } = await requireCompanyMember()
  if (input.enabled && !(await canUseFeature(tenant.id, "review_requests"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
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
