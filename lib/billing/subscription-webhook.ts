/**
 * DetailFlow — Événements d'ABONNEMENT du webhook Stripe BILLING.
 *
 * Appelé uniquement par le routeur de /api/billing/webhook (lifetime-webhook.ts)
 * après vérification de signature et exclusion des événements Connect.
 *
 * Idempotence : `billing_events` (marqué APRÈS succès) + mutations elles-mêmes
 * rejouables (état relu chez Stripe, ancienneté `IS NULL`, coupon déjà présent).
 * Réponses : succès/ignoré => 200 ; erreur métier non réessayable => 200
 * « rejected » + journal ; erreur transitoire / fail-closed => 500 (retry).
 */

import type Stripe from "stripe"
import {
  SubscriptionError,
  buildSubscriptionStatePatch,
  decideInvoiceLoyaltyDiscount,
  decideSubscriptionSync,
  extractInvoiceDiscountCouponIds,
  getInvoiceLoyaltyDiscountBps,
  getInvoiceSubscriptionId,
  getInvoiceSubscriptionMetadata,
  isSubscriptionCheckoutSession,
  parseDetailflowSubscriptionRefs,
  resolveInvoicePaidAt,
  stripeRefId,
  type CompanyBillingState,
  type SubscriptionStore,
} from "./subscription-core"
import {
  assertLoyaltyCouponValid,
  getLoyaltyCouponSpec,
  readKnownLoyaltyCouponIds,
  resolveLoyaltyCouponId,
} from "./loyalty-coupons"

type EnvLike = Record<string, string | undefined>
type RequestOptions = { idempotencyKey?: string }

export interface SubscriptionWebhookStripeClient {
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>
    cancel(id: string, params?: Stripe.SubscriptionCancelParams, options?: RequestOptions): Promise<Stripe.Subscription>
  }
  invoices: {
    retrieve(id: string, params?: { expand?: string[] }): Promise<Stripe.Invoice>
    update(id: string, params: Stripe.InvoiceUpdateParams, options?: RequestOptions): Promise<Stripe.Invoice>
  }
  coupons: { retrieve(id: string): Promise<Stripe.Coupon> }
}

export interface SubscriptionWebhookDeps {
  stripe: SubscriptionWebhookStripeClient
  store: SubscriptionStore
  env?: EnvLike
}

export interface SubscriptionWebhookResponse {
  status: number
  body: Record<string, unknown>
}

/** Événements d'abonnement routés ici (checkout.session.completed est routé à part). */
export const SUBSCRIPTION_WEBHOOK_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.finalization_failed",
] as const

export function isSubscriptionWebhookEventType(type: string): boolean {
  return (SUBSCRIPTION_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type)
}

type Outcome = Record<string, unknown>

export async function handleSubscriptionWebhookEvent(
  event: Stripe.Event,
  deps: SubscriptionWebhookDeps,
): Promise<SubscriptionWebhookResponse> {
  if (await deps.store.isEventProcessed(event.id)) {
    return { status: 200, body: { received: true, duplicate: true } }
  }
  try {
    const outcome = await dispatch(event, deps)
    await deps.store.markEventProcessed(event.id, event.type)
    return { status: 200, body: { received: true, ...outcome } }
  } catch (error) {
    if (error instanceof SubscriptionError && !error.retryable) {
      console.error(`[billing-subscription] ${event.type} ${event.id} rejeté : ${error.code} — ${error.message}`)
      return { status: 200, body: { received: true, rejected: error.code } }
    }
    const detail = error instanceof SubscriptionError ? `${error.code} — ${error.message}` : error instanceof Error ? error.message : "inconnue"
    console.error(`[billing-subscription] ${event.type} ${event.id} échec (retry Stripe) : ${detail}`)
    return { status: 500, body: { error: "processing_failed" } }
  }
}

async function dispatch(event: Stripe.Event, deps: SubscriptionWebhookDeps): Promise<Outcome> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (!isSubscriptionCheckoutSession(session)) return { ignored: "not_subscription_checkout" }
      const subscriptionId = stripeRefId(session.subscription as string | { id: string } | null)
      if (!subscriptionId) throw new SubscriptionError("INCOHERENT", `Session ${session.id} sans abonnement.`)
      const refs = parseDetailflowSubscriptionRefs(session.metadata)
      return syncSubscription(subscriptionId, deps, refs?.companyId ?? null)
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription((event.data.object as Stripe.Subscription).id, deps, null)
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription
      console.log(`[billing-subscription] fin d'essai proche pour ${sub.id}`)
      return { observed: "trial_will_end" }
    }
    case "invoice.paid":
      return handleInvoicePaid(event.data.object as Stripe.Invoice, event.created, deps)
    case "invoice.payment_failed": {
      const subscriptionId = getInvoiceSubscriptionId(event.data.object as Stripe.Invoice)
      if (!subscriptionId) return { ignored: "not_subscription_invoice" }
      return { paymentFailed: true, ...(await syncSubscription(subscriptionId, deps, null)) }
    }
    case "invoice.created":
      return handleInvoiceCreated(event.data.object as Stripe.Invoice, deps)
    case "invoice.finalization_failed": {
      const invoice = event.data.object as Stripe.Invoice
      console.error(`[billing-subscription] finalisation échouée pour la facture ${invoice.id}`)
      return { observed: "finalization_failed" }
    }
    default:
      return { ignored: event.type }
  }
}

/**
 * Synchronise le tenant depuis l'état FRAIS de l'abonnement relu chez Stripe
 * (robuste à l'ordre d'arrivée des événements et aux rejeux).
 */
async function syncSubscription(
  subscriptionId: string,
  deps: SubscriptionWebhookDeps,
  expectedCompanyId: number | null,
): Promise<Outcome> {
  const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
  const refs = parseDetailflowSubscriptionRefs(subscription.metadata)
  if (!refs) return { ignored: "not_detailflow_subscription" }
  if (expectedCompanyId !== null && expectedCompanyId !== refs.companyId) {
    throw new SubscriptionError("INCOHERENT", `Session et abonnement ${subscription.id} pointent vers des tenants différents.`)
  }

  const linked = await deps.store.findCompanyBySubscriptionId(subscription.id)
  if (linked && linked.id !== refs.companyId) {
    throw new SubscriptionError("INCOHERENT", `Abonnement ${subscription.id} lié à un autre tenant que ses métadonnées.`)
  }
  const company = linked ?? (await deps.store.getCompany(refs.companyId))
  if (!company) throw new SubscriptionError("TENANT_NOT_FOUND", `Tenant ${refs.companyId} introuvable.`)

  const decision = decideSubscriptionSync(company, subscription)
  switch (decision.kind) {
    case "reject":
      throw new SubscriptionError(decision.code, decision.message)
    case "ignore":
      return { ignored: decision.reason }
    case "cancel_duplicate":
      console.error(`[billing-subscription] doublon ${subscription.id} pour le tenant ${company.id} : annulation.`)
      await deps.stripe.subscriptions.cancel(subscription.id, undefined, {
        idempotencyKey: `detailflow-cancel-duplicate-${subscription.id}`,
      })
      return { canceledDuplicate: subscription.id }
    case "apply": {
      const patch = buildSubscriptionStatePatch(subscription, deps.env ?? process.env)
      const applied = await deps.store.applySubscriptionState(company.id, subscription.id, patch)
      if (!applied) {
        throw new SubscriptionError("APPLY_CONFLICT", `État du tenant ${company.id} modifié en parallèle.`, true)
      }
      return { synced: patch.subscriptionStatus, licensePlan: patch.licensePlan }
    }
  }
}

function assertInvoiceCustomer(invoice: Stripe.Invoice, company: CompanyBillingState): void {
  const customerId = stripeRefId(invoice.customer as string | { id: string } | null)
  if (!company.stripeCustomerId || customerId !== company.stripeCustomerId) {
    throw new SubscriptionError("CUSTOMER_MISMATCH", `Facture ${invoice.id} : Customer ≠ Customer du tenant ${company.id}.`)
  }
}

/** Première facture RÉELLEMENT payée et non nulle => début de l'ancienneté. */
async function handleInvoicePaid(invoice: Stripe.Invoice, eventCreated: number, deps: SubscriptionWebhookDeps): Promise<Outcome> {
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  if (!subscriptionId) return { ignored: "not_subscription_invoice" }
  if (!(invoice.amount_paid > 0)) return { ignored: "zero_amount_invoice" }

  const company = await deps.store.findCompanyBySubscriptionId(subscriptionId)
  if (!company) {
    throw new SubscriptionError("TENANT_NOT_FOUND", `Abonnement ${subscriptionId} pas encore synchronisé.`, true)
  }
  assertInvoiceCustomer(invoice, company)
  const started = await deps.store.startContinuousSubscriptionIfNull(
    company.id,
    subscriptionId,
    resolveInvoicePaidAt(invoice, eventCreated),
  )
  return { seniorityStarted: started }
}

/** Tenant d'une facture : abonnement lié, sinon métadonnées + Customer (nouvel abonnement). */
async function resolveInvoiceCompany(
  invoice: Stripe.Invoice,
  subscriptionId: string,
  deps: SubscriptionWebhookDeps,
): Promise<CompanyBillingState | "not_detailflow"> {
  const linked = await deps.store.findCompanyBySubscriptionId(subscriptionId)
  if (linked) return linked
  const refs = parseDetailflowSubscriptionRefs(getInvoiceSubscriptionMetadata(invoice))
  if (!refs) return "not_detailflow"
  const company = await deps.store.getCompany(refs.companyId)
  if (!company) throw new SubscriptionError("TENANT_NOT_FOUND", `Facture ${invoice.id} : tenant introuvable.`, true)
  return company
}

/** Applique le coupon fidélité du palier tant que la facture est DRAFT (fail-closed). */
async function handleInvoiceCreated(eventInvoice: Stripe.Invoice, deps: SubscriptionWebhookDeps): Promise<Outcome> {
  const env = deps.env ?? process.env
  const subscriptionId = getInvoiceSubscriptionId(eventInvoice)
  if (!subscriptionId) return { ignored: "not_subscription_invoice" }

  const company = await resolveInvoiceCompany(eventInvoice, subscriptionId, deps)
  if (company === "not_detailflow") return { ignored: "not_detailflow_invoice" }
  assertInvoiceCustomer(eventInvoice, company)
  if (company.stripeSubscriptionId && company.stripeSubscriptionId !== subscriptionId) {
    throw new SubscriptionError("INCOHERENT", `Facture ${eventInvoice.id} d'un abonnement non lié au tenant ${company.id}.`, true)
  }

  const discountBps = getInvoiceLoyaltyDiscountBps(company.continuousSubscriptionStartedAt, eventInvoice)
  const targetCouponId = resolveLoyaltyCouponId(discountBps, env)
  if (!targetCouponId) return { loyalty: "none", discountBps: 0 }

  const invoice = await deps.stripe.invoices.retrieve(eventInvoice.id, { expand: ["discounts"] })
  const decision = decideInvoiceLoyaltyDiscount({
    invoiceStatus: invoice.status,
    existingCouponIds: extractInvoiceDiscountCouponIds(invoice),
    targetCouponId,
    knownLoyaltyCouponIds: readKnownLoyaltyCouponIds(env),
  })
  switch (decision.kind) {
    case "none":
      return { loyalty: "none", discountBps: 0 }
    case "already_applied":
      return { loyalty: "already_applied", discountBps, couponId: targetCouponId }
    case "fail":
      throw new SubscriptionError(decision.code, `Facture ${invoice.id} : ${decision.message}`, decision.retryable)
    case "apply": {
      const spec = getLoyaltyCouponSpec(discountBps)
      if (!spec) throw new SubscriptionError("COUPON_INVALID", "Palier fidélité incohérent.", true)
      assertLoyaltyCouponValid(await deps.stripe.coupons.retrieve(decision.couponId), spec)
      const updated = await deps.stripe.invoices.update(
        invoice.id,
        { discounts: [{ coupon: decision.couponId }], expand: ["discounts"] },
        { idempotencyKey: `detailflow-loyalty-${invoice.id}-${decision.couponId}` },
      )
      if (!extractInvoiceDiscountCouponIds(updated).includes(decision.couponId)) {
        throw new SubscriptionError("DISCOUNT_NOT_VISIBLE", `Remise absente de la facture ${invoice.id} après mise à jour.`, true)
      }
      return { loyalty: "applied", discountBps, couponId: decision.couponId }
    }
  }
}
