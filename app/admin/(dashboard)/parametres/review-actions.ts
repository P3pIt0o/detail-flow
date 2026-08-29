"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { reviews } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import {
  getReviewsSourceConfig,
  saveReviewsSourceConfig,
  type ReviewsSource,
  type ReviewsSourceConfig,
} from "@/lib/reviews/config"
import {
  searchGooglePlaces,
  getGooglePlaceDetails,
  googleErrorMessage,
  type GooglePlaceCandidate,
} from "@/lib/reviews/google-places"

export type ReviewActionResult = { ok: boolean; error?: string }

export type AdminReview = {
  id: number
  authorName: string
  vehicle: string | null
  rating: number
  text: string
  visible: boolean
  sortOrder: number
}

/** Normalise une note dans l'intervalle 1..5 (entier). */
function clampRating(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 5
  return Math.min(5, Math.max(1, n))
}

function revalidate() {
  revalidatePath("/admin/parametres")
  // Vitrine publique du tenant : accueil + page /avis.
  revalidatePath("/", "layout")
  revalidatePath("/avis")
}

/**
 * Avis de l'entreprise connectée (tous, visibles ou non).
 * ISOLATION : lecture TOUJOURS scopée à `requireCompanyMember().tenant.id`.
 */
export async function listReviews(): Promise<AdminReview[]> {
  const { tenant } = await requireCompanyMember()
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.companyId, tenant.id))
    .orderBy(asc(reviews.sortOrder), asc(reviews.id))
  return rows.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    vehicle: r.vehicle,
    rating: r.rating,
    text: r.text,
    visible: r.visible,
    sortOrder: r.sortOrder,
  }))
}

export type ReviewInput = {
  authorName: string
  vehicle?: string | null
  rating: number
  text: string
  visible?: boolean
}

/** Crée un avis pour le tenant connecté. */
export async function createReview(input: ReviewInput): Promise<ReviewActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const authorName = (input.authorName ?? "").trim()
    const text = (input.text ?? "").trim()
    const vehicle = (input.vehicle ?? "").trim() || null
    if (!authorName) return { ok: false, error: "Le nom du client est obligatoire." }
    // Le commentaire est facultatif : seule la note reste obligatoire.

    const existing = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.companyId, tenant.id))

    await db.insert(reviews).values({
      companyId: tenant.id,
      authorName,
      vehicle,
      rating: clampRating(input.rating),
      text,
      visible: input.visible ?? true,
      sortOrder: existing.length,
    })

    revalidate()
    return { ok: true }
  } catch (e) {
    console.log("[v0] createReview error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

export type ReviewUpdateInput = {
  id: number
  authorName: string
  vehicle?: string | null
  rating: number
  text: string
  visible?: boolean
}

/**
 * Modifie un avis. ISOLATION : le WHERE inclut toujours le companyId du tenant
 * connecté, empêchant toute écriture sur l'avis d'une autre entreprise.
 */
export async function updateReview(input: ReviewUpdateInput): Promise<ReviewActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const id = Number(input.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Avis introuvable." }

    const authorName = (input.authorName ?? "").trim()
    const text = (input.text ?? "").trim()
    const vehicle = (input.vehicle ?? "").trim() || null
    if (!authorName) return { ok: false, error: "Le nom du client est obligatoire." }
    // Le commentaire est facultatif : seule la note reste obligatoire.

    const [current] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.companyId, tenant.id)))
      .limit(1)
    if (!current) return { ok: false, error: "Avis introuvable." }

    await db
      .update(reviews)
      .set({
        authorName,
        vehicle,
        rating: clampRating(input.rating),
        text,
        ...(typeof input.visible === "boolean" ? { visible: input.visible } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(reviews.id, id), eq(reviews.companyId, tenant.id)))

    revalidate()
    return { ok: true }
  } catch (e) {
    console.log("[v0] updateReview error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

/** Bascule la visibilité d'un avis (affiché / masqué). Scopé au tenant. */
export async function toggleReviewVisibility(id: number, visible: boolean): Promise<ReviewActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Avis introuvable." }
    await db
      .update(reviews)
      .set({ visible, updatedAt: new Date() })
      .where(and(eq(reviews.id, id), eq(reviews.companyId, tenant.id)))
    revalidate()
    return { ok: true }
  } catch (e) {
    console.log("[v0] toggleReviewVisibility error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur." }
  }
}

/** Supprime un avis. ISOLATION : filtré par companyId du tenant connecté. */
export async function deleteReview(id: number): Promise<ReviewActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Avis introuvable." }
    await db.delete(reviews).where(and(eq(reviews.id, id), eq(reviews.companyId, tenant.id)))
    revalidate()
    return { ok: true }
  } catch (e) {
    console.log("[v0] deleteReview error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de la suppression." }
  }
}

/* ==========================================================================
 * SOURCE DES AVIS (manuel vs Google)
 *
 * Toutes ces actions résolvent le tenant via requireCompanyMember() (session +
 * appartenance vérifiées côté serveur). Le navigateur ne fournit JAMAIS de
 * companyId : un tenant ne peut donc lire/écrire que SA propre configuration.
 * La clé Google reste strictement serveur (module @/lib/reviews/google-places).
 * ======================================================================== */

/** Aperçu léger d'un établissement Google pour l'admin (jamais persisté). */
export type GooglePlacePreview = {
  placeId: string
  name: string
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
}

/** Lit la config de source d'avis du tenant connecté. */
export async function getReviewsSource(): Promise<ReviewsSourceConfig> {
  const { tenant } = await requireCompanyMember()
  return getReviewsSourceConfig(tenant.id)
}

/**
 * Recherche d'établissements Google (admin uniquement). Renvoie une erreur
 * lisible plutôt que de « throw ». La clé API n'est jamais renvoyée.
 */
export async function searchGooglePlacesAction(
  query: string,
): Promise<{ ok: true; candidates: GooglePlaceCandidate[] } | { ok: false; error: string }> {
  await requireCompanyMember() // garde d'accès (membre d'un tenant)
  const res = await searchGooglePlaces(query)
  if (!res.ok) return { ok: false, error: googleErrorMessage(res.error) }
  return { ok: true, candidates: res.data }
}

/** Aperçu d'un établissement précis (validation du Place ID incluse). */
export async function getGooglePlacePreviewAction(
  placeId: string,
): Promise<{ ok: true; preview: GooglePlacePreview } | { ok: false; error: string }> {
  await requireCompanyMember()
  const res = await getGooglePlaceDetails(placeId, { revalidateSeconds: 0 })
  if (!res.ok) return { ok: false, error: googleErrorMessage(res.error) }
  const { placeId: id, name, rating, userRatingCount, googleMapsUri } = res.data
  return { ok: true, preview: { placeId: id, name, rating, userRatingCount, googleMapsUri } }
}

/**
 * Enregistre la source des avis du tenant connecté.
 *
 * - En mode Google, le Place ID est VALIDÉ auprès de Google avant sauvegarde
 *   (refus si invalide/introuvable).
 * - Ne supprime JAMAIS les avis manuels : changer de source ne fait que
 *   masquer l'autre source côté public.
 */
export async function saveReviewsSource(
  source: ReviewsSource,
  googlePlaceId: string | null,
): Promise<ReviewActionResult & { migrationRequired?: boolean }> {
  try {
    const { tenant } = await requireCompanyMember()

    if (source === "google") {
      const placeId = (googlePlaceId ?? "").trim()
      if (!placeId) return { ok: false, error: "Sélectionnez un établissement Google avant d'enregistrer." }
      // Validation serveur du Place ID (évite d'enregistrer un identifiant mort).
      const check = await getGooglePlaceDetails(placeId, { revalidateSeconds: 0 })
      if (!check.ok) return { ok: false, error: googleErrorMessage(check.error) }

      const saved = await saveReviewsSourceConfig(tenant.id, "google", placeId)
      if (!saved.ok) return { ok: false, error: saved.error, migrationRequired: saved.migrationRequired }
      revalidate()
      return { ok: true }
    }

    // Retour au mode manuel : les avis manuels existants réapparaissent tels quels.
    const saved = await saveReviewsSourceConfig(tenant.id, "manual", null)
    if (!saved.ok) return { ok: false, error: saved.error, migrationRequired: saved.migrationRequired }
    revalidate()
    return { ok: true }
  } catch (e) {
    console.log("[v0] saveReviewsSource error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}
