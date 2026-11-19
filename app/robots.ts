import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { robotsSitemapUrlForHost } from "@/lib/seo/host-sitemap"

/**
 * robots.txt — autorise l'indexation publique, bloque les zones privées et
 * pointe vers le sitemap de l'hôte de la requête (hôte validé, jamais recopié).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/compte", "/api"],
    },
    sitemap: robotsSitemapUrlForHost(h.get("x-forwarded-host") ?? h.get("host")),
  }
}
