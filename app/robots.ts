import type { MetadataRoute } from "next"
import { siteConfig } from "@/config/site"

/**
 * robots.txt — autorise l'indexation publique, bloque les futures zones
 * privées (dashboard admin, espace client) et pointe vers le sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/compte", "/api"],
    },
    sitemap: `${siteConfig.seo.url}/sitemap.xml`,
  }
}
