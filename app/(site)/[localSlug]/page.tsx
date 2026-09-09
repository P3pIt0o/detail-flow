/**
 * Landing pages LOCALES SEO des sites personnalisés (ex. Rozan :
 * `/nettoyage-canape-geneve`). Segment dynamique de dernier recours au niveau
 * racine du site : les routes explicites (`/prestations`, `/reservation`,
 * `/contact`, pages légales…) restent prioritaires (Next.js privilégie le
 * statique sur le dynamique).
 *
 * ISOLATION & NON-RÉGRESSION : le tenant est résolu côté serveur. Seul un tenant
 * à site personnalisé disposant d'une page locale pour ce slug rend du contenu ;
 * tout autre tenant (site standard, clé inconnue) et tout slug inconnu renvoient
 * `notFound()` — soit exactement le même 404 qu'aujourd'hui pour ces chemins.
 * Aucune donnée d'un autre tenant n'est accessible ici.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { buildTenantMetadata } from "@/lib/seo/tenant-seo.server"
import { RozanLocalPage } from "@/components/custom-sites/rozan/local-page"
import { getRozanLocalPage, rozanLocalSlugs } from "@/components/custom-sites/rozan/content"

/** Candidats connus (Rozan). Rendu dynamique : dépend de l'en-tête tenant. */
export function generateStaticParams(): { localSlug: string }[] {
  return rozanLocalSlugs().map((localSlug) => ({ localSlug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ localSlug: string }>
}): Promise<Metadata> {
  const { localSlug } = await params
  const customSite = await resolveCustomSite()
  if (customSite?.key !== "rozan") return {}
  const page = getRozanLocalPage(localSlug)
  if (!page) return {}
  return buildTenantMetadata({
    path: `/${page.slug}`,
    title: page.metaTitle,
    description: page.metaDescription,
  })
}

export default async function CustomSiteLocalRoute({
  params,
}: {
  params: Promise<{ localSlug: string }>
}) {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  const { localSlug } = await params
  const customSite = await resolveCustomSite()

  // Réservé aux pages locales Rozan. Tout autre cas → 404 (comportement actuel).
  if (customSite?.key !== "rozan") notFound()

  const page = getRozanLocalPage(localSlug)
  if (!page) notFound()

  return <RozanLocalPage slug={page.serviceSlug} city={page.city} nearbyCities={page.nearby} />
}
