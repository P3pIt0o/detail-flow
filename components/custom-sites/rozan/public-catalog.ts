/**
 * ============================================================================
 *  ADAPTATEUR — CATALOGUE PUBLIC DE ROZAN CLEANING SERVICES
 * ============================================================================
 *
 *  Construit le `PublicSiteCatalog` de Rozan À PARTIR de sa configuration
 *  éditoriale typée existante (`content.ts`). AUCUNE donnée n'est dupliquée :
 *  ce fichier n'est qu'une PROJECTION du contenu Rozan vers la couche publique
 *  commune consommée par le sitemap (et, demain, la nav / le maillage).
 *
 *  SOURCE DE VÉRITÉ : le tenant Rozan DÉJÀ enregistré (slug
 *  « rozancleaningservice »). On ne crée pas de tenant, on ne modifie pas la
 *  clé de site personnalisé (« rozan », côté registre) : ici on ne fait que
 *  décrire les pages PUBLIQUES réellement servies par les routes.
 *
 *  PÉRIMÈTRE DU SITEMAP (uniquement des URL réellement disponibles et
 *  pertinentes — cf. cahier des charges) :
 *    - « / »                         → accueil Rozan (one-pager premium) ;
 *    - « /prestations/{slug} »       → 4 prestations actives (la route rend un
 *      gabarit complet même sans page SEO dédiée : repli éditorial) ;
 *    - pages LOCALES « /{slug} »     → landings villes réellement publiées.
 *
 *  VOLONTAIREMENT EXCLUS : « /reservation » (tunnel de conversion, métadonnées
 *  non tenant-aware → on évite tout conflit de canonique), « /avis » et
 *  « /contact » (rendues avec le shell STANDARD, non reliées au one-pager
 *  Rozan : les lister créerait des pages orphelines au chrome incohérent).
 *
 *  Conversion : les prestations Rozan pointent vers `booking_deposit` (moteur
 *  de réservation existant + acompte Stripe). C'est une propriété PAR PAGE :
 *  on pourra en changer une seule sans toucher au provider ni aux consommateurs.
 * ============================================================================
 */

import type { PublicServicePage, PublicSiteCatalog, PublicStaticPage } from "@/lib/public-site/types"
import {
  ROZAN_TENANT_SLUG,
  ROZAN_SERVICES,
  ROZAN_LOCAL_PAGES,
  getRozanServicePage,
  type RozanService,
} from "./content"

/** Projette une prestation éditoriale Rozan vers une page publique commune. */
function toPublicServicePage(s: RozanService): PublicServicePage {
  // Page SEO dédiée si elle existe ; sinon repli sur les champs de la carte
  // (exactement comme la route `/prestations/[service]`, qui rend le gabarit
  // avec un contenu de repli pour les prestations sans page dédiée).
  const page = getRozanServicePage(s.slug)
  return {
    slug: s.slug,
    published: s.active,
    inNavigation: true,
    navLabel: s.label,
    cardTitle: s.title,
    cardTagline: s.label,
    cardText: s.teaser,
    image: s.image ?? null,
    imageAlt: s.alt ?? null,
    metaTitle: page?.metaTitle ?? `${s.title} | Rozan Cleaning Services`,
    metaDescription: page?.metaDescription ?? s.teaser,
    h1: page?.h1 ?? s.title,
    breadcrumbLabel: s.label,
    // Rozan est transactionnel : réservation en ligne + acompte (Stripe). Le
    // pourcentage/montant de l'acompte reste piloté par l'admin du tenant.
    conversionMode: "booking_deposit",
    serviceRef: { editorialKey: s.slug },
    sitemapPriority: 0.8,
  }
}

/**
 * Catalogue public de Rozan. Fonction (et non constante) pour rester cohérent
 * avec un futur provider asynchrone côté tenants standards, sans changer les
 * consommateurs.
 */
export function getRozanPublicCatalog(): PublicSiteCatalog {
  // Pages LOCALES réellement publiées (landings villes). Ce sont des chemins
  // indexables de premier niveau (« /{slug} ») : on les expose via
  // `staticPages`, la forme générique « chemin indexable + priorité ».
  const localPages: PublicStaticPage[] = Object.values(ROZAN_LOCAL_PAGES).map((p) => ({
    path: `/${p.slug}`,
    sitemapPriority: 0.7,
  }))

  return {
    tenantSlug: ROZAN_TENANT_SLUG,
    staticPages: [{ path: "/", sitemapPriority: 1.0 }, ...localPages],
    servicePages: ROZAN_SERVICES.map(toPublicServicePage),
  }
}
