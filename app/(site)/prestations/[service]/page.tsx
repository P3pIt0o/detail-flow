/**
 * Pages de prestations SEO des sites personnalisés — ROUTE DYNAMIQUE UNIQUE.
 *
 * `/prestations/[service]` est partagée par les tenants à site personnalisé
 * (Spirit ACS, Rozan…). Le tenant est TOUJOURS résolu côté serveur via
 * `resolveCustomSite()` (en-tête posé par le middleware) : chaque tenant ne voit
 * QUE ses propres prestations. Un slug inconnu — ou un tenant sans site
 * personnalisé — renvoie `notFound()` (aucune page vide, aucune interférence
 * avec le site vitrine standard).
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { buildTenantMetadata } from "@/lib/seo/tenant-seo.server"
import { SpiritServicePage } from "@/components/custom-sites/spirit-acs/service-page"
import { getSpiritService, spiritServiceSlugs } from "@/components/custom-sites/spirit-acs/seo-content"
import { RozanServicePage } from "@/components/custom-sites/rozan/service-page"
import { getRozanService, rozanServiceSlugs, getRozanServicePage } from "@/components/custom-sites/rozan/content"

/**
 * Prégénère les chemins connus de TOUS les sites personnalisés (contenu
 * statique, aucune donnée tenant ici). Le rendu reste dynamique (dépend de
 * l'en-tête tenant), ces params ne sont que des candidats.
 */
export function generateStaticParams(): { service: string }[] {
  const slugs = new Set<string>([...spiritServiceSlugs(), ...rozanServiceSlugs()])
  return Array.from(slugs).map((service) => ({ service }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>
}): Promise<Metadata> {
  const { service: slug } = await params
  const customSite = await resolveCustomSite()

  if (customSite?.key === "spirit-acs") {
    const service = getSpiritService(slug)
    if (!service) return {}
    return buildTenantMetadata({
      path: `/prestations/${service.slug}`,
      title: service.metaTitle,
      description: service.metaDescription,
    })
  }

  if (customSite?.key === "rozan") {
    const service = getRozanService(slug)
    if (!service) return {}
    const page = getRozanServicePage(slug)
    return buildTenantMetadata({
      path: `/prestations/${service.slug}`,
      title: page?.metaTitle ?? `${service.label} à domicile | Rozan Cleaning Services`,
      description: page?.metaDescription ?? service.teaser,
    })
  }

  return {}
}

export default async function CustomSiteServiceRoute({
  params,
}: {
  params: Promise<{ service: string }>
}) {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  const { service: slug } = await params
  const customSite = await resolveCustomSite()

  // Spirit ACS — comportement historique strictement inchangé.
  if (customSite?.key === "spirit-acs") {
    const service = getSpiritService(slug)
    if (!service) notFound()
    const data = await getCustomSitePublicData()
    if (!data) notFound()
    return <SpiritServicePage data={data} service={service} />
  }

  // Rozan Cleaning Services — gabarit prestation autonome (contenu éditorial).
  if (customSite?.key === "rozan") {
    const service = getRozanService(slug)
    if (!service) notFound()
    return <RozanServicePage slug={service.slug} />
  }

  // Tout autre tenant (site standard / clé inconnue) → 404 (aucune régression).
  notFound()
}
