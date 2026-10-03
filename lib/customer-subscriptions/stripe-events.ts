/**
 * Source de vérité unique des événements Stripe Connect requis par
 * customer-subscriptions (webhook Connect TEST/Preview puis Production).
 * `account.updated` reste géré séparément (Booking / tenant).
 */
export const CUSTOMER_SUBSCRIPTION_CONTRACT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const

/** Événements financiers routés selon le vrai PaymentIntent / Charge (partagés avec Booking). */
export const CUSTOMER_SUBSCRIPTION_MONEY_EVENTS = [
  "charge.updated",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const

export const CUSTOMER_SUBSCRIPTIONS_WEBHOOK_EVENTS = [
  ...CUSTOMER_SUBSCRIPTION_CONTRACT_EVENTS,
  ...CUSTOMER_SUBSCRIPTION_MONEY_EVENTS,
] as const

export type CustomerSubscriptionWebhookEvent = (typeof CUSTOMER_SUBSCRIPTIONS_WEBHOOK_EVENTS)[number]
