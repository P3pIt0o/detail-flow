/**
 * ============================================================================
 *  ADAPTATEUR — CATALOGUE PUBLIC DE SPIRIT ACS
 * ============================================================================
 *
 *  Construit le `PublicSiteCatalog` de Spirit ACS À PARTIR de sa configuration
 *  éditoriale typée existante (`SPIRIT_SERVICES`). AUCUNE donnée n'est dupliquée :
 *  ce fichier n'est qu'une PROJECTION de `seo-content.ts` vers la couche
 *  publique commune. Le contenu rédactionnel reste sa seule source.
 *
 *  Pourquoi un adaptateur local ? Le cahier des charges impose que le contenu
 *  Spirit reste dans sa config locale typée pour cette phase, tout en exposant
 *  une abstraction publique propre. `SPIRIT_SERVICES` n'est donc PAS
 *  l'architecture universelle : il est simplement ADAPTÉ ici.
 *
 *  Conversion : toutes les prestations Spirit pointent aujourd'hui vers
 *  `quote_request` (moteur custom_requests). C'est une propriété PAR PAGE : on
 *  pourra en changer une seule sans toucher au provider ni aux consommateurs.
 * ============================================================================
 */

import type { PublicServicePage, PublicSiteCatalog } from "@/lib/public-site/types"
import { SPIRIT_SERVICES, SPIRIT_TENANT_SLUG } from "./seo-content"

/** Projette une prestation éditoriale Spirit vers une page publique commune. */
function toPublicServicePage(s: (typeof SPIRIT_SERVICES)[number]): PublicServicePage {
  return {
    slug: s.slug,
    published: true,
    inNavigation: true,
    navLabel: s.breadcrumbLabel,
    cardTitle: s.cardTitle,
    cardText: s.cardText,
    image: s.image,
    imageAlt: s.imageAlt,
    metaTitle: s.metaTitle,
    metaDescription: s.metaDescription,
    h1: s.h1,
    breadcrumbLabel: s.breadcrumbLabel,
    // Parcours Spirit : demande personnalisée (analyse → proposition).
    conversionMode: "quote_request",
    serviceRef: { editorialKey: s.slug },
    sitemapPriority: 0.8,
  }
}

/**
 * Catalogue public de Spirit ACS. Fonction (et non constante) pour rester
 * cohérent avec un futur provider asynchrone côté tenants standards, sans
 * changer les consommateurs.
 */
export function getSpiritPublicCatalog(): PublicSiteCatalog {
  return {
    tenantSlug: SPIRIT_TENANT_SLUG,
    staticPages: [
      { path: "/", sitemapPriority: 0.9 },
      { path: "/avis", sitemapPriority: 0.6 },
      { path: "/contact", sitemapPriority: 0.6 },
    ],
    servicePages: SPIRIT_SERVICES.map(toPublicServicePage),
  }
}
