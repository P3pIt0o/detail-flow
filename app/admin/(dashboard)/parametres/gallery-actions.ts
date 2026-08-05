"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { put, del } from "@vercel/blob"
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

const MAX_IMAGE_BYTES = 6 * 1024 * 1024 // 6 Mo par image
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

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

/** Valide puis téléverse une image dans le Blob privé. Renvoie le pathname. */
async function uploadImage(file: File, companyId: number, kind: "before" | "after"): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté (JPG, PNG ou WEBP uniquement).")
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image trop lourde (max 6 Mo).")
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const blob = await put(`gallery/company-${companyId}-${kind}-${Date.now()}.${ext}`, file, {
    access: "private",
    addRandomSuffix: true,
  })
  return blob.pathname
}

/**
 * Crée une réalisation. Les deux images sont obligatoires. Les URLs ne sont
 * enregistrées QUE si les deux téléversements réussissent (sinon rollback Blob).
 */
export async function createGalleryItem(formData: FormData): Promise<GalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  const before = formData.get("before") as File | null
  const after = formData.get("after") as File | null
  const title = ((formData.get("title") as string | null) ?? "").trim() || null
  const description = ((formData.get("description") as string | null) ?? "").trim() || null

  if (!before || before.size === 0 || !after || after.size === 0) {
    return { ok: false, error: "Les photos Avant et Après sont obligatoires." }
  }

  let beforePath: string | null = null
  let afterPath: string | null = null
  try {
    beforePath = await uploadImage(before, tenant.id, "before")
    afterPath = await uploadImage(after, tenant.id, "after")
  } catch (e) {
    // Rollback : supprime ce qui a pu être téléversé avant l'échec.
    if (beforePath) await del(beforePath).catch(() => {})
    if (afterPath) await del(afterPath).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Échec du téléversement." }
  }

  // Ordre = fin de liste par défaut.
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

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Modifie une réalisation. Les images ne sont remplacées que si de nouveaux
 * fichiers valides sont fournis ; sinon les anciennes sont CONSERVÉES.
 * ISOLATION : le WHERE inclut toujours le companyId du tenant connecté.
 */
export async function updateGalleryItem(formData: FormData): Promise<GalleryActionResult> {
  const { tenant } = await requireCompanyMember()
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Réalisation introuvable." }

  const [current] = await db
    .select()
    .from(beforeAfterGallery)
    .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))
    .limit(1)
  if (!current) return { ok: false, error: "Réalisation introuvable." }

  const before = formData.get("before") as File | null
  const after = formData.get("after") as File | null
  const title = ((formData.get("title") as string | null) ?? "").trim() || null
  const description = ((formData.get("description") as string | null) ?? "").trim() || null

  let beforePath = current.beforeImageUrl
  let afterPath = current.afterImageUrl
  const uploadedForRollback: string[] = []

  try {
    if (before && before.size > 0) {
      beforePath = await uploadImage(before, tenant.id, "before")
      uploadedForRollback.push(beforePath)
    }
    if (after && after.size > 0) {
      afterPath = await uploadImage(after, tenant.id, "after")
      uploadedForRollback.push(afterPath)
    }
  } catch (e) {
    // Échec : on supprime les nouveaux uploads et on conserve l'existant.
    for (const p of uploadedForRollback) await del(p).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Échec du téléversement." }
  }

  await db
    .update(beforeAfterGallery)
    .set({ beforeImageUrl: beforePath, afterImageUrl: afterPath, title, description, updatedAt: new Date() })
    .where(and(eq(beforeAfterGallery.id, id), eq(beforeAfterGallery.companyId, tenant.id)))

  // Nettoyage best-effort des anciennes images remplacées.
  if (beforePath !== current.beforeImageUrl) await del(current.beforeImageUrl).catch(() => {})
  if (afterPath !== current.afterImageUrl) await del(current.afterImageUrl).catch(() => {})

  revalidatePath("/admin/parametres")
  revalidatePath("/", "layout")
  return { ok: true }
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
