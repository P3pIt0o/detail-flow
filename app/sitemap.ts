import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"
import { tenantSeoIdentity, tenantCanonicalUrl } from "@/lib/seo/tenant-url"
import { SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Sitemap du domaine marketing (www.detailflow.fr).
 *
 * Ne contient QUE des pages réellement existantes et indexables. Volontairement
 * exclus : /admin, /super-admin, routes API, authentification, pages de test,
 * previews Vercel et pages "noindex" (mentions légales, CGV, confidentialité).
 *
 * Bloc Spirit ACS : tant que le domaine personnalisé n'est pas connecté, les
 * pages publiques indexables du site Spirit sont listées avec leur URL tenant
 * correcte (« ?tenant=spirit-acs »), construite par le helper canonique
 * centralisé. Le jour où le domaine vérifié sera renseigné dans
 * `tenantSeoIdentity`, ces URL basculeront AUTOMATIQUEMENT vers ce domaine
 * (sans « ?tenant= ») sans modifier ce fichier.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.seo.url
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ]

  // --- Site public Spirit ACS (multi-tenant, URL tenant-aware) ---------------
  const spirit = tenantSeoIdentity({ slug: "spirit-acs" })
  const spiritPaths: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 0.9 },
    { path: "/avis", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    ...SPIRIT_SERVICES.map((s) => ({ path: `/prestations/${s.slug}`, priority: 0.8 })),
  ]
  for (const { path, priority } of spiritPaths) {
    entries.push({
      url: tenantCanonicalUrl(path, spirit),
      lastModified: now,
      changeFrequency: "monthly",
      priority,
    })
  }

  return entries
}
