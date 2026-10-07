"use server"

import { requireCompanyMember } from "@/lib/admin"
import { BillingOriginError, resolveBillingOrigin } from "@/lib/billing/billing-origin"
import { getStripe } from "@/lib/payments/stripe-client"
import { openSaasAdminPortal, parseSaasAdminCheckoutPlan, startSaasAdminCheckout } from "@/lib/billing/saas-admin"
import type { SubscriptionCheckoutStripeClient } from "@/lib/billing/subscription-checkout"
import { SubscriptionError } from "@/lib/billing/subscription-core"
import type { SubscriptionPortalDeps } from "@/lib/billing/subscription-portal"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"

export type SaasBillingActionResult = { ok: true; url: string } | { ok: false; error: string }

/** Origine contrôlée par l'environnement ; Host / x-forwarded-host ignorés. */
async function requestOrigin(): Promise<string> {
  return resolveBillingOrigin()
}

function toResult(error: unknown, fallback: string): SaasBillingActionResult {
  if (error instanceof BillingOriginError) {
    console.error("[saas-billing] origine de facturation non configurée")
    return { ok: false, error: fallback }
  }
  if (error instanceof SubscriptionError) {
    console.error("[saas-billing]", error.code, error.message)
    return { ok: false, error: error.message }
  }
  console.error("[saas-billing] erreur:", error instanceof Error ? error.message : error)
  return { ok: false, error: fallback }
}

/** Seul input navigateur accepté : la formule (PRO uniquement en phase de lancement), revalidée serveur. */
export async function startSaasCheckoutAction(plan: string): Promise<SaasBillingActionResult> {
  try {
    parseSaasAdminCheckoutPlan(plan)
  } catch (error) {
    return toResult(error, "Formule indisponible.")
  }
  const member = await requireCompanyMember(["OWNER"])
  try {
    const result = await startSaasAdminCheckout(
      { member, plan, origin: await requestOrigin() },
      { stripe: getStripe() as unknown as SubscriptionCheckoutStripeClient, store: createPgSubscriptionStore() },
    )
    return { ok: true, url: result.url }
  } catch (error) {
    return toResult(error, "Impossible de démarrer la souscription. Réessayez dans un instant.")
  }
}

export async function openSaasPortalAction(): Promise<SaasBillingActionResult> {
  const member = await requireCompanyMember(["OWNER"])
  try {
    const result = await openSaasAdminPortal(
      { member, origin: await requestOrigin() },
      { stripe: getStripe() as unknown as SubscriptionPortalDeps["stripe"], store: createPgSubscriptionStore() },
    )
    return { ok: true, url: result.url }
  } catch (error) {
    return toResult(error, "Impossible d'ouvrir l'espace de facturation.")
  }
}
