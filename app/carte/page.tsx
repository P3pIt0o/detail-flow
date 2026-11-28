import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadPublicDigitalCard } from "@/lib/digital-card.server"
import { DigitalCardView } from "@/components/digital-card/digital-card-view"
import { buildTenantPageMetadata } from "@/lib/seo/tenant-metadata"
import { resolveTenantOrigin, SEO_BASE, tenantSeoIdentity } from "@/lib/seo/tenant-url"
import { tenantCanonicalHost } from "@/lib/tenant-shared"

/**
 * Carte digitale publique du tenant (L45). Hors du groupe `(site)` : plein écran, sans
 * navigation ni pied de page, indépendante de la publication de la vitrine.
 */

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadPublicDigitalCard()
  // Page de partage : pas d'indexation (évite le contenu dupliqué avec le site).
  const noindex = { robots: { index: false, follow: false } }
  if (!data) return noindex

  // Toutes les balises héritées du layout racine (DetailFlow) sont remplacées par celles du tenant.
  const identity = tenantSeoIdentity({ slug: data.slug, publicDomain: tenantCanonicalHost(data.slug) })
  const image = data.logoSrc ? `${resolveTenantOrigin(identity) ?? SEO_BASE}${data.logoSrc}` : null
  const description = data.line ?? `Carte de contact de ${data.name}`
  const meta = buildTenantPageMetadata({
    identity,
    path: "/carte",
    title: data.name,
    description,
    siteName: data.name,
    imageUrl: image ?? "",
    // Sans logo : listes vides, pour ne pas hériter des icônes DetailFlow.
    icons: image ? { icon: image, apple: image } : { icon: [], apple: [] },
    robots: noindex.robots,
    neutralizePlatformTags: true,
  })
  // Logo (carré, format libre) en vignette ; sans logo, aucune image.
  const images = image ? [{ url: image, alt: data.name }] : []
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images },
    twitter: { card: "summary", title: data.name, description, images: image ? [image] : [] },
  }
}

export default async function CartePage() {
  const data = await loadPublicDigitalCard()
  if (!data) notFound()
  return <DigitalCardView name={data.name} line={data.line} logoSrc={data.logoSrc} card={data.card} actions={data.actions} />
}
