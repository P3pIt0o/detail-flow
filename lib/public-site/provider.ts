/**
 * ============================================================================
 *  FOURNISSEUR DE CATALOGUE PUBLIC + SÉLECTEURS (source de vérité unique)
 * ============================================================================
 *
 *  `getPublicSiteCatalog(key)` renvoie le catalogue public d'un tenant, ou
 *  `null` si le tenant n'expose pas (encore) de catalogue via cette couche —
 *  repli sûr : l'appelant se comporte alors comme aujourd'hui (site standard).
 *
 *  ÉTAT ACTUEL : seul « spirit-acs » possède un catalogue, ADAPTÉ depuis sa
 *  configuration éditoriale typée (aucune donnée dupliquée). La future V2 des
 *  sites standards branchera ici un catalogue construit à partir des réglages
 *  admin du tenant — SANS changer les consommateurs (sitemap, route, nav…).
 *
 *  Les sélecteurs ci-dessous sont PURS : ils garantissent que « une page
 *  indisponible » n'apparaît jamais dans la navigation, l'accueil, le maillage
 *  ni le sitemap, à partir d'une seule et même source.
 * ============================================================================
 */

import type { PublicServicePage, PublicSiteCatalog } from "./types"
import { getSpiritPublicCatalog } from "@/components/custom-sites/spirit-acs/public-catalog"

/**
 * Catalogue public d'un tenant à partir de sa clé de site personnalisé
 * (`customSiteKey`). `null` = pas de catalogue dédié → comportement standard.
 *
 * NB : accepte la clé de site personnalisé (résolue serveur), jamais un
 * `companyId` venant du navigateur.
 */
export function getPublicSiteCatalog(key: string | null | undefined): PublicSiteCatalog | null {
  const k = (key ?? "").trim()
  if (k === "spirit-acs") return getSpiritPublicCatalog()
  return null
}

/* -------------------------------------------------------------------------- */
/*  SÉLECTEURS PURS — à consommer par TOUTES les surfaces publiques           */
/* -------------------------------------------------------------------------- */

/** Pages de prestations publiées (indexables/rendables). */
export function listPublishedServicePages(catalog: PublicSiteCatalog): PublicServicePage[] {
  return catalog.servicePages.filter((p) => p.published)
}

/** Pages de prestations à afficher en navigation (publiées ET en nav). */
export function listNavigationServicePages(catalog: PublicSiteCatalog): PublicServicePage[] {
  return catalog.servicePages.filter((p) => p.published && p.inNavigation)
}

/** Page de prestation publiée par slug, ou `null` (slug inconnu/non publié). */
export function findPublishedServicePage(
  catalog: PublicSiteCatalog,
  slug: string | null | undefined,
): PublicServicePage | null {
  const s = (slug ?? "").trim()
  if (!s) return null
  return catalog.servicePages.find((p) => p.slug === s && p.published) ?? null
}

/**
 * Maillage interne : autres pages publiées, hors `slug` courant. `limit`
 * optionnel pour borner l'affichage (ex. « services liés »).
 */
export function listRelatedServicePages(
  catalog: PublicSiteCatalog,
  slug: string,
  limit?: number,
): PublicServicePage[] {
  const others = listPublishedServicePages(catalog).filter((p) => p.slug !== slug)
  return typeof limit === "number" ? others.slice(0, limit) : others
}

/** Chemins publics indexables (statiques + prestations publiées) pour le sitemap. */
export function listSitemapPaths(catalog: PublicSiteCatalog): Array<{ path: string; priority: number }> {
  const statics = catalog.staticPages.map((p) => ({ path: p.path, priority: p.sitemapPriority }))
  const services = listPublishedServicePages(catalog).map((p) => ({
    path: `/prestations/${p.slug}`,
    priority: p.sitemapPriority,
  }))
  return [...statics, ...services]
}
