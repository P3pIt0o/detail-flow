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

/**
 * DÉCISIONS FINANCIÈRES CENTRALISÉES (fonction PURE).
 *
 * Plutôt que d'éparpiller des booléens dans la couche serveur et l'UI, on
 * regroupe ICI toutes les décisions de regroupabilité multi-devises. DetailFlow
 * ne convertit JAMAIS de change : chaque total n'est calculé que s'il porte sur
 * une devise unique et cohérente.
 *
 *  - `currentComparable`       : factures de la période courante en devise unique
 *    → CA, panier, séries, CA/prestation regroupables.
 *  - `previousComparable`      : factures de la période précédente en devise unique.
 *  - `periodsComparable`       : courante ET précédente regroupables ET DANS LA
 *    MÊME devise (ou précédente vide) → évolutions CA/panier autorisées. Une
 *    période courante EUR comparée à une précédente CHF ne produit JAMAIS de %.
 *  - `paymentsComparable`      : paiements de la période en devise unique → total
 *    encaissé (brut/remboursé/net) regroupable. Devise des PAIEMENTS résolue
 *    INDÉPENDAMMENT de celle des factures (elles peuvent différer).
 *  - `profitabilityComparable` : CA regroupable ET dans la devise comptable du
 *    tenant. Les achats produits (`productPurchases`) ne portent pas de devise :
 *    ils sont implicitement dans la devise comptable. On ne soustrait donc des
 *    coûts « comptables » d'un CA que si ce CA est dans la même devise.
 */
export type FinancialContext = {
  accountingCurrency: string | null
  currentComparable: boolean
  /** Devise d'affichage des totaux facturés (si `currentComparable`). */
  invoiceCurrency: string | null
  /** Devises facturées présentes sur la période courante (message UI). */
  invoiceCurrencies: string[]
  previousComparable: boolean
  periodsComparable: boolean
  paymentsComparable: boolean
  /** Devise d'affichage des encaissements (si `paymentsComparable`). */
  paymentsCurrency: string | null
  /** Devises de paiement présentes sur la période (message UI). */
  paymentCurrencies: string[]
  profitabilityComparable: boolean
}

/**
 * Résout le contexte financier d'une période à partir des devises présentes sur
 * les factures (courante/précédente) et les paiements. PURE et déterministe :
 * l'appelant serveur fournit des présences déjà scopées par tenant. `previous`
 * ou `payments` peuvent être `null` quand le bloc correspondant n'est pas chargé.
 */
export function resolveFinancialContext(input: {
  accountingCurrency: string | null | undefined
  current: CurrencyPresence
  previous?: CurrencyPresence | null
  payments?: CurrencyPresence | null
}): FinancialContext {
  const accounting = normalizeCurrencyCode(input.accountingCurrency) || null
  // Devise comptable EFFECTIVE pour les coûts implicites (repli EUR legacy).
  const effectiveAccounting = accounting ?? "EUR"

  const cur = resolveCurrencyContext({ accountingCurrency: accounting, presence: input.current })
  const prev = input.previous ? resolveCurrencyContext({ accountingCurrency: accounting, presence: input.previous }) : null
  const pay = input.payments ? resolveCurrencyContext({ accountingCurrency: accounting, presence: input.payments }) : null

  const currentComparable = !cur.mixed
  const previousComparable = prev ? !prev.mixed : false

  // Une période précédente VIDE (aucun document) est neutre en devise : la
  // comparaison reste licite (croissance depuis zéro). Sinon, il faut la MÊME
  // devise d'affichage que la période courante.
  const previousEmpty = prev ? prev.presentCurrencies.length === 0 : false
  const periodsComparable =
    currentComparable &&
    prev !== null &&
    previousComparable &&
    (previousEmpty || cur.displayCurrency === prev.displayCurrency)

  const invoiceCurrency = cur.displayCurrency
  // Devise du CA pour la rentabilité : à défaut de document, on retombe sur la
  // devise comptable effective (préserve le comportement legacy EUR).
  const invoiceForProfit = invoiceCurrency ?? effectiveAccounting
  const profitabilityComparable = currentComparable && invoiceForProfit === effectiveAccounting

  const paymentsComparable = pay ? !pay.mixed : false

  return {
    accountingCurrency: accounting,
    currentComparable,
    invoiceCurrency,
    invoiceCurrencies: cur.presentCurrencies,
    previousComparable,
    periodsComparable,
    paymentsComparable,
    paymentsCurrency: pay?.displayCurrency ?? null,
    paymentCurrencies: pay?.presentCurrencies ?? [],
    profitabilityComparable,
  }
}
