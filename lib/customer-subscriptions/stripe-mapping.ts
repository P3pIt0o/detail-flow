/**
 * Règles PURES Stripe ↔ abonnements clients (aucun réseau, aucune DB).
 * Construit les paramètres Checkout depuis les SNAPSHOTS du contrat (jamais
 * le prix courant de la formule) et décide des transitions métier. Le statut
 * Stripe n'est JAMAIS recopié tel quel dans le statut DetailFlow.
 *
 * Commissions : uniquement plan-policy.ts via resolvePlatformFeeBps /
 * computePlatformFeeAmountCents — jamais lib/billing/commercial-rules.ts.
 */
import { CustomerSubscriptionError } from "./errors"
import { computePlatformFeeAmountCents, computePrepaidTotalCents } from "./contract"

export const CUSTOMER_SUBSCRIPTION_MODULE = "customer_subscription"

export type CheckoutKind = "recurring" | "prepaid" | "initial_cleaning"

export type ContractForCheckout = {
  id: number
  companyId: number
  status: string
  paymentMode: string
  currency: string
  planNameSnapshot: string
  priceCentsSnapshot: number
  billingIntervalUnitSnapshot: string
  billingIntervalCountSnapshot: number
  prepaidBillingCyclesSnapshot: number | null
  initialCleaningRequiredSnapshot: boolean
  initialServiceNameSnapshot: string | null
  initialServicePriceCentsSnapshot: number | null
  customerEmail: string
  externalCustomerId: string | null
}

/** Quel paiement le contrat attend maintenant (null = aucun checkout autorisé). */
export function resolveCheckoutKind(sub: Pick<ContractForCheckout, "status" | "paymentMode" | "initialCleaningRequiredSnapshot" | "initialServicePriceCentsSnapshot">): CheckoutKind | null {
  if (sub.status === "pending_initial_cleaning") {
    return sub.initialCleaningRequiredSnapshot && (sub.initialServicePriceCentsSnapshot ?? 0) > 0 ? "initial_cleaning" : null
  }
  if (sub.status === "pending_payment") {
    if (sub.paymentMode === "recurring") return "recurring"
    if (sub.paymentMode === "prepaid") return "prepaid"
  }
  return null
}

/** 700 bps → 7 ; 0 → null (paramètre omis). */
export function feePercentFromBps(bps: number): number | null {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new CustomerSubscriptionError("INTERNAL_ERROR")
  return bps === 0 ? null : bps / 100
}

export function bpsFromFeePercent(percent: number | null | undefined): number | null {
  if (percent == null || !Number.isFinite(percent)) return null
  return Math.round(percent * 100)
}

/**
 * Clé Stripe DÉTERMINISTE par tentative logique (nouvelle tentative = dérivée
 * de la session expirée). Le taux fait partie de la clé : un changement de plan
 * DetailFlow entre deux tentatives produit des paramètres différents, donc une
 * clé différente (sinon Stripe rejetterait la réutilisation de clé).
 */
export function checkoutIdempotencyKey(input: { companyId: number; subscriptionId: number; kind: CheckoutKind; previousSessionId: string | null; platformFeeBps: number }): string {
  return `df-cs:${input.companyId}:${input.subscriptionId}:${input.kind}:${input.previousSessionId ?? "first"}:${input.platformFeeBps}`
}

export type CheckoutMetadata = Record<string, string>

export function buildCheckoutMetadata(sub: Pick<ContractForCheckout, "id" | "companyId">, kind: CheckoutKind, platformFeeBps: number): CheckoutMetadata {
  return {
    detailflowModule: CUSTOMER_SUBSCRIPTION_MODULE,
    maintenanceSubscriptionId: String(sub.id),
    companyId: String(sub.companyId),
    paymentType: kind,
    detailflowPlatformFeeBps: String(platformFeeBps),
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- forme Stripe.Checkout.SessionCreateParams, typée au niveau adapter */
export type CheckoutSessionParams = Record<string, any>

/**
 * Paramètres Checkout depuis les snapshots. `platformFeeBps` = plan EFFECTIF
 * résolu à l'instant (resolveCurrentCustomerSubscriptionFee).
 */
/**
 * Décision commerciale : le nettoyage initial n'est PAS soumis à la commission
 * customer_subscriptions (0 %, aucun application_fee_amount). recurring et
 * prepaid suivent le plan effectif (plan-policy.ts, inchangé).
 */
export function platformFeeBpsForPaymentType(kind: CheckoutKind, planFeeBps: number): number {
  return kind === "initial_cleaning" ? 0 : planFeeBps
}

export function buildCheckoutSessionParams(
  sub: ContractForCheckout,
  kind: CheckoutKind,
  planFeeBps: number,
  returnUrl: string,
): { params: CheckoutSessionParams; grossAmountCents: number; platformFeeAmountCents: number; platformFeeBps: number } {
  const platformFeeBps = platformFeeBpsForPaymentType(kind, planFeeBps)
  const currency = sub.currency.toLowerCase()
  const metadata = buildCheckoutMetadata(sub, kind, platformFeeBps)
  const customer = sub.externalCustomerId ? { customer: sub.externalCustomerId } : { customer_email: sub.customerEmail }
  // V1 : carte uniquement (compatible récurrence, pas de moyen asynchrone non traité).
  const base = { ui_mode: "embedded_page", return_url: returnUrl, metadata, payment_method_types: ["card"], ...customer }

  if (kind === "recurring") {
    const unit = sub.billingIntervalUnitSnapshot
    if (unit !== "week" && unit !== "month") throw new CustomerSubscriptionError("INVALID_INTERVAL")
    if (!Number.isInteger(sub.billingIntervalCountSnapshot) || sub.billingIntervalCountSnapshot <= 0) throw new CustomerSubscriptionError("INVALID_INTERVAL")
    const percent = feePercentFromBps(platformFeeBps)
    return {
      platformFeeBps,
      grossAmountCents: sub.priceCentsSnapshot,
      platformFeeAmountCents: computePlatformFeeAmountCents(sub.priceCentsSnapshot, platformFeeBps),
      params: {
        ...base,
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: sub.priceCentsSnapshot,
              // 4 semaines = week × 4, jamais « 1 mois ».
              recurring: { interval: unit, interval_count: sub.billingIntervalCountSnapshot },
              product_data: { name: sub.planNameSnapshot },
            },
          },
        ],
        subscription_data: { metadata, ...(percent != null ? { application_fee_percent: percent } : {}) },
      },
    }
  }

  let gross: number
  let name: string
  if (kind === "prepaid") {
    if (!sub.prepaidBillingCyclesSnapshot) throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE")
    gross = computePrepaidTotalCents(sub.priceCentsSnapshot, sub.prepaidBillingCyclesSnapshot)
    name = sub.planNameSnapshot
  } else {
    gross = sub.initialServicePriceCentsSnapshot ?? 0
    name = sub.initialServiceNameSnapshot ?? sub.planNameSnapshot
    if (gross <= 0) throw new CustomerSubscriptionError("CHECKOUT_NOT_ALLOWED")
  }
  const fee = computePlatformFeeAmountCents(gross, platformFeeBps)
  return {
    platformFeeBps,
    grossAmountCents: gross,
    platformFeeAmountCents: fee,
    params: {
      ...base,
      mode: "payment",
      // Customer Stripe créé pour être réutilisé au checkout récurrent.
      ...(sub.externalCustomerId ? {} : { customer_creation: "always" }),
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: gross, product_data: { name } } }],
      payment_intent_data: { metadata, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------ Extraction ------------------------------- */

export type InvoiceLike = {
  id: string
  status?: string | null
  currency?: string | null
  amount_due?: number | null
  amount_paid?: number | null
  total?: number | null
  application_fee_amount?: number | null
  metadata?: Record<string, string> | null
  created?: number | null
  status_transitions?: { paid_at?: number | null } | null
  parent?: { subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> | null } | null } | null
  lines?: { data?: Array<{ period?: { start?: number; end?: number } | null }> } | null
  payments?: { data?: Array<{ payment?: { payment_intent?: string | { id: string } | null } | null }> } | null
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : v?.id ?? null)

export function invoiceSubscriptionId(inv: InvoiceLike): string | null {
  return idOf(inv.parent?.subscription_details?.subscription)
}

export function invoiceMetadata(inv: InvoiceLike): Record<string, string> | null {
  return inv.parent?.subscription_details?.metadata ?? null
}

/** Période Stripe RÉELLE facturée (ligne d'abonnement), pas Date.now(). */
export function invoicePeriod(inv: InvoiceLike): { start: Date; end: Date } | null {
  const p = inv.lines?.data?.find((l) => l.period?.start && l.period?.end)?.period
  if (!p?.start || !p?.end || p.end <= p.start) return null
  return { start: new Date(p.start * 1000), end: new Date(p.end * 1000) }
}

/** Point milieu de période : robuste à une dérive de quelques secondes entre Stripe et l'ancre locale. */
export function periodProbe(period: { start: Date; end: Date }): Date {
  return new Date(period.start.getTime() + Math.floor((period.end.getTime() - period.start.getTime()) / 2))
}

export function invoicePaymentIntentId(inv: InvoiceLike): string | null {
  for (const p of inv.payments?.data ?? []) {
    const id = idOf(p.payment?.payment_intent)
    if (id) return id
  }
  return null
}

/** Métadonnées ids (indices de recherche UNIQUEMENT, toujours re-vérifiés en DB + event.account). */
export function parseModuleMetadata(meta: Record<string, string> | null | undefined): { subscriptionId: number; companyId: number } | null {
  if (!meta || meta.detailflowModule !== CUSTOMER_SUBSCRIPTION_MODULE) return null
  const subscriptionId = Number(meta.maintenanceSubscriptionId)
  const companyId = Number(meta.companyId)
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0 || !Number.isInteger(companyId) || companyId <= 0) return null
  return { subscriptionId, companyId }
}

export function parseFeeBpsMetadata(meta: Record<string, string> | null | undefined): number | null {
  const n = Number(meta?.detailflowPlatformFeeBps)
  return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : null
}

/**
 * Snapshot du taux réellement appliqué par Stripe : le premier taux candidat
 * qui redonne exactement le montant prélevé, sinon le taux arrondi déduit.
 */
/**
 * Commission réellement prélevée sur une facture. L'objet Invoice de l'API
 * installée (stripe@22, 2026-07-29.dahlia) n'expose plus `application_fee_amount` :
 * on recalcule alors depuis le taux écrit en metadata au stade draft
 * (`detailflowPlatformFeeBps`), puis le taux courant. Forme legacy conservée.
 */
export function invoiceChargedFeeCents(inv: InvoiceLike, grossCents: number, fallbackBps: number): number {
  if (typeof inv.application_fee_amount === "number") return Math.min(grossCents, Math.max(0, inv.application_fee_amount))
  // Metadata écrite par invoice.created sur la facture elle-même, puis celle de l'abonnement.
  const bps = parseFeeBpsMetadata(inv.metadata) ?? parseFeeBpsMetadata(invoiceMetadata(inv)) ?? fallbackBps
  return computePlatformFeeAmountCents(grossCents, bps)
}

export function feeBpsForCharged(grossCents: number, feeCents: number, candidates: Array<number | null>): number {
  for (const c of candidates) {
    if (c != null && computePlatformFeeAmountCents(grossCents, c) === feeCents) return c
  }
  if (grossCents > 0) return Math.min(10_000, Math.max(0, Math.round((feeCents * 10_000) / grossCents)))
  return candidates.find((c): c is number => c != null) ?? 0
}

/* ------------------------------ Transitions ------------------------------ */

/** Échec de paiement : active / cancel_scheduled → past_due ; les autres statuts restent tels quels. */
export function statusAfterPaymentFailed(status: string): string {
  return status === "active" || status === "cancel_scheduled" ? "past_due" : status
}

/**
 * Facture payée sur un contrat past_due : retour à active (ou cancel_scheduled
 * si une fin est programmée). suspended (manuel) n'est JAMAIS réactivé.
 */
export function statusAfterRecovery(sub: { status: string; cancelAt: Date | null }, now: Date): string {
  if (sub.status !== "past_due") return sub.status
  return sub.cancelAt && sub.cancelAt > now ? "cancel_scheduled" : "active"
}

/** SCA / action requise : même blocage que l'échec (aucun nouveau droit). */
export const statusAfterPaymentActionRequired = statusAfterPaymentFailed

const DAY_MS = 86_400_000
/** Tolérance d'horloge Stripe ↔ échéance DetailFlow. */
export const PROVIDER_END_TOLERANCE_MS = DAY_MS

/**
 * customer.subscription.deleted :
 * - fin programmée par DetailFlow ET survenue à l'échéance (± tolérance) → cancelled
 * - fin naturelle sans renouvellement à l'échéance du terme → expired
 * - toute suppression significativement AVANT la date attendue → ended (provider)
 */
export function decideProviderDeletion(
  sub: { cancelRequestedAt: Date | null; cancelAt: Date | null; renewalOptOutAt: Date | null; renewalModeSnapshot: string; currentTermEndsAt: Date | null },
  endedAt: Date,
): "cancelled" | "expired" | "ended" {
  const atOrAfter = (expected: Date) => endedAt.getTime() >= expected.getTime() - PROVIDER_END_TOLERANCE_MS
  if (sub.cancelRequestedAt && sub.cancelAt && atOrAfter(sub.cancelAt)) return "cancelled"
  const noRenewal = sub.renewalOptOutAt != null || sub.renewalModeSnapshot === "none"
  if (noRenewal && sub.currentTermEndsAt && atOrAfter(sub.currentTermEndsAt)) return "expired"
  return "ended"
}

/* -------------------- Accès réel côté Stripe (invoice.paid) -------------------- */

/**
 * État RÉEL de la Stripe Subscription (contexte connected account) :
 * - grant  : accès compatible (active / trialing)
 * - retry  : état transitoire, l'event doit être rejoué (500)
 * - deny   : abonnement provider terminé → paiement tracé, aucun droit
 */
export function providerAccessDecision(status: string | null | undefined): "grant" | "retry" | "deny" {
  if (status === "active" || status === "trialing") return "grant"
  if (status === "canceled" || status === "incomplete_expired") return "deny"
  return "retry"
}

/* ------------------------- Renouvellement contractuel ------------------------ */

export type TermRenewalPlan =
  | { kind: "none" }
  | { kind: "advance"; terms: Array<{ from: { start: Date | null; end: Date }; to: { start: Date; end: Date } }> }
  | { kind: "beyond_final_term" }

/**
 * Une facture payée dont la période (point milieu) tombe APRÈS currentTermEndsAt :
 * - same_term (sans opt-out) → avance du terme via computeNextRenewalTerm ;
 * - none / opt-out           → aucun droit au-delà du terme final ;
 * - open_ended               → aucun faux terme supplémentaire.
 * Idempotent par construction : après avance, le probe est dans le nouveau terme.
 */
export function planTermRenewal(
  sub: { renewalModeSnapshot: string; renewalOptOutAt: Date | null; currentTermStartedAt: Date | null; currentTermEndsAt: Date | null },
  probe: Date,
  next: (currentTermEndsAt: Date) => { kind: string; term?: { termEnd: Date } },
): TermRenewalPlan {
  if (!sub.currentTermEndsAt || probe < sub.currentTermEndsAt) return { kind: "none" }
  if (sub.renewalModeSnapshot === "open_ended") return { kind: "none" }
  if (sub.renewalModeSnapshot === "none" || sub.renewalOptOutAt) return { kind: "beyond_final_term" }
  const terms: Array<{ from: { start: Date | null; end: Date }; to: { start: Date; end: Date } }> = []
  let start = sub.currentTermStartedAt
  let end = sub.currentTermEndsAt
  while (probe >= end) {
    const n = next(end)
    if (n.kind !== "same_term" || !n.term || n.term.termEnd <= end) return terms.length ? { kind: "advance", terms } : { kind: "beyond_final_term" }
    terms.push({ from: { start, end }, to: { start: end, end: n.term.termEnd } })
    start = end
    end = n.term.termEnd
    if (terms.length > 100) throw new CustomerSubscriptionError("INTERNAL_ERROR")
  }
  return { kind: "advance", terms }
}

/**
 * cancel_at Stripe souhaité (secondes) selon la règle contractuelle DetailFlow :
 * annulation programmée > non-renouvellement (opt-out ou mode none) > rien.
 */
export function desiredProviderCancelAt(sub: {
  paymentMode: string
  status: string
  cancelAt: Date | null
  renewalOptOutAt: Date | null
  renewalModeSnapshot: string
  currentTermEndsAt: Date | null
}): number | null {
  if (sub.paymentMode !== "recurring") return null
  if (sub.cancelAt) return Math.floor(sub.cancelAt.getTime() / 1000)
  if ((sub.renewalOptOutAt || sub.renewalModeSnapshot === "none") && sub.currentTermEndsAt) return Math.floor(sub.currentTermEndsAt.getTime() / 1000)
  return null
}

/* -------------------------------- Remboursements ------------------------------- */

export type RefundStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled"

export function normalizeRefundStatus(s: string | null | undefined): RefundStatus {
  return s === "succeeded" || s === "failed" || s === "canceled" || s === "requires_action" ? s : "pending"
}

/** Hors ordre : un statut terminal ne régresse jamais ; succeeded peut seulement échouer/être annulé. */
export function nextRefundStatus(current: RefundStatus, incoming: RefundStatus): RefundStatus {
  if (current === incoming) return current
  if (current === "failed" || current === "canceled") return current
  if (current === "succeeded") return incoming === "failed" || incoming === "canceled" ? incoming : current
  return incoming
}

/** Statut du paiement depuis l'agrégat des remboursements succeeded. */
export function paymentStatusAfterRefunds(gross: number, refunded: number): "paid" | "partially_refunded" | "refunded" {
  if (refunded <= 0) return "paid"
  return refunded >= gross ? "refunded" : "partially_refunded"
}
