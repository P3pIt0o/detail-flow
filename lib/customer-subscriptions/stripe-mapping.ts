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

/** Clé Stripe DÉTERMINISTE par tentative logique (nouvelle tentative = dérivée de la session expirée). */
export function checkoutIdempotencyKey(input: { companyId: number; subscriptionId: number; kind: CheckoutKind; previousSessionId: string | null }): string {
  return `df-cs:${input.companyId}:${input.subscriptionId}:${input.kind}:${input.previousSessionId ?? "first"}`
}

/** URL de retour construite SERVEUR : absolue, https (http seulement localhost), placeholder session. */
export function assertReturnUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url.replace("{CHECKOUT_SESSION_ID}", "placeholder"))
  } catch {
    throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  if (!url.includes("{CHECKOUT_SESSION_ID}")) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  return url
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
  const base = { ui_mode: "embedded_page", return_url: returnUrl, metadata, ...customer }

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

const DAY_MS = 86_400_000

/**
 * customer.subscription.deleted :
 * - fin programmée par DetailFlow → cancelled
 * - fin naturelle sans renouvellement → expired
 * - suppression inattendue côté provider → ended
 */
export function decideProviderDeletion(
  sub: { cancelRequestedAt: Date | null; cancelAt: Date | null; renewalOptOutAt: Date | null; renewalModeSnapshot: string; currentTermEndsAt: Date | null },
  endedAt: Date,
): "cancelled" | "expired" | "ended" {
  if (sub.cancelRequestedAt && sub.cancelAt) return "cancelled"
  const noRenewal = sub.renewalOptOutAt != null || sub.renewalModeSnapshot === "none"
  if (noRenewal && sub.currentTermEndsAt && endedAt.getTime() >= sub.currentTermEndsAt.getTime() - DAY_MS) return "expired"
  return "ended"
}
