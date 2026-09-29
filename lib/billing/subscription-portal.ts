/**
 * DetailFlow — Session Stripe Customer Portal (Billing uniquement).
 * OWNER uniquement ; le Customer doit appartenir au tenant authentifié.
 * Les changements de formule ne sont PAS supposés activés dans le Portal :
 * ils passeront par l'UX DetailFlow.
 */

import type Stripe from "stripe"
import { assertCustomerBelongsToCompany, type SubscriptionCheckoutStripeClient } from "./subscription-checkout"
import {
  SubscriptionError,
  assertSubscriptionOwner,
  assertValidSubscriptionCompanyId,
  type SubscriptionStore,
} from "./subscription-core"

export interface SubscriptionPortalDeps {
  stripe: Pick<SubscriptionCheckoutStripeClient, "customers"> & {
    billingPortal: { sessions: { create(params: Stripe.BillingPortal.SessionCreateParams): Promise<Stripe.BillingPortal.Session> } }
  }
  store: Pick<SubscriptionStore, "getCompany">
}

export async function createSubscriptionPortalSession(
  input: { companyId: number; role: string; returnUrl: string },
  deps: SubscriptionPortalDeps,
): Promise<{ url: string }> {
  assertValidSubscriptionCompanyId(input.companyId)
  assertSubscriptionOwner(input.role)
  const company = await deps.store.getCompany(input.companyId)
  if (!company) throw new SubscriptionError("TENANT_NOT_FOUND", "Entreprise introuvable.")
  if (!company.stripeCustomerId) {
    throw new SubscriptionError("NO_CUSTOMER", "Aucun compte de facturation Stripe pour cette entreprise.")
  }
  await assertCustomerBelongsToCompany(company.stripeCustomerId, company.id, deps.stripe)
  const session = await deps.stripe.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: input.returnUrl,
  })
  return { url: session.url }
}
