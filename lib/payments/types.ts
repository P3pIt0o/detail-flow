/**
 * ============================================================================
 *  PAIEMENTS — TYPES GÉNÉRIQUES (indépendants du provider)
 * ============================================================================
 *  Le métier DetailFlow ne dépend JAMAIS de Stripe : il manipule uniquement ces
 *  types. Ajouter un provider (SumUp…) = implémenter `PaymentProvider` sans
 *  toucher au tunnel, aux réservations, aux statuts, à l'historique ni aux
 *  commissions.
 * ============================================================================
 */

/** Fournisseurs de paiement connus (seul "stripe" est implémenté en V1). */
export type PaymentProviderId = "stripe" | "sumup"

/** Type de paiement demandé au client. */
export type PaymentType = "deposit" | "full_payment"

/** Statut GÉNÉRIQUE DetailFlow (les statuts Stripe y sont traduits). */
export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded"

/** Capacités déclarées d'un provider (tous n'offrent pas tout). */
export type ProviderCapabilities = {
  supportsOnlinePayments: boolean
  supportsPlatformFees: boolean
  supportsRefunds: boolean
  supportsPartialRefunds: boolean
  supportsDeposits: boolean
}

/** Entrée générique pour créer un encaissement. Montants en centimes. */
export type CreatePaymentInput = {
  /** Compte connecté du professionnel chez le provider (isolation tenant). */
  connectedAccountId: string
  amountCents: number
  currency: string
  /** Commission plateforme à prélever sur les fonds du professionnel. */
  applicationFeeCents: number
  description: string
  /** Rattachement métier (repris tel quel dans les métadonnées provider). */
  metadata: Record<string, string>
  /** Redirection après paiement (la vérité vient toujours du webhook). */
  returnUrl: string
}

/** Résultat de création d'un encaissement (checkout). */
export type CreatePaymentResult = {
  externalId: string
  /** Secret client pour Checkout embarqué (jamais une clé secrète). */
  clientSecret: string
}

/** Options d'un remboursement provider. */
export type RefundOptions = {
  /** Montant à rembourser (centimes). Absent = remboursement intégral. */
  amountCents?: number
  /** Clé d'idempotence STABLE (anti double création côté provider). */
  idempotencyKey?: string
  /**
   * Restituer la commission plateforme (Direct Charges). À n'activer QUE si une
   * application fee strictement positive existe sur le paiement — sinon Stripe
   * rejette la requête (« There is no application fee to refund »). Jamais de
   * commission inventée.
   */
  refundApplicationFee?: boolean
}

/** Résultat générique d'un remboursement provider. */
export type RefundResult = {
  /** Identifiant du remboursement chez le provider (ex. Stripe `re_...`). */
  externalRefundId: string
  /** Statut BRUT du provider (traduit ensuite via mapStripeRefundStatus). */
  providerStatus: string | null
}

/** Abstraction minimale d'un provider de paiement. */
export interface PaymentProvider {
  readonly id: PaymentProviderId
  readonly capabilities: ProviderCapabilities
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  /**
   * Rembourse (total ou partiel) un paiement chez le provider, DANS LE CONTEXTE
   * du compte connecté (Direct Charges). Idempotent via `options.idempotencyKey`.
   */
  refundPayment(
    externalId: string,
    connectedAccountId: string,
    options?: RefundOptions,
  ): Promise<RefundResult>
}

/** Calcule la commission plateforme (centimes) à partir d'un taux en bps. */
export function computePlatformFeeCents(grossAmountCents: number, feeBps: number): number {
  return Math.round((grossAmountCents * feeBps) / 10_000)
}

/** Formate un taux en bps vers un pourcentage lisible (300 → "3"). */
export function formatFeeBpsPercent(feeBps: number): string {
  const pct = feeBps / 100
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "")
}
