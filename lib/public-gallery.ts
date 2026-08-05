import "server-only"
import { cache } from "react"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { beforeAfterGallery } from "@/lib/db/schema"
import { getCurrentTenant } from "@/lib/tenant"

/** Réalisation Avant/Après prête à l'affichage public (URLs servies via route). */
export type PublicGalleryItem = {
  id: number
  beforeImageUrl: string
  afterImageUrl: string
  title: string | null
  description: string | null
}

/**
 * Réalisations du TENANT COURANT uniquement, triées par ordre d'affichage.
 *
 * ISOLATION : le companyId provient de `getCurrentTenant()` (résolu depuis le
 * contexte de la requête), jamais du client. Hors contexte tenant (vitrine
 * racine DetailFlow), renvoie []. Les URLs pointent vers la route publique
 * `/api/gallery-image` qui revérifie l'appartenance au tenant.
 */
export const getPublicGallery = cache(async (): Promise<PublicGalleryItem[]> => {
  const tenant = await getCurrentTenant()
  if (!tenant) return []

  const rows = await db
    .select()
    .from(beforeAfterGallery)
    .where(eq(beforeAfterGallery.companyId, tenant.id))
    .orderBy(asc(beforeAfterGallery.sortOrder), asc(beforeAfterGallery.id))

  const src = (pathname: string) =>
    `/api/gallery-image?company=${encodeURIComponent(tenant.slug)}&p=${encodeURIComponent(pathname)}`

  return rows.map((r) => ({
    id: r.id,
    beforeImageUrl: src(r.beforeImageUrl),
    afterImageUrl: src(r.afterImageUrl),
    title: r.title,
    description: r.description,
  }))
})
