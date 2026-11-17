import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { sitemapEntriesForHost } from "@/lib/seo/host-sitemap"

/**
 * Sitemap décidé par l'hôte de la requête (voir `lib/seo/host-sitemap.ts`) :
 * domaine personnalisé → pages de ce seul tenant ; sinon plateforme DetailFlow
 * + tenants sans domaine personnalisé. Exclut /admin, API, pages noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  return sitemapEntriesForHost(h.get("x-forwarded-host") ?? h.get("host"))
}
