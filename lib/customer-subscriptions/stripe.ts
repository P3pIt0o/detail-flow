/**
 * Adapter Stripe RÉEL du port customer-subscriptions. Chaque appel porte
 * `stripeAccount` (Direct Charges sur le compte connecté du detailer).
 */
import "server-only"
import type Stripe from "stripe"
import { getStripe } from "@/lib/payments/stripe-client"
import type { CustomerSubscriptionStripePort, StripeCallOptions } from "./payments"

const req = (o: StripeCallOptions): Stripe.RequestOptions => ({
  stripeAccount: o.stripeAccount,
  ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}),
})

export function createCustomerSubscriptionStripePort(client?: Stripe): CustomerSubscriptionStripePort {
  const stripe = () => client ?? getStripe()
  return {
    createCheckoutSession: (params, o) => stripe().checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams, req(o)),
    retrieveCheckoutSession: (id, o) => stripe().checkout.sessions.retrieve(id, {}, req(o)),
    retrieveSubscription: (id, o) => stripe().subscriptions.retrieve(id, {}, req(o)),
    updateSubscription: (id, params, o) => stripe().subscriptions.update(id, params as Stripe.SubscriptionUpdateParams, req(o)),
    cancelSubscription: (id, o) => stripe().subscriptions.cancel(id, {}, req(o)),
    retrievePaymentIntent: (id, o) => stripe().paymentIntents.retrieve(id, {}, req(o)),
    updateInvoice: (id, params, o) => stripe().invoices.update(id, params as Stripe.InvoiceUpdateParams, req(o)),
  } as CustomerSubscriptionStripePort
}
