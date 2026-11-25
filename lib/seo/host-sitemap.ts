import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"
import { tenantSeoIdentity, tenantCanonicalUrl } from "@/lib/seo/tenant-url"
import {
  CUSTOM_SITE_TENANT_SLUGS,
  resolveCustomDomainSlug,
  tenantCanonicalHost,
  tenantCanonicalPathPrefix,
} from "@/lib/tenant-shared"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"

const SITE_KEYS = Object.keys(CUSTOM_SITE_TENANT_SLUGS)

/** Slug du tenant dont `host` est le domaine personnalisé, sinon null. L'hôte n'est jamais recopié : simple recherche dans la table fermée. */
function customSlugForHost(host: string | null | undefined): string | null {
  const clean = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "")
  return resolveCustomDomainSlug(clean)
}

export function sitemapEntriesForHost(host: string | null | undefined): MetadataRoute.Sitemap {
  const domainSlug = customSlugForHost(host)
  const entries: MetadataRoute.Sitemap = []

  if (!domainSlug) {
    entries.push({ url: siteConfig.seo.url, changeFrequency: "weekly", priority: 1 })
  }

  for (const key of SITE_KEYS) {
    const catalog = getPublicSiteCatalog(key as Parameters<typeof getPublicSiteCatalog>[0])
    if (!catalog) continue
    const slug = catalog.tenantSlug
    // Domaine perso : uniquement CE tenant. Plateforme : seulement les tenants sans domaine perso.
    if (domainSlug ? slug !== domainSlug : tenantCanonicalHost(slug)) continue
    const identity = tenantSeoIdentity({
      slug,
      publicDomain: tenantCanonicalHost(slug),
      publicPathPrefix: tenantCanonicalPathPrefix(slug),
    })
    for (const { path, priority } of listSitemapPaths(catalog)) {
      entries.push({ url: tenantCanonicalUrl(path, identity), changeFrequency: "monthly", priority })
    }
  }
  return entries
}

export function robotsSitemapUrlForHost(host: string | null | undefined): string {
  const slug = customSlugForHost(host)
  const canonical = slug ? tenantCanonicalHost(slug) : null
  return `${canonical ? `https://${canonical}` : siteConfig.seo.url.replace(/\/+$/, "")}/sitemap.xml`
}
