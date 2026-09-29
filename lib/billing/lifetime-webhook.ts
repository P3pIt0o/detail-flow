import "server-only"

/**
 * DetailFlow — Webhook BILLING du compte plateforme (LOT S3A).
 *
 * Distinct du webhook Stripe Connect (app/api/payments/webhook) : secret
 * dédié STRIPE_BILLING_WEBHOOK_SECRET, et tout événement portant
 * `event.account` (compte connecté d'un detailer) est ignoré.
 *
 * Seul point d'activation d'une licence Lifetime payée. Idempotent par
 * construction : les transitions DB (RESERVED→ACTIVE, RESERVED→RELEASED)
 * sont conditionnelles, un événement rejoué ne double rien.
 *
 * Codes HTTP : 400 signature, 500 config/erreur transitoire (Stripe
 * réessaie), 200 pour tout le reste — y compris un rejet de validation,
 * journalisé, car un retry ne corrigerait pas une incohérence.
 */

import type Stripe from "stripe"
import {
  LifetimeCheckoutError,
  isLifetimeCheckoutSession,
  parseLifetimeSessionRefs,
  resolveLifetimeSinglePriceId,
  validatePaidLifetimeSession,
} from "./lifetime-checkout-core"
import type { LifetimeStripeClient } from "./lifetime-checkout"
import { LifetimeError } from "./lifetime"
import {
  activateLifetimeSlot,
  getLifetimeAllocationById,
  releaseLifetimeReservation,
  type LifetimeDeps,
} from "./lifetime-server"
import { isSubscriptionCheckoutSession } from "./subscription-core"
import {
  handleSubscriptionWebhookEvent,
  isSubscriptionWebhookEventType,
  type SubscriptionWebhookDeps,
} from "./subscription-webhook"

export interface BillingWebhookDeps extends LifetimeDeps {
  secret: string | undefined
  stripe: LifetimeStripeClient & {
    webhooks: { constructEvent(payload: string, header: string, secret: string): Stripe.Event }
  }
  env?: Record<string, string | undefined>
  /** Moteur d'abonnements (même endpoint, même secret). */
  subscriptions?: SubscriptionWebhookDeps
}

export interface BillingWebhookResponse {
  status: number
  body: Record<string, unknown>
}

const ok = (body: Record<string, unknown>): BillingWebhookResponse => ({ status: 200, body: { received: true, ...body } })

async function handlePaid(session: Stripe.Checkout.Session, deps: BillingWebhookDeps): Promise<BillingWebhookResponse> {
  if (session.payment_status !== "paid") return ok({ pending: true })

  const refs = parseLifetimeSessionRefs(session)
  if (!refs) {
    console.error("[billing-webhook] metadata Lifetime invalides:", session.id)
    return ok({ rejected: "invalid_metadata" })
  }

  const expectedPriceId = resolveLifetimeSinglePriceId(deps.env ?? process.env)
  const allocation = await getLifetimeAllocationById(refs.allocationId, deps)
  const lineItems = await deps.stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })

  try {
    const payment = validatePaidLifetimeSession({ session, lineItems: lineItems.data, allocation, expectedPriceId })
    const result = await activateLifetimeSlot(
      {
        companyId: payment.companyId,
        allocationId: payment.allocationId,
        actorUserId: null,
        payment: {
          checkoutSessionId: payment.checkoutSessionId,
          paymentIntentId: payment.paymentIntentId,
          paidAmountCents: payment.paidAmountCents,
        },
      },
      deps,
    )
    return ok({ activated: !result.alreadyActive, alreadyActive: result.alreadyActive })
  } catch (error) {
    if (error instanceof LifetimeCheckoutError || error instanceof LifetimeError) {
      // Paiement encaissé mais activation refusée : revue manuelle requise.
      console.error("[billing-webhook] activation Lifetime REFUSÉE:", session.id, error.code, error.message)
      return ok({ rejected: error.code })
    }
    throw error
  }
}

async function handleReleased(session: Stripe.Checkout.Session, deps: BillingWebhookDeps): Promise<BillingWebhookResponse> {
  const refs = parseLifetimeSessionRefs(session)
  if (!refs) return ok({ ignored: "invalid_metadata" })
  const allocation = await getLifetimeAllocationById(refs.allocationId, deps)
  if (
    !allocation ||
    allocation.companyId !== refs.companyId ||
    allocation.stripeCheckoutSessionId !== session.id
  ) {
    return ok({ ignored: "allocation_mismatch" })
  }
  if (allocation.status !== "RESERVED") return ok({ ignored: allocation.status })
  await releaseLifetimeReservation({ companyId: refs.companyId, allocationId: allocation.id }, deps)
  return ok({ released: true })
}

export async function handleBillingWebhook(
  input: { rawBody: string; signature: string | null },
  deps: BillingWebhookDeps,
): Promise<BillingWebhookResponse> {
  if (!deps.secret) {
    console.error("[billing-webhook] STRIPE_BILLING_WEBHOOK_SECRET manquant")
    return { status: 500, body: { error: "Webhook non configuré" } }
  }
  if (!input.signature) return { status: 400, body: { error: "Signature manquante" } }

  let event: Stripe.Event
  try {
    event = deps.stripe.webhooks.constructEvent(input.rawBody, input.signature, deps.secret)
  } catch {
    return { status: 400, body: { error: "Signature invalide" } }
  }

  // Événement d'un compte CONNECTÉ : jamais traité par la facturation DetailFlow.
  if ((event as { account?: string | null }).account) return ok({ ignored: "connect_account" })

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (!isLifetimeCheckoutSession(session)) {
        if (event.type === "checkout.session.completed" && isSubscriptionCheckoutSession(session)) {
          return routeSubscriptionEvent(event, deps)
        }
        return ok({ ignored: "not_lifetime" })
      }
      try {
        if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
          return await handlePaid(session, deps)
        }
        return await handleReleased(session, deps)
      } catch (error) {
        console.error("[billing-webhook] erreur:", event.type, error instanceof Error ? error.message : error)
        return { status: 500, body: { error: "Traitement impossible" } }
      }
    }
    default:
      if (isSubscriptionWebhookEventType(event.type)) return routeSubscriptionEvent(event, deps)
      return ok({ ignored: event.type })
  }
}

/** Routage explicite vers le moteur d'abonnements (Lifetime inchangé ci-dessus). */
async function routeSubscriptionEvent(event: Stripe.Event, deps: BillingWebhookDeps): Promise<BillingWebhookResponse> {
  if (!deps.subscriptions) {
    console.error("[billing-webhook] moteur d'abonnements non configuré:", event.type)
    return { status: 500, body: { error: "Abonnements non configurés" } }
  }
  return handleSubscriptionWebhookEvent(event, deps.subscriptions)
}
