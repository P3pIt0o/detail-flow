import "server-only"
import { db } from "@/lib/db"
import { platformSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * Commission plateforme DetailFlow.
 *
 * Ordre de résolution (extensible) :
 *   1. override tenant (companies.platformFeeBps)
 *   2. [futur] commission liée au plan (FREE/PRO/FOUNDER/BETA)
 *   3. commission globale (platform_settings.defaultPlatformFeeBps)
 *
 * Exprimée en points de base (bps) : 300 = 3,00 %.
 */

const DEFAULT_FALLBACK_BPS = 300

/** Lit la commission globale (crée la ligne id=1 si absente). */
export async function getDefaultPlatformFeeBps(): Promise<number> {
  const [row] = await db
    .select({ bps: platformSettings.defaultPlatformFeeBps })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1)
  return row?.bps ?? DEFAULT_FALLBACK_BPS
}

/**
 * Résout le taux applicable à un tenant. Le taux du plan sera inséré ici plus
 * tard entre l'override et la commission globale, sans changer les appelants.
 */
export function resolvePlatformFeeBps(
  company: { platformFeeBps: number | null },
  defaultBps: number,
): number {
  if (company.platformFeeBps != null) return company.platformFeeBps
  // TODO(plans) : commission liée au plan si défini.
  return defaultBps
}

/** Met à jour la commission globale (Super Admin uniquement). */
export async function setDefaultPlatformFeeBps(bps: number): Promise<void> {
  const clamped = Math.max(0, Math.min(2000, Math.round(bps))) // borne 0–20 %
  await db
    .insert(platformSettings)
    .values({ id: 1, defaultPlatformFeeBps: clamped, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { defaultPlatformFeeBps: clamped, updatedAt: new Date() },
    })
}
