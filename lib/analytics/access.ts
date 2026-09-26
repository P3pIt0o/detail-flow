/**
 * Module Analyse — RÉSOLUTION DES NIVEAUX D'ACCÈS (fonction PURE).
 *
 * Traduit les 3 features du moteur central en sections affichables. Le SERVEUR
 * décide de charger (ou non) les données de chaque niveau à partir de ce
 * résultat — jamais en chargeant tout puis en masquant côté React.
 *
 * Correspondance (cf. moteur central + offres) :
 *  - `business_stats`         → essentiels (CA facturé, RDV, panier, clients,
 *                               aperçu visites, encaissements) ;
 *  - `profitability_analysis` → rentabilité estimée ;
 *  - `advanced_reporting`     → analyses avancées (comparaisons de périodes,
 *                               nouveaux vs récurrents, prestations, CA par
 *                               prestation, conversion site, insights).
 *
 * `advanced_reporting` implique l'affichage des essentiels (une offre Ultime
 * voit forcément les indicateurs de base). Les droits eux-mêmes viennent
 * TOUJOURS de `canUseFeature()` (jamais d'un `if (plan === ...)`).
 */

export type AnalyseFeatures = {
  businessStats: boolean
  profitability: boolean
  advanced: boolean
}

export type AnalyseAccess = {
  /** Aucun droit → page « verrouillée » (jamais une 404). */
  locked: boolean
  showEssentials: boolean
  showProfitability: boolean
  showAdvanced: boolean
}

export function resolveAnalyseAccess(f: AnalyseFeatures): AnalyseAccess {
  const showEssentials = f.businessStats || f.advanced
  const showProfitability = f.profitability
  const showAdvanced = f.advanced
  return {
    locked: !showEssentials && !showProfitability && !showAdvanced,
    showEssentials,
    showProfitability,
    showAdvanced,
  }
}
