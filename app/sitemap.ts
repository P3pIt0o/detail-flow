import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"
import { tenantSeoIdentity, tenantCanonicalUrl } from "@/lib/seo/tenant-url"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"

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

  // --- Sites publics multi-tenant (URL tenant-aware) -------------------------
  // Le sitemap ne connaît plus de liste spécifique : il demande à la couche
  // publique commune « quelles pages ce tenant expose-t-il ? ». La même
  // abstraction servira, à terme, les tenants standards (pages activées).
  const spiritCatalog = getPublicSiteCatalog("spirit-acs")
  if (spiritCatalog) {
    const spirit = tenantSeoIdentity({ slug: spiritCatalog.tenantSlug })
    for (const { path, priority } of listSitemapPaths(spiritCatalog)) {
      entries.push({
        url: tenantCanonicalUrl(path, spirit),
        lastModified: now,
        changeFrequency: "monthly",
        priority,
      })
    }
  }

  return entries
}
