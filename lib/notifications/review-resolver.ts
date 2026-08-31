import "server-only"

/**
 * Résolution SERVEUR du lien de demande d'avis effectif d'un tenant.
 *
 * Réutilise la config avis EXISTANTE (source Google + Place ID) sans la
 * modifier, et retombe sur le lien manuel LOT D si aucun Place ID fiable n'est
 * configuré. Ne fabrique jamais de Place ID (cf. review-link.ts).
 *
 * Priorité : Place ID Google déjà configuré → lien manuel validé → null.
 */

import { getReviewsSourceConfig } from "@/lib/reviews/config"
import { getLotDSettings } from "./settings-store"
import { resolveEffectiveReviewLink } from "./review-link"

export async function resolveTenantReviewLink(companyId: number): Promise<string | null> {
  const [reviewsConfig, lotD] = await Promise.all([
    getReviewsSourceConfig(companyId).catch(() => ({ source: "manual" as const, googlePlaceId: null })),
    getLotDSettings(companyId),
  ])
  // Un Place ID n'est réutilisé que si la source d'avis du tenant est Google
  // (cohérent avec la config du site : on ne détourne pas un Place ID d'une
  // source « manuelle »).
  const placeId = reviewsConfig.source === "google" ? reviewsConfig.googlePlaceId : null
  return resolveEffectiveReviewLink({ placeId, manualLink: lotD.reviewRequestLink })
}
