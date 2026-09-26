/**
 * DetailFlow — Types centraux de la facturation ABONNEMENT (Stripe Billing).
 *
 * IMPORTANT — deux concepts distincts, jamais dérivés l'un de l'autre :
 *   - `billingMode`  : COMMENT le client paie DetailFlow (gratuit / abonnement
 *                      récurrent / paiement Lifetime unique).
 *   - `licensePlan`  : À QUOI le client a droit (FREE | PRO | BUSINESS | …),
 *                      géré séparément dans lib/licensing.
 *
 * Ce fichier ne contient AUCUN appel Stripe et AUCUNE logique métier : il
 * centralise uniquement les valeurs autorisées et leurs validateurs, afin
 * d'éviter des chaînes littérales dispersées dans l'application.
 *
 * Il est également strictement indépendant de Stripe Connect (paiements des
 * clients des detailers) : ne rien importer ni référencer depuis lib/payments.
 */

/* --------------------------------- BillingMode ---------------------------- */

/** Mode de facturation de l'abonnement DetailFlow du tenant. */
export const BILLING_MODES = ["free", "subscription", "lifetime"] as const

export type BillingMode = (typeof BILLING_MODES)[number]

/**
 * Valeur historique sûre : un tenant existant (jamais passé par Stripe
 * Billing) est considéré `free` tant qu'aucun abonnement/Lifetime n'a été
 * activé. Ne décrit pas ses droits — ceux-ci restent portés par licensePlan.
 */
export const DEFAULT_BILLING_MODE: BillingMode = "free"

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === "string" && (BILLING_MODES as readonly string[]).includes(value)
}

/**
 * Valide une valeur arbitraire (ex. entrée future, colonne DB) et renvoie un
 * `BillingMode` sûr, sinon `null`. Aucune exception : le mode est purement
 * défensif (empêche des valeurs arbitraires de se propager).
 */
export function parseBillingMode(value: unknown): BillingMode | null {
  return isBillingMode(value) ? value : null
}

/* ------------------------------ SubscriptionStatus ------------------------ */

/**
 * États d'abonnement suivis (miroir des statuts Stripe Subscription). NULL en
 * base = aucun abonnement DetailFlow (billingMode `free` ou `lifetime`).
 */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

/** Renvoie un `SubscriptionStatus` valide, sinon `null` (jamais d'exception). */
export function parseSubscriptionStatus(value: unknown): SubscriptionStatus | null {
  return isSubscriptionStatus(value) ? value : null
}

/**
 * Statuts pour lesquels un abonnement récurrent est encore juridiquement/
 * techniquement en cours (ancienneté fidélité NON remise à zéro). Le lot S1 ne
 * consomme pas encore ce set : il documente l'intention pour les lots futurs
 * (grâce past_due/unpaid, cancelAtPeriodEnd encore actif).
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
] as const satisfies readonly SubscriptionStatus[]
