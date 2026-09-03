import "server-only"
import { cache } from "react"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { photoGallery } from "@/lib/db/schema"
import { getCurrentTenant } from "@/lib/tenant"

/** Photo simple (réalisation) prête à l'affichage public. */
export type PublicPhotoGalleryItem = {
  id: number
  imageUrl: string
  title: string | null
  description: string | null
  altText: string | null
}

/**
 * Photos PUBLIÉES du TENANT COURANT uniquement, triées par ordre d'affichage.
 *
 * ISOLATION : le companyId provient de `getCurrentTenant()` (résolu depuis le
 * contexte de la requête), jamais du client. Hors contexte tenant (vitrine
 * racine DetailFlow), renvoie []. Les URLs pointent vers la route publique
 * `/api/photo-gallery-image` qui revérifie l'appartenance au tenant. Seules les
 * photos `published = true` sont exposées.
 */
export const getPublicPhotoGallery = cache(async (): Promise<PublicPhotoGalleryItem[]> => {
  const tenant = await getCurrentTenant()
  if (!tenant) return []

  const rows = await db
    .select()
    .from(photoGallery)
    .where(and(eq(photoGallery.companyId, tenant.id), eq(photoGallery.published, true)))
    .orderBy(asc(photoGallery.sortOrder), asc(photoGallery.id))

  const src = (pathname: string) =>
    `/api/photo-gallery-image?company=${encodeURIComponent(tenant.slug)}&p=${encodeURIComponent(pathname)}`

  return rows.map((r) => ({
    id: r.id,
    imageUrl: src(r.imageUrl),
    title: r.title,
    description: r.description,
    altText: r.altText,
  }))
})
