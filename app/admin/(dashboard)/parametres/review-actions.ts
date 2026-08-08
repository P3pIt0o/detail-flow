"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { reviews } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"

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
    if (!text) return { ok: false, error: "Le texte de l'avis est obligatoire." }

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
    if (!text) return { ok: false, error: "Le texte de l'avis est obligatoire." }

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
