/**
 * ============================================================================
 *  MODE DE PAIEMENT EN LIGNE — logique PURE, partagée & testable
 * ============================================================================
 *  Le mode est stocké dans `companies.paymentMode` (colonne text, défaut
 *  "none") : ajouter "choice" ne nécessite AUCUNE migration. Ce module
 *  centralise la normalisation + la résolution du type encaissé pour éviter que
 *  la même union soit dupliquée (et dérive) dans config/queries/actions/UI.
 * ============================================================================
 */

import type { PaymentType } from "./types"

/** Modes disponibles. "choice" = le client choisit acompte OU intégral. */
export const PAYMENT_MODES = ["none", "deposit", "full", "choice"] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

/** Montant minimum encaissable par Stripe pour l'EUR (0,50 €). */
export const STRIPE_MIN_CENTS = 50

/** Normalise une valeur inconnue (base ou navigateur) vers un mode sûr. */
export function normalizePaymentMode(value: unknown): PaymentMode {
  return typeof value === "string" && (PAYMENT_MODES as readonly string[]).includes(value)
    ? (value as PaymentMode)
    : "none"
}

/**
 * Résout le TYPE réellement encaissé selon le mode tenant (autorité serveur)
 * et, uniquement en mode "choice", le choix client (revalidé, jamais de confiance
 * aveugle). Retourne `null` quand aucun paiement en ligne ne s'applique.
 */
export function resolveCheckoutType(
  mode: PaymentMode,
  chosenType?: PaymentType | null,
): PaymentType | null {
  if (mode === "deposit") return "deposit"
  if (mode === "full") return "full_payment"
  // "choice" : seules les deux valeurs connues sont acceptées ; par défaut on
  // retombe sur le paiement intégral (jamais un acompte non demandé).
  if (mode === "choice") return chosenType === "deposit" ? "deposit" : "full_payment"
  return null
}

/**
 * Montant maximal encaissable en ligne pour ce mode. Le paiement intégral est
 * toujours proposé (sauf mode acompte strict), c'est donc le total qui borne.
 */
export function maxOnlinePayableCents(mode: PaymentMode, depositCents: number, totalCents: number): number {
  if (mode === "deposit") return depositCents
  if (mode === "full" || mode === "choice") return totalCents
  return 0
}

/**
 * Vrai si un paiement en ligne EFFECTIF sera demandé au client : mode actif,
 * compte prêt à encaisser, ET montant encaissable ≥ minimum Stripe.
 *
 * Sert à décider l'envoi de l'email de confirmation À LA CRÉATION : quand un
 * paiement en ligne est requis, la SEULE confirmation client/pro provient du
 * webhook signé après encaissement (email unique, plus de doublon). Sinon
 * (tenant hors-ligne, ou montant sous le minimum Stripe non encaissable), on
 * envoie la confirmation de création classique (comportement historique).
 */
export function willRequireOnlinePayment(input: {
  paymentsReady: boolean
  mode: PaymentMode
  depositCents: number
  totalCents: number
}): boolean {
  if (!input.paymentsReady || input.mode === "none") return false
  return maxOnlinePayableCents(input.mode, input.depositCents, input.totalCents) >= STRIPE_MIN_CENTS
}
