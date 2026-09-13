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
 * Blocs multi-tenant (Spirit ACS, Rozan…) : tant que le domaine personnalisé
 * n'est pas connecté, les pages publiques indexables de chaque site sont listées
 * avec leur URL tenant correcte (« ?tenant={slug} »), construite par le helper
 * canonique centralisé. Chaque catalogue porte SON PROPRE slug de tenant (ex.
 * « spirit-acs », « rozancleaningservice »). Le jour où un domaine vérifié sera
 * renseigné dans `tenantSeoIdentity`, ces URL basculeront AUTOMATIQUEMENT vers
 * ce domaine (sans « ?tenant= ») sans modifier ce fichier.
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
  // Le sitemap ne connaît plus de liste de pages spécifique : pour chaque site
  // personnalisé, il demande à la couche publique commune « quelles pages ce
  // tenant expose-t-il ? ». La même abstraction servira, à terme, les tenants
  // standards (pages activées). On itère sur les CLÉS DE SITE (registre) ; le
  // slug de tenant réel utilisé pour l'URL provient du catalogue lui-même.
  const customSiteKeys = ["spirit-acs", "rozan"] as const
  for (const key of customSiteKeys) {
    const catalog = getPublicSiteCatalog(key)
    if (!catalog) continue
    const identity = tenantSeoIdentity({ slug: catalog.tenantSlug })
    for (const { path, priority } of listSitemapPaths(catalog)) {
      entries.push({
        url: tenantCanonicalUrl(path, identity),
        lastModified: now,
        changeFrequency: "monthly",
        priority,
      })
    }
  }

  return entries
}
