/**
 * Pages de prestations SEO de Spirit ACS — ROUTE DYNAMIQUE UNIQUE.
 *
 * `/prestations/[service]` couvre les 6 prestations via un SEUL gabarit
 * (`SpiritServicePage`) alimenté par la configuration éditoriale locale. La
 * route est réservée au site Spirit ACS (shell propre) : pour tout autre tenant
 * — ou un slug inconnu — on renvoie `notFound()` afin de ne pas exposer de page
 * vide ni interférer avec le site vitrine standard.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"
import { buildTenantMetadata } from "@/lib/seo/tenant-seo.server"
import { SpiritServicePage } from "@/components/custom-sites/spirit-acs/service-page"
import { getSpiritService, spiritServiceSlugs } from "@/components/custom-sites/spirit-acs/seo-content"

/** Prégénère les 6 chemins connus (contenu statique, aucune donnée tenant ici). */
export function generateStaticParams(): { service: string }[] {
  return spiritServiceSlugs().map((service) => ({ service }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>
}): Promise<Metadata> {
  const { service: slug } = await params
  const service = getSpiritService(slug)
  if (!service) return {}
  return buildTenantMetadata({
    path: `/prestations/${service.slug}`,
    title: service.metaTitle,
    description: service.metaDescription,
  })
}

export default async function SpiritServiceRoute({
  params,
}: {
  params: Promise<{ service: string }>
}) {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  const { service: slug } = await params
  const service = getSpiritService(slug)
  if (!service) notFound()

  // Réservé au site Spirit ACS (shell propre). Tout autre tenant → 404.
  const customSite = await resolveCustomSite()
  if (customSite?.key !== "spirit-acs") notFound()

  const data = await getCustomSitePublicData()
  if (!data) notFound()

  return <SpiritServicePage data={data} service={service} />
}
