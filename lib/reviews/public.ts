import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { reviews as reviewsTable } from "@/lib/db/schema"
import type { Review } from "@/config/content"
import { getReviewsSourceConfig } from "./config"
import { getGooglePlaceDetails, type GooglePlaceDetails, type GooglePlacesErrorKind } from "./google-places"

/**
 * Résolution CENTRALISÉE de la source d'avis publique d'un tenant.
 *
 * C'est le SEUL endroit qui décide « manuel vs Google » pour le rendu public.
 * Les deux sources ne sont jamais mélangées : on renvoie une union discriminée.
 *
 * ISOLATION : `companyId` doit provenir d'une résolution serveur (hôte /
 * middleware / appartenance), jamais du navigateur.
 *
 * Ne « throw » jamais : une panne Google renvoie { source:'google', data:null,
 * error } pour un repli propre côté rendu.
 */
export type TenantReviewsResolved =
  | { source: "manual"; reviews: Review[] }
  | { source: "google"; data: GooglePlaceDetails | null; error: GooglePlacesErrorKind | null; placeId: string | null }

/** Avis manuels VISIBLES d'un tenant donné (scopé companyId). */
async function getManualReviews(companyId: number): Promise<Review[]> {
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.companyId, companyId), eq(reviewsTable.visible, true)))
    .orderBy(asc(reviewsTable.sortOrder), asc(reviewsTable.id))
  return rows.map((r) => ({
    id: String(r.id),
    author: r.authorName,
    vehicle: r.vehicle ?? "",
    rating: r.rating,
    text: r.text,
    date: r.createdAt.toISOString(),
  }))
}

/**
 * Résout les avis à afficher pour un tenant.
 *
 * @param companyId identifiant tenant résolu côté serveur
 * @param opts.manualReviews avis manuels déjà chargés (évite une 2ᵉ requête ;
 *   les sites personnalisés passent le résultat de `getReviews()` du contrat)
 */
export async function resolveTenantReviews(
  companyId: number,
  opts?: { manualReviews?: Review[]; googleRevalidateSeconds?: number },
): Promise<TenantReviewsResolved> {
  const config = await getReviewsSourceConfig(companyId)

  if (config.source === "google" && config.googlePlaceId) {
    const res = await getGooglePlaceDetails(config.googlePlaceId, {
      revalidateSeconds: opts?.googleRevalidateSeconds,
    })
    if (res.ok) {
      return { source: "google", data: res.data, error: null, placeId: config.googlePlaceId }
    }
    return { source: "google", data: null, error: res.error, placeId: config.googlePlaceId }
  }

  // Mode manuel (défaut + rétrocompatibilité) : avis DetailFlow uniquement.
  const manual = opts?.manualReviews ?? (await getManualReviews(companyId))
  return { source: "manual", reviews: manual }
}
