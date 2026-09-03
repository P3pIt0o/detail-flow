"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { del } from "@vercel/blob"
import { db } from "@/lib/db"
import { photoGallery } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"

export type PhotoGalleryActionResult = { ok: boolean; error?: string }

export type PhotoGalleryItem = {
  id: number
  imageUrl: string
  title: string | null
  description: string | null
  altText: string | null
  sortOrder: number
  published: boolean
}

/**
 * Photos simples (réalisations) de l'entreprise connectée.
 * ISOLATION : lecture TOUJOURS scopée à `requireCompanyMember().tenant.id`.
 */
export async function listPhotoGalleryItems(): Promise<PhotoGalleryItem[]> {
  const { tenant } = await requireCompanyMember()
  const rows = await db
    .select()
    .from(photoGallery)
    .where(eq(photoGallery.companyId, tenant.id))
    .orderBy(asc(photoGallery.sortOrder), asc(photoGallery.id))
  return rows.map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl,
    title: r.title,
    description: r.description,
    altText: r.altText,
    sortOrder: r.sortOrder,
    published: r.published,
  }))
}

export type PhotoGalleryInput = {
  /** Pathname du Blob privé DÉJÀ téléversé côté navigateur (upload client). */
  imagePath: string
  title?: string | null
  description?: string | null
  altText?: string | null
  published?: boolean
}

/**
 * Vérifie que le pathname appartient bien au préfixe Blob de l'entreprise.
 * Défense en profondeur : le token d'upload contraint déjà ce préfixe, on
 * revalide côté action avant d'écrire en base (jamais un companyId du client).
 */
function assertOwnedPath(pathname: string, companyId: number): void {
  if (!pathname || !pathname.startsWith(`photo-gallery/company-${companyId}-`)) {
    throw new Error("Image invalide.")
  }
}

/** Crée une photo à partir d'une image DÉJÀ téléversée (upload client Blob). */
export async function createPhotoGalleryItem(input: PhotoGalleryInput): Promise<PhotoGalleryActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const imagePath = (input.imagePath ?? "").trim()
    const title = (input.title ?? "").trim() || null
    const description = (input.description ?? "").trim() || null
    const altText = (input.altText ?? "").trim() || null
    const published = input.published ?? true

    if (!imagePath) {
      return { ok: false, error: "La photo est obligatoire." }
    }
    assertOwnedPath(imagePath, tenant.id)

    try {
      const existing = await db
        .select({ id: photoGallery.id })
        .from(photoGallery)
        .where(eq(photoGallery.companyId, tenant.id))

      await db.insert(photoGallery).values({
        companyId: tenant.id,
        imageUrl: imagePath,
        title,
        description,
        altText,
        published,
        sortOrder: existing.length,
      })
    } catch (dbError) {
      // Échec en base : on supprime le blob orphelin qui vient d'être téléversé.
      await del(imagePath).catch(() => {})
      throw dbError
    }

    revalidatePath("/admin/parametres")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    console.log("[v0] createPhotoGalleryItem error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

export type PhotoGalleryUpdateInput = {
  id: number
  /** Nouveau pathname téléversé, ou null/undefined pour conserver l'actuel. */
  imagePath?: string | null
  title?: string | null
  description?: string | null
  altText?: string | null
}

/**
 * Modifie une photo. L'image n'est remplacée que si un nouveau pathname (upload
 * client) est fourni ; sinon l'ancienne est CONSERVÉE. L'ancienne image n'est
 * supprimée QU'APRÈS la réussite complète de la mise à jour en base.
 * ISOLATION : le WHERE inclut toujours le companyId du tenant connecté.
 */
export async function updatePhotoGalleryItem(
  input: PhotoGalleryUpdateInput,
): Promise<PhotoGalleryActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    const id = Number(input.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Photo introuvable." }

    const [current] = await db
      .select()
      .from(photoGallery)
      .where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id)))
      .limit(1)
    if (!current) return { ok: false, error: "Photo introuvable." }

    const newImage = (input.imagePath ?? "").trim()
    const title = (input.title ?? "").trim() || null
    const description = (input.description ?? "").trim() || null
    const altText = (input.altText ?? "").trim() || null

    let imagePath = current.imageUrl
    if (newImage) {
      assertOwnedPath(newImage, tenant.id)
      imagePath = newImage
    }

    try {
      await db
        .update(photoGallery)
        .set({ imageUrl: imagePath, title, description, altText, updatedAt: new Date() })
        .where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id)))
    } catch (dbError) {
      // Échec en base : on supprime le nouvel upload orphelin, on CONSERVE l'ancien.
      if (imagePath !== current.imageUrl) await del(imagePath).catch(() => {})
      throw dbError
    }

    // Base à jour : nettoyage best-effort de l'ancienne image remplacée.
    if (imagePath !== current.imageUrl) await del(current.imageUrl).catch(() => {})

    revalidatePath("/admin/parametres")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    console.log("[v0] updatePhotoGalleryItem error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." }
  }
}

/** Publie ou masque une photo. Scopé au tenant connecté. */
export async function setPhotoGalleryPublished(
  id: number,
  published: boolean,
): Promise<PhotoGalleryActionResult> {
  try {
    const { tenant } = await requireCompanyMember()
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Photo introuvable." }

    const res = await db
      .update(photoGallery)
      .set({ published, updatedAt: new Date() })
      .where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id)))
      .returning({ id: photoGallery.id })
    if (res.length === 0) return { ok: false, error: "Photo introuvable." }

    revalidatePath("/admin/parametres")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    console.log("[v0] setPhotoGalleryPublished error:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Erreur." }
  }
}

/** Supprime une photo (et son image du Blob). Scopé au tenant. */
export async function deletePhotoGalleryItem(id: number): Promise<PhotoGalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Photo introuvable." }

  const [current] = await db
    .select()
    .from(photoGallery)
    .where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id)))
    .limit(1)
  if (!current) return { ok: false, error: "Photo introuvable." }

  await db.delete(photoGallery).where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id)))

  await del(current.imageUrl).catch(() => {})

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Réordonne les photos. `orderedIds` = liste des ids dans le nouvel ordre.
 * ISOLATION : chaque update est filtré par companyId du tenant connecté.
 */
export async function reorderPhotoGalleryItems(orderedIds: number[]): Promise<PhotoGalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(photoGallery)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(photoGallery.id, id), eq(photoGallery.companyId, tenant.id))),
    ),
  )
  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}
