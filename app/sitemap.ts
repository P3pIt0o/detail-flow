import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"

/**
 * Génère le sitemap.xml automatiquement à partir de la navigation configurée.
 * Ajouter une page dans siteConfig.nav / legalNav suffit à l'y inclure.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.seo.url
  const now = new Date()

  const routes = [...siteConfig.nav, ...siteConfig.legalNav]

  return routes.map((route) => ({
    url: `${base}${route.href === "/" ? "" : route.href}`,
    lastModified: now,
    changeFrequency: route.href === "/" ? "weekly" : "monthly",
    priority: route.href === "/" ? 1 : 0.7,
  }))
}
