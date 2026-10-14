/**
 * Landing pages LOCALES SEO des sites personnalisés (ex. Rozan :
 * `/nettoyage-canape-geneve`, Cleanyzer : `/zone-intervention-annecy`). Segment dynamique de dernier recours au niveau
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
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { buildTenantMetadata } from "@/lib/seo/tenant-seo.server"
import { RozanLocalPage } from "@/components/custom-sites/rozan/local-page"
import { getRozanLocalPage, rozanLocalSlugs } from "@/components/custom-sites/rozan/content"
import { CleanyzerZonePage } from "@/components/custom-sites/cleanyzer/service-page"
import { CLZ_ZONE_PAGE, isClzZoneSlug } from "@/components/custom-sites/cleanyzer/seo-content"

/** Candidats connus (Rozan, Cleanyzer). Rendu dynamique : dépend de l'en-tête tenant. */
export function generateStaticParams(): { localSlug: string }[] {
  return [...rozanLocalSlugs(), CLZ_ZONE_PAGE.slug].map((localSlug) => ({ localSlug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ localSlug: string }>
}): Promise<Metadata> {
  const { localSlug } = await params
  const customSite = await resolveCustomSite()
  if (customSite?.key === "cleanyzer") {
    if (!isClzZoneSlug(localSlug)) return {}
    return buildTenantMetadata({
      path: `/${CLZ_ZONE_PAGE.slug}`,
      title: CLZ_ZONE_PAGE.metaTitle,
      description: CLZ_ZONE_PAGE.metaDescription,
    })
  }
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

  // CLEANYZER : une seule page « zone d'intervention » (pas de pages par commune).
  if (customSite?.key === "cleanyzer") {
    if (!isClzZoneSlug(localSlug)) notFound()
    const data = await getCustomSitePublicData()
    const contact = data ? await data.getContact() : null
    return (
      <CleanyzerZonePage
        contact={contact ? { phone: contact.phone, phoneRaw: contact.phoneRaw, email: contact.email } : null}
      />
    )
  }

  // Réservé aux pages locales Rozan. Tout autre cas → 404 (comportement actuel).
  if (customSite?.key !== "rozan") notFound()

  const page = getRozanLocalPage(localSlug)
  if (!page) notFound()

  return <RozanLocalPage slug={page.serviceSlug} city={page.city} nearbyCities={page.nearby} />
}
