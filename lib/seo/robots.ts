/**
 * Politique d'indexation PURE des pages publiques par tenant (aucune I/O).
 *
 * Décide si une page publique doit être indexée par les moteurs de recherche.
 * Isolée ici pour être testable sans DB et réutilisable côté serveur.
 *
 * RÈGLE (non-régression garantie) :
 *  - Hors contexte tenant (vitrine racine)      → aucune directive (inchangé).
 *  - Site personnalisé (Spirit ACS, Rozan, …)   → aucune directive (indexé
 *    comme historiquement).
 *  - Site avec la feature `website` (offres      → aucune directive (indexé
 *    payantes, LIFETIME)                            comme historiquement).
 *  - Tenant self-service (page publique standard) :
 *      • publié ET indexation autorisée          → aucune directive (indexé).
 *      • publié MAIS indexation refusée           → noindex (accessible par
 *        lien, mais hors index) ; `follow` conservé.
 *      • brouillon (jamais publié) / aperçu       → noindex, nofollow.
 *
 * Renvoyer `null` signifie « ne pose aucune directive robots » → héritage du
 * comportement par défaut (indexable), STRICTEMENT identique à l'existant.
 */

export type PublicRobotsInput = {
  /** Un tenant est-il résolu pour la requête ? (false = vitrine racine) */
  hasTenant: boolean
  /** Le tenant a-t-il un rendu personnalisé (customSiteKey non nul) ? */
  isCustomSite: boolean
  /** Le tenant porte-t-il la feature de licence `website` ? */
  hasWebsiteFeature: boolean
  /** La page publique standard est-elle publiée (publishedAt posé) ? */
  isPublished: boolean
  /** L'indexation a-t-elle été explicitement autorisée dans le configurateur ? */
  seoIndexable: boolean
}

/** Directive robots minimale consommable par le champ `robots` de Next Metadata. */
export type RobotsDirective = { index: boolean; follow: boolean }

/**
 * Calcule la directive robots d'une page publique, ou `null` si aucune ne doit
 * être posée (comportement historique = indexable).
 */
export function resolvePublicRobots(input: PublicRobotsInput): RobotsDirective | null {
  // Vitrine racine, sites personnalisés et sites `website` : inchangés.
  if (!input.hasTenant) return null
  if (input.isCustomSite) return null
  if (input.hasWebsiteFeature) return null

  // Tenant self-service (page publique standard).
  if (input.isPublished && input.seoIndexable) return null

  // Brouillon → aucun suivi ; publié-mais-non-indexable → suivi conservé.
  return { index: false, follow: input.isPublished }
}
