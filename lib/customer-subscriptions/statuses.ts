/**
 * Statuts MÉTIER DetailFlow d'un abonnement client (jamais un statut Stripe brut).
 * Deux notions DISTINCTES :
 *  - capacité : le contrat occupe une place de la limite du plan DetailFlow ;
 *  - utilisation : le contrat permet de consommer un NOUVEAU droit.
 */
export const SUBSCRIPTION_STATUSES = [
  "pending_initial_cleaning",
  "pending_payment",
  "active",
  "past_due",
  "cancel_scheduled",
  "suspended",
  "cancelled",
  "expired",
  "ended",
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * Consomment une place. pending_payment compte : sinon un tenant limité à 2
 * pourrait ouvrir 50 checkouts simultanés puis les faire tous payer.
 */
export const CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES = [
  "pending_initial_cleaning",
  "pending_payment",
  "active",
  "past_due",
  "cancel_scheduled",
  "suspended",
] as const satisfies readonly SubscriptionStatus[]

/** Autorisent un NOUVEAU droit (sous réserve des dates : voir canUseEntitlement). */
export const CUSTOMER_SUBSCRIPTION_USABLE_STATUSES = [
  "active",
  "cancel_scheduled",
] as const satisfies readonly SubscriptionStatus[]

/** États finaux : plus aucune mutation contractuelle. */
export const CUSTOMER_SUBSCRIPTION_TERMINAL_STATUSES = [
  "cancelled",
  "expired",
  "ended",
] as const satisfies readonly SubscriptionStatus[]

export function isSubscriptionStatus(v: unknown): v is SubscriptionStatus {
  return typeof v === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(v)
}

export function consumesCapacity(status: string): boolean {
  return (CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES as readonly string[]).includes(status)
}

export function isTerminalStatus(status: string): boolean {
  return (CUSTOMER_SUBSCRIPTION_TERMINAL_STATUSES as readonly string[]).includes(status)
}
