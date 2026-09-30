/**
 * DetailFlow — Création d'un Checkout Stripe BILLING `mode=subscription`
 * (premier mois offert : trial 30 jours, moyen de paiement collecté).
 *
 * Tout est résolu côté serveur : companyId (contexte authentifié), Price ID
 * (resolveStripePriceIdForPlan), validation du Price chez Stripe, Customer.
 * Aucune activation de licence ici : seule la synchronisation webhook le fait.
 */

import type Stripe from "stripe"
import { BillingConfigError, resolveStripePriceIdForPlan } from "./config"
import {
  SubscriptionError,
  assertCompanyEligibleForSubscription,
  assertSubscriptionOwner,
  assertValidSubscriptionCompanyId,
  buildSubscriptionCheckoutParams,
  isCompanyTrialEligible,
  isSubscriptionCheckoutSession,
  isSubscriptionPlan,
  validateSubscriptionPrice,
  type CompanyBillingState,
  type SubscriptionPlan,
  type SubscriptionStore,
} from "./subscription-core"

type EnvLike = Record<string, string | undefined>
type RequestOptions = { idempotencyKey?: string }

export interface SubscriptionCheckoutStripeClient {
  prices: { retrieve(id: string, params?: { expand?: string[] }): Promise<Stripe.Price> }
  customers: {
    create(params: Stripe.CustomerCreateParams, options?: RequestOptions): Promise<Stripe.Customer>
    retrieve(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>
  }
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams, options?: RequestOptions): Promise<Stripe.Checkout.Session>
      list(params: Stripe.Checkout.SessionListParams): Promise<{ data: Stripe.Checkout.Session[] }>
      expire(id: string): Promise<Stripe.Checkout.Session>
    }
  }
}

export interface SubscriptionCheckoutDeps {
  stripe: SubscriptionCheckoutStripeClient
  store: SubscriptionStore
  env?: EnvLike
  now?: () => Date
}

export interface SubscriptionCheckoutInput {
  companyId: number
  role: string
  plan: unknown
  successUrl: string
  cancelUrl: string
}

/** Customer rattaché au tenant : vérifié s'il existe, créé une seule fois sinon. */
export async function ensureSubscriptionCustomer(
  company: CompanyBillingState,
  deps: Pick<SubscriptionCheckoutDeps, "stripe" | "store">,
): Promise<string> {
  if (company.stripeCustomerId) {
    await assertCustomerBelongsToCompany(company.stripeCustomerId, company.id, deps.stripe)
    return company.stripeCustomerId
  }
  const created = await deps.stripe.customers.create(
    { metadata: { app: "detailflow", company_id: String(company.id) } },
    { idempotencyKey: `detailflow-customer-${company.id}` },
  )
  const stored = await deps.store.setStripeCustomerIdIfNull(company.id, created.id)
  if (!stored) throw new SubscriptionError("NO_CUSTOMER", "Customer Stripe non enregistré pour ce tenant.")
  if (stored !== created.id) {
    console.error(`[billing-subscription] Customer ${created.id} orphelin : tenant ${company.id} déjà lié à ${stored}.`)
    await assertCustomerBelongsToCompany(stored, company.id, deps.stripe)
  }
  return stored
}

export async function assertCustomerBelongsToCompany(
  customerId: string,
  companyId: number,
  stripe: Pick<SubscriptionCheckoutStripeClient, "customers">,
): Promise<void> {
  const customer = await stripe.customers.retrieve(customerId)
  if (("deleted" in customer && customer.deleted) || (customer as Stripe.Customer).metadata?.company_id !== String(companyId)) {
    throw new SubscriptionError("CUSTOMER_MISMATCH", "Le Customer Stripe ne correspond pas à cette entreprise.")
  }
}

export async function createSubscriptionCheckout(
  input: SubscriptionCheckoutInput,
  deps: SubscriptionCheckoutDeps,
): Promise<{ url: string; sessionId: string; reused: boolean }> {
  const env = deps.env ?? process.env
  const now = deps.now?.() ?? new Date()
  assertValidSubscriptionCompanyId(input.companyId)
  assertSubscriptionOwner(input.role)
  if (!isSubscriptionPlan(input.plan)) {
    throw new SubscriptionError("PLAN_NOT_SUBSCRIBABLE", "Cette formule ne peut pas faire l'objet d'un abonnement.")
  }
  const plan: SubscriptionPlan = input.plan

  const company = await deps.store.getCompany(input.companyId)
  if (!company) throw new SubscriptionError("TENANT_NOT_FOUND", "Entreprise introuvable.")
  assertCompanyEligibleForSubscription(company, { hasLifetimeLicense: await deps.store.hasLifetimeLicense(company.id) })

  let priceId: string
  try {
    priceId = resolveStripePriceIdForPlan(plan, env)
  } catch (error) {
    if (error instanceof BillingConfigError) throw new SubscriptionError("CONFIG", error.message)
    throw error
  }
  const price = await deps.stripe.prices.retrieve(priceId, { expand: ["product"] })
  validateSubscriptionPrice(price, plan, priceId)

  const customerId = await ensureSubscriptionCustomer(company, deps)

  // Double clic / onglets : une session ouverte du même plan est réutilisée,
  // celles d'un autre plan sont expirées (un seul Checkout abonnement ouvert).
  const open = await deps.stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 10 })
  for (const session of open.data) {
    if (!isSubscriptionCheckoutSession(session)) continue
    if (session.metadata?.license_plan === plan && session.url) {
      return { url: session.url, sessionId: session.id, reused: true }
    }
    await deps.stripe.checkout.sessions.expire(session.id)
  }

  const params = buildSubscriptionCheckoutParams({
    companyId: company.id,
    plan,
    customerId,
    priceId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    trialEligible: isCompanyTrialEligible(company),
  })
  const minuteBucket = Math.floor(now.getTime() / 60_000)
  const session = await deps.stripe.checkout.sessions.create(params, {
    idempotencyKey: `detailflow-subscription-checkout-${company.id}-${plan}-${minuteBucket}`,
  })
  if (!session.url) throw new SubscriptionError("CHECKOUT_URL_MISSING", "Stripe n'a pas renvoyé d'URL de paiement.")
  return { url: session.url, sessionId: session.id, reused: false }
}
