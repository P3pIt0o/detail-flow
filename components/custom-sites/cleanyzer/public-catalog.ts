/**
 * ============================================================================
 *  ADAPTATEUR — CATALOGUE PUBLIC DE CLEANYZER
 * ============================================================================
 *
 *  Projection de `seo-content.ts` vers la couche publique commune
 *  (`lib/public-site`), consommée par le sitemap. Aucune donnée dupliquée.
 *
 *  PÉRIMÈTRE (uniquement des URL réellement servies par les routes) :
 *    - « / »                                → accueil CLEANYZER ;
 *    - « /prestations/{slug} »              → 3 pages de prestations ;
 *    - « /zone-intervention-annecy »        → page zone (route [localSlug]).
 *
 *  EXCLUS : « /reservation » et « /demande » (tunnels de conversion), les pages
 *  standard (« /avis », « /contact », « /formules ») non reliées au site, et
 *  les maquettes « /cleanyzer-preview » (noindex).
 *
 *  Conversion : réservation en ligne (BookingV2) pour l'automobile ; demande
 *  personnalisée pour TOUT le textile (canapé, matelas, tapis, moquette).
 * ============================================================================
 */

import type { PublicServicePage, PublicSiteCatalog } from "@/lib/public-site/types"
import { CLEANYZER_TENANT_SLUG } from "./tokens"
import { CLZ_SERVICE_PAGES, CLZ_ZONE_PAGE, type ClzServicePage } from "./seo-content"

function toPublicServicePage(p: ClzServicePage): PublicServicePage {
  return {
    slug: p.slug,
    published: true,
    inNavigation: true,
    navLabel: p.label,
    cardTitle: p.label,
    cardTagline: p.eyebrow,
    cardText: p.intro,
    image: p.image,
    imageAlt: p.imageAlt,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    h1: p.h1,
    breadcrumbLabel: p.label,
    // Automobile → BookingV2 ; textile → demande personnalisée.
    conversionMode: p.kind === "textile" ? "quote_request" : "booking",
    serviceRef: { editorialKey: p.slug },
    sitemapPriority: p.sitemapPriority,
  }
}

export function getCleanyzerPublicCatalog(): PublicSiteCatalog {
  return {
    tenantSlug: CLEANYZER_TENANT_SLUG,
    staticPages: [
      { path: "/", sitemapPriority: 1.0 },
      { path: `/${CLZ_ZONE_PAGE.slug}`, sitemapPriority: CLZ_ZONE_PAGE.sitemapPriority },
    ],
    servicePages: CLZ_SERVICE_PAGES.map(toPublicServicePage),
  }
}
