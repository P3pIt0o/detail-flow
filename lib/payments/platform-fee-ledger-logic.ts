/**
 * Logique PURE du registre de commissions plafonnées (sans DB, sans Stripe).
 * Consommée par lib/payments/platform-fee-ledger.ts.
 */

/** Fenêtre pendant laquelle une même tentative logique est réutilisée. */
export const CHECKOUT_ATTEMPT_WINDOW_MS = 10 * 60 * 1000

/**
 * Clé de tentative logique : même tenant, même réservation, même type, même
 * montant, dans la même fenêtre → une seule réservation de commission (double
 * clic, retry réseau). Aucune donnée venant du navigateur hormis ce qui a déjà
 * été revalidé côté serveur (type/montant relus en base).
 */
export function buildCheckoutAttemptKey(input: {
  companyId: number
  bookingId: number
  type: string
  grossAmountCents: number
  now: Date
}): string {
  const bucket = Math.floor(input.now.getTime() / CHECKOUT_ATTEMPT_WINDOW_MS)
  return `checkout:${input.companyId}:${input.bookingId}:${input.type}:${input.grossAmountCents}:${bucket}`
}

/**
 * Clé d'idempotence Stripe dérivée de la réservation : deux appels concurrents
 * partageant la réservation obtiennent la MÊME session Stripe ; une nouvelle
 * réservation (après libération) obtient une nouvelle clé.
 */
export function buildCheckoutIdempotencyKey(reservationId: number): string {
  return `df-booking-checkout-res-${reservationId}`
}

/**
 * Montant à libérer du plafond suite à la restitution RÉELLE d'une application
 * fee. `refundedTotalCents` est le CUMUL restitué rapporté par Stripe
 * (ApplicationFee.amount_refunded), jamais une estimation ni un delta :
 * rejouer la même valeur libère 0 (idempotent).
 */
export function computeRefundReleaseDeltaCents(input: {
  reservedCents: number
  alreadyReleasedCents: number
  refundedTotalCents: number
}): number {
  const reserved = Math.max(0, Math.floor(input.reservedCents))
  const already = Math.min(reserved, Math.max(0, Math.floor(input.alreadyReleasedCents)))
  const target = Math.min(reserved, Math.max(0, Math.floor(input.refundedTotalCents)))
  return Math.max(0, target - already)
}
