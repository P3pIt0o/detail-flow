import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"

/**
 * Sitemap du domaine marketing (www.detailflow.fr).
 *
 * Ne contient QUE des pages marketing réellement existantes et indexables.
 * Volontairement exclus : /admin, /super-admin, routes API, authentification,
 * pages tenant et variantes "?tenant=...". Les futures pages SEO métier seront
 * ajoutées ici lorsqu'elles existeront réellement (aucune URL 404).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.seo.url

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ]
}
