/**
 * Logique PURE de remboursement (aucune dépendance base/serveur/Stripe).
 *
 * C'est la SOURCE DE VÉRITÉ des règles financières de remboursement, isolée ici
 * pour être testable unitairement sans base ni réseau. Le moteur serveur
 * (`lib/payments/refunds.ts`) et le webhook consomment ces fonctions.
 *
 * Règles clés :
 *  - montants en CENTIMES entiers (aucun flottant) ;
 *  - jamais rembourser plus que le montant réellement payé ;
 *  - plusieurs remboursements partiels autorisés dans la limite du brut ;
 *  - les remboursements en cours (pending/requested) SONT réservés pour éviter
 *    tout dépassement en cas de concurrence ;
 *  - le paiement d'origine n'est jamais modifié/supprimé (agrégat recalculé).
 */

/** Statut GÉNÉRIQUE DetailFlow d'un remboursement (indépendant de Stripe). */
export type RefundStatus = "requested" | "pending" | "succeeded" | "failed" | "canceled"

/** Statuts qui « réservent » du montant (empêchent un sur-remboursement). */
export const RESERVING_REFUND_STATUSES: readonly RefundStatus[] = [
  "requested",
  "pending",
  "succeeded",
]

/** Statuts d'un paiement sur lequel un remboursement est envisageable. */
export const REFUNDABLE_PAYMENT_STATUSES = ["paid", "partially_refunded"] as const

export type RefundValidationError =
  | "reason_required"
  | "invalid_amount"
  | "payment_not_refundable"
  | "already_refunded"
  | "exceeds_refundable"

export type RefundValidationResult =
  | { ok: true; amountCents: number }
  | { ok: false; error: RefundValidationError }

/**
 * Montant encore remboursable = brut − (déjà remboursé + en cours).
 * Ne descend jamais sous 0.
 */
export function refundableCents(input: {
  grossAmountCents: number
  reservedCents: number
}): number {
  return Math.max(0, input.grossAmountCents - input.reservedCents)
}

/**
 * Valide une demande de remboursement côté serveur (jamais côté navigateur).
 * `reservedCents` DOIT être la somme des remboursements réservés (requested/
 * pending/succeeded) déjà en base pour ce paiement — calculée sous verrou.
 */
export function validateRefundRequest(input: {
  paymentStatus: string
  grossAmountCents: number
  reservedCents: number
  amountCents: number
  reason: string | null | undefined
}): RefundValidationResult {
  const { paymentStatus, grossAmountCents, reservedCents, amountCents } = input

  // Motif OBLIGATOIRE (jamais de donnée bancaire/personnelle attendue ici).
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: "reason_required" }
  }
  // Paiement réellement encaissable/remboursable.
  if (!(REFUNDABLE_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
    return { ok: false, error: "payment_not_refundable" }
  }
  // Montant : entier strictement positif, en centimes.
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "invalid_amount" }
  }
  const remaining = refundableCents({ grossAmountCents, reservedCents })
  if (remaining <= 0) {
    return { ok: false, error: "already_refunded" }
  }
  if (amountCents > remaining) {
    return { ok: false, error: "exceeds_refundable" }
  }
  return { ok: true, amountCents }
}

/** Traduit un statut Stripe Refund vers le statut GÉNÉRIQUE DetailFlow. */
export function mapStripeRefundStatus(stripeStatus: string | null | undefined): RefundStatus {
  switch (stripeStatus) {
    case "succeeded":
      return "succeeded"
    case "failed":
      return "failed"
    case "canceled":
      return "canceled"
    case "pending":
    case "requires_action":
      return "pending"
    default:
      return "pending"
  }
}

/**
 * Recalcule l'AGRÉGAT porté par le paiement à partir des remboursements
 * RÉELLEMENT réussis (jamais un incrément : idempotent même en cas de rejeu de
 * webhook ou d'événements reçus dans le désordre).
 *
 * - `refundedAmountCents` = somme des remboursements `succeeded` (borné au brut) ;
 * - `status` : `refunded` si tout est remboursé, `partially_refunded` si une
 *   partie l'est, sinon `paid` (inchangé) ;
 * - `fullyRefunded` : utile pour la présentation (« Remboursé »).
 */
export function computePaymentRefundAggregate(input: {
  grossAmountCents: number
  succeededRefundCents: number
}): { refundedAmountCents: number; status: "paid" | "partially_refunded" | "refunded"; fullyRefunded: boolean } {
  const refundedAmountCents = Math.max(0, Math.min(input.succeededRefundCents, input.grossAmountCents))
  if (refundedAmountCents <= 0) {
    return { refundedAmountCents: 0, status: "paid", fullyRefunded: false }
  }
  if (refundedAmountCents >= input.grossAmountCents) {
    return { refundedAmountCents, status: "refunded", fullyRefunded: true }
  }
  return { refundedAmountCents, status: "partially_refunded", fullyRefunded: false }
}

/**
 * Décide si l'on doit demander à Stripe la restitution de la commission
 * plateforme (`refund_application_fee`). VRAI uniquement si une application fee
 * STRICTEMENT POSITIVE existe sur le paiement. Nulle/absente ⇒ FAUX (sinon
 * Stripe rejette la requête). Aucune commission n'est jamais inventée.
 */
export function shouldRefundApplicationFee(applicationFeeCents: number | null | undefined): boolean {
  return Number(applicationFeeCents ?? 0) > 0
}

/**
 * Informations d'erreur Stripe SÛRES à journaliser / stocker (jamais de clé API,
 * de données de carte, d'e-mail ou d'information personnelle).
 */
export type SafeStripeError = {
  type?: string
  code?: string
  declineCode?: string
  requestId?: string
}

/** Extrait uniquement des champs non sensibles d'une erreur Stripe. */
export function extractSafeStripeError(e: unknown): SafeStripeError {
  const err = e as { type?: unknown; code?: unknown; decline_code?: unknown; requestId?: unknown }
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined)
  return {
    type: str(err?.type),
    code: str(err?.code),
    declineCode: str(err?.decline_code),
    requestId: str(err?.requestId),
  }
}

/**
 * Traduit une erreur Stripe (champs sûrs + message) vers un CODE applicatif
 * stable, utilisé pour choisir un message UI précis. On ne stocke jamais le
 * message brut ; il ne sert qu'au classement. Le message de « solde insuffisant »
 * n'est renvoyé QUE si Stripe le confirme (`balance_insufficient`).
 */
export function classifyStripeRefundError(safe: SafeStripeError, rawMessage?: string): string {
  const code = safe.code
  const type = safe.type
  const msg = (rawMessage ?? "").toLowerCase()

  if (code === "balance_insufficient") return "insufficient_funds"
  if (code === "charge_already_refunded") return "already_refunded_stripe"
  // Commission absente : ne devrait plus arriver (on n'envoie plus le flag sans
  // fee > 0), mais on le classe proprement au cas où.
  if (msg.includes("application fee")) return "no_application_fee"
  if (msg.includes("greater than") || msg.includes("amount")) return "amount_too_large"
  if (type === "idempotency_error") return "idempotency_conflict"
  if (type === "rate_limit_error" || type === "api_connection_error" || type === "api_error") return "temporary"
  return "stripe_error"
}

/** Libellé FR court pour l'affichage d'un statut de remboursement. */
export function refundStatusLabel(status: RefundStatus): string {
  switch (status) {
    case "requested":
      return "Demandé"
    case "pending":
      return "En cours"
    case "succeeded":
      return "Remboursé"
    case "failed":
      return "Échoué"
    case "canceled":
      return "Annulé"
  }
}
