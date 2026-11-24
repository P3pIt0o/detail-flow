/**
 * L79 — Preuve sociale Google de Cleanyzer en direct (rendu serveur uniquement).
 * Note et nombre d'avis viennent ENSEMBLE de Google (fiche en cache, ~1 h) ; sinon tous deux du
 * repli écrit à la main (BRAND). Jamais de mélange. Ne lève jamais d'exception.
 */

import { BRAND } from "./content"

export type ClzGoogleProof = { rating: number; reviewCount: number }

type LiveRating = { rating: number; reviewCount?: number | null } | null | undefined
export type ClzRatingFetcher = (companyId: number) => Promise<LiveRating>

/** Valeurs écrites à la main, utilisées si Google ne répond pas ou si aucun établissement n'est relié. */
export const CLZ_GOOGLE_PROOF_FALLBACK: ClzGoogleProof = {
  rating: BRAND.googleRating ?? 5,
  reviewCount: BRAND.googleReviewCount ?? 0,
}

export function pickGoogleProof(live: LiveRating): ClzGoogleProof {
  if (
    live &&
    typeof live.rating === "number" &&
    Number.isFinite(live.rating) &&
    typeof live.reviewCount === "number" &&
    Number.isInteger(live.reviewCount) &&
    live.reviewCount > 0
  ) {
    return { rating: live.rating, reviewCount: live.reviewCount }
  }
  return CLZ_GOOGLE_PROOF_FALLBACK
}

/** `companyId` : résolu côté serveur (data.tenant.id). Sans tenant (aperçu) : repli direct. */
export async function getClzGoogleProof(companyId: number | undefined, fetcher?: ClzRatingFetcher): Promise<ClzGoogleProof> {
  if (companyId == null) return CLZ_GOOGLE_PROOF_FALLBACK
  try {
    // Import différé : "server-only" n'est chargé que lorsqu'un tenant est présent.
    const get = fetcher ?? (await import("@/lib/reviews/public")).getTenantGoogleRating
    return pickGoogleProof(await get(companyId))
  } catch {
    return CLZ_GOOGLE_PROOF_FALLBACK
  }
}
