/**
 * Pages ville du site Spirit ACS (`/detailing/<commune>`, L85).
 *
 * ISOLATION : le tenant est résolu côté serveur (`resolveCustomSite`). Seul le
 * site personnalisé « spirit-acs » rend ces pages, et uniquement pour les 5
 * communes de `SPIRIT_CITY_PAGES`. Tout autre tenant (Cleanyzer, site standard,
 * domaine racine) et toute autre commune (dont Lagny-sur-Marne, servie par
 * l'accueil) renvoient `notFound()`.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { buildTenantMetadata } from "@/lib/seo/tenant-seo.server"
import { SpiritCityPageView } from "@/components/custom-sites/spirit-acs/city-page"
import {
  SPIRIT_CITY_PAGES,
  getSpiritCityPage,
  spiritCityPath,
} from "@/components/custom-sites/spirit-acs/seo-content"

/** Candidats connus. Rendu dynamique : dépend de l'en-tête tenant. */
export function generateStaticParams(): { commune: string }[] {
  return SPIRIT_CITY_PAGES.map((p) => ({ commune: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ commune: string }>
}): Promise<Metadata> {
  const { commune } = await params
  const customSite = await resolveCustomSite()
  if (customSite?.key !== "spirit-acs") return {}
  const page = getSpiritCityPage(commune)
  if (!page) return {}
  return buildTenantMetadata({
    path: spiritCityPath(page.slug),
    title: page.metaTitle,
    description: page.metaDescription,
  })
}

export default async function SpiritCityRoute({ params }: { params: Promise<{ commune: string }> }) {
  // Garde du site vitrine (feature website), comme les autres pages du site.
  await requireWebsiteFeature()

  const { commune } = await params
  const customSite = await resolveCustomSite()
  if (customSite?.key !== "spirit-acs") notFound()

  const page = getSpiritCityPage(commune)
  if (!page) notFound()

  const data = await getCustomSitePublicData()
  if (!data) notFound()

  return <SpiritCityPageView data={data} page={page} />
}
