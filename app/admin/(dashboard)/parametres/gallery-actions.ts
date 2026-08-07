"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { del } from "@vercel/blob"
import { db } from "@/lib/db"
import { beforeAfterGallery } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"

export type GalleryActionResult = { ok: boolean; error?: string }

export type GalleryItem = {
  id: number
  beforeImageUrl: string
  afterImageUrl: string
  title: string | null
  description: string | null
  sortOrder: number
}

/**
 * Réalisations Avant / Après de l'entreprise connectée.
 * ISOLATION : lecture TOUJOURS scopée à `requireCompanyMember().tenant.id`.
 */
export async function listGalleryItems(): Promise<GalleryItem[]> {
  const { tenant } = await requireCompanyMember()
  const rows = await db
    .select()
    .from(beforeAfterGallery)
    .where(eq(beforeAfterGallery.companyId, tenant.id))
    .orderBy(asc(beforeAfterGallery.sortOrder), asc(beforeAfterGallery.id))
  return rows.map((r) => ({
    id: r.id,
    beforeImageUrl: r.beforeImageUrl,
    afterImageUrl: r.afterImageUrl,
    title: r.title,
    description: r.description,
    sortOrder: r.sortOrder,
  }))
}

export type GalleryInput = {
  /** Pathname du Blob privé déjà téléversé côté navigateur (upload client). */
  beforePath: string
  afterPath: string
  title?: string | null
  description?: string | null
}

/**
 * Vérifie que le pathname appartient bien au préfixe Blob de l'entreprise.
 * Défense en profondeur : le token d'upload contraint déjà ce préfixe, on
 * revalide côté action avant d'écrire en base.
 */
function assertOwnedPath(pathname: string, companyId: number): void {
  if (!pathname || !pathname.startsWith(`gallery/company-${companyId}-`)) {
    throw new Error("Image invalide.")
  }
}

/**
 * Crée une réalisation à partir des images DÉJÀ téléversées (upload client
 * Blob) : seuls leurs pathnames transitent par la Server Action, ce qui évite
 * la limite de corps de 1 Mo. En cas d'échec, les blobs orphelins sont
 * supprimés (rollback).
 */
export async function createGalleryItem(input: GalleryInput): Promise<GalleryActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const beforePath = (input.beforePath ?? "").trim()
    const afterPath = (input.afterPath ?? "").trim()
    const title = (input.title ?? "").trim() || null
    const description = (input.description ?? "").trim() || null

    if (!beforePath || !afterPath) {
      return { ok: false, error: "Les photos Avant et Après sont obligatoires." }
    }
    assertOwnedPath(beforePath, tenant.id)
    assertOwnedPath(afterPath, tenant.id)

    try {
      const existing = await db
        .select({ id: beforeAfterGallery.id })
        .from(beforeAfterGallery)
        .where(eq(beforeAfterGallery.companyId, tenant.id))

      await db.insert(beforeAfterGallery).values({
        companyId: tenant.id,
        beforeImageUrl: beforePath,
        afterImageUrl: afterPath,
        title,
        description,
        sortOrder: existing.length,
      })
    } catch (dbError) {
      // Échec en base : on supprime les blobs orphelins qui viennent d'être
      // téléversés pour ne pas laisser de fichiers inutiles.
      await del(beforePath).catch(() => {})
      await del(afterPath).catch(() => {})
      throw dbError
    }

    revalidatePath("/admin/parametres")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    console.log("[v0] createGalleryItem error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

export type GalleryUpdateInput = {
  id: number
  /** Nouveau pathname téléversé, ou null/undefined pour conserver l'actuel. */
  beforePath?: string | null
  afterPath?: string | null
  title?: string | null
  description?: string | null
}

/**
 * Modifie une réalisation. Les images ne sont remplacées que si de nouveaux
 * pathnames (upload client) sont fournis ; sinon les anciennes sont CONSERVÉES.
 * Les anciennes images ne sont supprimées QU'APRÈS la réussite complète de la
 * mise à jour en base (exigence : ne rien perdre si l'enregistrement échoue).
 * ISOLATION : le WHERE inclut toujours le companyId du tenant connecté.
 */
export async function updateGalleryItem(input: GalleryUpdateInput): Promise<GalleryActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const id = Number(input.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Réalisation introuvable." }

    const [current] = await db
      .select()
      .from(beforeAfterGallery)
      .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))
      .limit(1)
    if (!current) return { ok: false, error: "Réalisation introuvable." }

    const newBefore = (input.beforePath ?? "").trim()
    const newAfter = (input.afterPath ?? "").trim()
    const title = (input.title ?? "").trim() || null
    const description = (input.description ?? "").trim() || null

    let beforePath = current.beforeImageUrl
    let afterPath = current.afterImageUrl
    if (newBefore) {
      assertOwnedPath(newBefore, tenant.id)
      beforePath = newBefore
    }
    if (newAfter) {
      assertOwnedPath(newAfter, tenant.id)
      afterPath = newAfter
    }

    try {
      await db
        .update(beforeAfterGallery)
        .set({ beforeImageUrl: beforePath, afterImageUrl: afterPath, title, description, updatedAt: new Date() })
        .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))
    } catch (dbError) {
      // Échec en base : on supprime les nouveaux uploads orphelins et on
      // CONSERVE les anciennes images (non touchées).
      if (beforePath !== current.beforeImageUrl) await del(beforePath).catch(() => {})
      if (afterPath !== current.afterImageUrl) await del(afterPath).catch(() => {})
      throw dbError
    }

    // Base à jour : nettoyage best-effort des anciennes images remplacées.
    if (beforePath !== current.beforeImageUrl) await del(current.beforeImageUrl).catch(() => {})
    if (afterPath !== current.afterImageUrl) await del(current.afterImageUrl).catch(() => {})

    revalidatePath("/admin/parametres")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    console.log("[v0] updateGalleryItem error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

/** Supprime une réalisation (et ses images du Blob). Scopé au tenant. */
export async function deleteGalleryItem(id: number): Promise<GalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Réalisation introuvable." }

  const [current] = await db
    .select()
    .from(beforeAfterGallery)
    .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))
    .limit(1)
  if (!current) return { ok: false, error: "Réalisation introuvable." }

  await db
    .delete(beforeAfterGallery)
    .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))

  await del(current.beforeImageUrl).catch(() => {})
  await del(current.afterImageUrl).catch(() => {})

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Réordonne les réalisations. `orderedIds` = liste des ids dans le nouvel ordre.
 * ISOLATION : chaque update est filtré par companyId du tenant connecté.
 */
export async function reorderGalleryItems(orderedIds: number[]): Promise<GalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(beforeAfterGallery)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id))),
    ),
  )
  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}
