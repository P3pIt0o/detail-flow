/**
 * Module Analyse — DEVISE COMPTABLE & AGRÉGATION MULTI-DEVISES (fonction PURE).
 *
 * DetailFlow ne fait AUCUNE conversion de change (pas de taux FX, jamais). Il
 * est donc INTERDIT d'additionner des montants de devises différentes (ex.
 * 500 EUR + 300 CHF ≠ 800). Ce module décide, à partir des devises réellement
 * présentes sur la période, s'il est légitime de regrouper les totaux
 * financiers et dans quelle devise les afficher.
 *
 * Règles (cohérentes avec le système de facturation existant) :
 *  - un document porte une devise EXPLICITE (`invoices.currencyCode`) ou est
 *    LEGACY (`currencyCode` NULL/vide) ;
 *  - un document legacy est replié sur la devise comptable du tenant, ou à
 *    défaut sur EUR — exactement le comportement historique de `formatMoney`
 *    (NULL → EUR) et de `resolveDraftCurrency` (devise vendeur confirmée) ;
 *  - on calcule l'ensemble des devises EFFECTIVES distinctes présentes ;
 *  - une seule devise effective → totaux regroupables, affichés dans cette
 *    devise ;
 *  - deux devises effectives ou plus → INCOMPATIBLE : on NE regroupe PAS les
 *    totaux financiers (l'UI affiche un état explicite). Les métriques non
 *    financières (rendez-vous, clients, conversion) restent valides.
 *
 * Aucune I/O : l'appelant serveur fournit les devises présentes déjà scopées
 * par tenant.
 */

/** Normalise un code devise : trim + majuscules, `""` si absent/vide. */
export function normalizeCurrencyCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase()
}

export type CurrencyPresence = {
  /** Codes ISO explicites (non NULL) rencontrés sur la période, bruts. */
  explicitCodes: (string | null | undefined)[]
  /** Au moins un document LEGACY sans devise (`currencyCode` NULL/vide). */
  hasLegacy: boolean
}

export type CurrencyContext = {
  /**
   * Devise comptable résolue du tenant (profil de facturation confirmé), ou
   * `null` si non confirmée → repli EUR legacy à l'affichage.
   */
  accountingCurrency: string | null
  /**
   * `true` si plusieurs devises effectives incompatibles sont présentes : les
   * totaux financiers ne doivent PAS être regroupés (aucune conversion FX).
   */
  mixed: boolean
  /**
   * Devise dans laquelle afficher les totaux quand `mixed` est faux. `null`
   * (cas legacy sans devise confirmée) → `formatMoney` retombe sur EUR.
   * Toujours `null` quand `mixed` est vrai (rien n'est regroupable).
   */
  displayCurrency: string | null
  /** Devises effectives distinctes présentes (triées) — pour le message UI. */
  presentCurrencies: string[]
}

/**
 * Résout le contexte devise d'une période à partir de la devise comptable du
 * tenant et des devises réellement présentes sur les documents comptés dans le
 * CA. PURE et déterministe.
 */
export function resolveCurrencyContext(input: {
  accountingCurrency: string | null | undefined
  presence: CurrencyPresence
}): CurrencyContext {
  const accounting = normalizeCurrencyCode(input.accountingCurrency)
  const accountingCurrency = accounting || null
  // Devise de repli des documents legacy : devise comptable confirmée, sinon
  // EUR (comportement historique NULL → EUR).
  const legacyFold = accounting || "EUR"

  const effective = new Set<string>()
  for (const raw of input.presence.explicitCodes) {
    const code = normalizeCurrencyCode(raw)
    if (code) effective.add(code)
  }
  if (input.presence.hasLegacy) effective.add(legacyFold)

  const presentCurrencies = [...effective].sort()
  const mixed = presentCurrencies.length >= 2

  // Aucun document : on affiche 0 dans la devise comptable (ou EUR legacy).
  const displayCurrency = mixed ? null : (presentCurrencies[0] ?? accountingCurrency)

  return { accountingCurrency, mixed, displayCurrency, presentCurrencies }
}
