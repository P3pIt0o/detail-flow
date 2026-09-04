import "server-only"

/**
 * PONT SERVEUR entre le tenant courant et les helpers SEO purs.
 *
 * Centralise, pour les pages publiques, la résolution de :
 *   - l'identité SEO du tenant (slug + futur domaine vérifié) ;
 *   - les métadonnées de page (tenant-aware, via `buildTenantPageMetadata`) ;
 *   - les données de l'établissement pour le JSON-LD `LocalBusiness/AutoWash`.
 *
 * Aucune donnée inventée : tout provient du tenant réel (`getCurrentTenant`,
 * table `companies`) ou, pour Spirit ACS uniquement, de sa configuration
 * éditoriale isolée (`seo-content.ts`).
 *
 * ISOLATION : le tenant est toujours résolu côté serveur (en-tête middleware),
 * jamais depuis une valeur du navigateur.
 */

import type { Metadata } from "next"
import { cache } from "react"
import { siteConfig } from "@/config/site"
import { getCurrentTenant, type Tenant } from "@/lib/tenant"
import { getPublicHours } from "@/lib/public-contact"
import {
  tenantSeoIdentity,
  tenantCanonicalUrl,
  type TenantSeoIdentity,
} from "./tenant-url"
import { buildTenantPageMetadata } from "./tenant-metadata"
import { buildLocalBusinessJsonLd, type LocalBusinessInput } from "./structured-data"
import { SPIRIT_TENANT_SLUG } from "@/components/custom-sites/spirit-acs/seo-content"

/** Chemin de l'image Open Graph propre à Spirit ACS (existe dans /public). */
const SPIRIT_OG_IMAGE = "/custom-sites/spirit-acs/og-spirit-acs.png"
/** Icône (favicon) propre à Spirit ACS. */
const SPIRIT_ICON = "/custom-sites/spirit-acs/icon.png"

/** Base absolue DetailFlow sans slash final. */
const BASE = siteConfig.seo.url.replace(/\/+$/, "")

export type ResolvedTenantSeo = {
  /** Tenant courant, ou null hors contexte tenant. */
  tenant: Tenant | null
  /** Identité SEO (slug + domaine vérifié futur) — null hors tenant. */
  identity: TenantSeoIdentity | null
  /** Vrai si le tenant courant est Spirit ACS (contenu éditorial dédié). */
  isSpirit: boolean
  /** Nom d'affichage du tenant (ou nom DetailFlow par défaut). */
  siteName: string
}

/**
 * Résout l'identité SEO du tenant courant. Mémoïsé par requête.
 * Prépare le futur domaine personnalisé : `publicDomain` reste `null` tant
 * qu'aucun champ vérifié n'existe (aucune migration dans cette tâche).
 */
export const resolveTenantSeo = cache(async (): Promise<ResolvedTenantSeo> => {
  const tenant = await getCurrentTenant()
  if (!tenant) {
    return { tenant: null, identity: null, isSpirit: false, siteName: siteConfig.brand.name }
  }
  const identity = tenantSeoIdentity({
    slug: tenant.slug,
    // POINT D'EXTENSION futur domaine vérifié (n'existe pas encore en base).
    publicDomain: null,
  })
  return {
    tenant,
    identity,
    isSpirit: tenant.customSiteKey?.trim() === "spirit-acs" || tenant.slug === SPIRIT_TENANT_SLUG,
    siteName: tenant.name || siteConfig.brand.name,
  }
})

/** URL canonique tenant-aware d'un chemin pour le tenant courant. */
export async function tenantCanonical(path: string): Promise<string> {
  const { identity } = await resolveTenantSeo()
  if (!identity) {
    return path === "/" ? `${BASE}/` : `${BASE}${path.replace(/[?#].*$/, "")}`
  }
  return tenantCanonicalUrl(path, identity)
}

/**
 * Construit les métadonnées d'une page publique pour le tenant courant.
 * Utilise l'image OG + favicon Spirit lorsque le tenant est Spirit ACS ;
 * sinon retombe sur l'image OG générique DetailFlow.
 */
export async function buildTenantMetadata(args: {
  path: string
  title: string
  description: string
  robots?: Metadata["robots"]
}): Promise<Metadata> {
  const seo = await resolveTenantSeo()

  // Hors contexte tenant : métadonnées DetailFlow génériques.
  if (!seo.identity) {
    const canonical = args.path === "/" ? `${BASE}/` : `${BASE}${args.path}`
    return {
      title: { absolute: args.title },
      description: args.description,
      alternates: { canonical },
      ...(args.robots ? { robots: args.robots } : {}),
    }
  }

  const useSpirit = seo.isSpirit
  const imageUrl = `${BASE}${useSpirit ? SPIRIT_OG_IMAGE : siteConfig.seo.ogImage}`

  return buildTenantPageMetadata({
    identity: seo.identity,
    path: args.path,
    title: args.title,
    description: args.description,
    siteName: seo.siteName,
    imageUrl,
    imageAlt: useSpirit ? "Spirit ACS — detailing automobile" : seo.siteName,
    icons: useSpirit ? { icon: SPIRIT_ICON, apple: SPIRIT_ICON } : undefined,
    robots: args.robots,
  })
}

/** Extrait les liens de réseaux sociaux réels depuis le champ jsonb du tenant. */
function extractSameAs(tenant: Tenant): string[] {
  const raw = tenant.socialLinks
  if (!raw || typeof raw !== "object") return []
  const out: string[] = []
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim().startsWith("http")) out.push(value.trim())
  }
  return out
}

/**
 * Construit le JSON-LD `AutoWash` du tenant courant à partir de ses données
 * RÉELLES (coordonnées, horaires, adresse structurée, réseaux). Renvoie `null`
 * hors contexte tenant. Aucune propriété vide n'est émise (voir structured-data).
 */
export async function buildTenantLocalBusiness(args?: {
  /** Lien Google Maps réel (hasMap), si disponible. */
  hasMap?: string | null
  /** Villes réellement confirmées (areaServed). */
  areaServed?: string[] | null
  /**
   * Si vrai, n'expose QUE la localité (ville) dans l'adresse structurée, jamais
   * la rue ni le code postal. Utilisé par les sites à shell propre (Spirit ACS)
   * qui limitent volontairement leur présentation publique à la ville.
   */
  localityOnly?: boolean
}): Promise<Record<string, unknown> | null> {
  const seo = await resolveTenantSeo()
  if (!seo.identity || !seo.tenant) return null
  const tenant = seo.tenant

  const hours = await getPublicHours()
  const sameAs = extractSameAs(tenant)
  const logoAbsolute = tenant.logoUrl
    ? `${BASE}/api/company-logo?company=${encodeURIComponent(tenant.slug)}`
    : null

  const localityOnly = args?.localityOnly ?? false
  const input: LocalBusinessInput = {
    type: "AutoWash",
    name: seo.siteName,
    url: await tenantCanonical("/"),
    telephone: tenant.phone ?? null,
    email: tenant.email ?? null,
    logo: logoAbsolute,
    image: seo.isSpirit ? `${BASE}${SPIRIT_OG_IMAGE}` : logoAbsolute,
    address: {
      // En mode localité seule, on masque rue + code postal.
      streetAddress: localityOnly ? null : tenant.address ?? null,
      postalCode: localityOnly ? null : tenant.postalCode ?? null,
      addressLocality: tenant.city ?? null,
      addressCountry: tenant.country ?? null,
    },
    openingHours: hours.map((h) => ({ day: h.day, open: h.open, from: h.from ?? null, to: h.to ?? null })),
    areaServed: args?.areaServed ?? null,
    sameAs: sameAs.length ? sameAs : null,
    hasMap: args?.hasMap ?? null,
  }

  return buildLocalBusinessJsonLd(input)
}
