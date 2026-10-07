/**
 * DetailFlow — Billing SaaS de la page « Mon abonnement DetailFlow ».
 *
 * Couche fine au-dessus du moteur existant (subscription-checkout / portal) :
 * - n'accepte du navigateur QUE le choix de formule, revalidé ici ;
 * - companyId / rôle / slug proviennent TOUJOURS du contexte serveur
 *   (requireCompanyMember) ;
 * - aucune activation de licence : seul le webhook Billing écrit la licence.
 *
 * Indépendant de Stripe Connect (paiements des detailers) : ce module n'importe
 * rien de lib/payments/** ni de lib/customer-subscriptions/**.
 */

import { BILLING_PLANS } from "./config"
import { createSubscriptionCheckout, type SubscriptionCheckoutDeps } from "./subscription-checkout"
import {
  SubscriptionError,
  describeSubscriptionPlan,
  isSubscriptionPlan,
  type CompanyBillingState,
  type SubscriptionPlan,
  type SubscriptionReturnState,
} from "./subscription-core"
import { createSubscriptionPortalSession, type SubscriptionPortalDeps } from "./subscription-portal"
import { withTenant } from "../tenant-link"

/** Formules commercialisables depuis l'admin. FREE exclu, ENTERPRISE (Équipe) autorisé. */
export const SAAS_ADMIN_CHECKOUT_PLANS = ["PRO", "BUSINESS", "ENTERPRISE"] as const
export type SaasAdminCheckoutPlan = (typeof SAAS_ADMIN_CHECKOUT_PLANS)[number]

export function parseSaasAdminCheckoutPlan(value: unknown): SaasAdminCheckoutPlan {
  if (value === "PRO" || value === "BUSINESS" || value === "ENTERPRISE") return value
  throw new SubscriptionError("PLAN_NOT_SUBSCRIBABLE", "Cette formule n'est pas disponible à la souscription.")
}

/** Contexte serveur minimal (issu de requireCompanyMember, jamais du navigateur). */
export interface SaasAdminMember {
  role: string
  tenant: { id: number; slug: string }
}

export const SAAS_ADMIN_PATH = "/admin/abonnement"
export const SAAS_ADMIN_RETURN_PATH = "/admin/abonnement/retour"

export function buildSaasAdminUrls(slug: string) {
  return {
    page: withTenant(SAAS_ADMIN_PATH, slug),
    success: withTenant(SAAS_ADMIN_RETURN_PATH, slug),
    cancel: withTenant(`${SAAS_ADMIN_PATH}?annule=1`, slug),
    portalReturn: withTenant(SAAS_ADMIN_PATH, slug),
  }
}

function assertOwner(member: SaasAdminMember) {
  if (member.role !== "OWNER") {
    throw new SubscriptionError("NOT_OWNER", "Seul le propriétaire de l'entreprise peut gérer l'abonnement.")
  }
}

/** Démarre le Checkout SaaS : validation formule + rôle AVANT tout appel Stripe. */
export async function startSaasAdminCheckout(
  input: { member: SaasAdminMember; plan: unknown; origin: string },
  deps: SubscriptionCheckoutDeps,
): Promise<{ url: string }> {
  const plan = parseSaasAdminCheckoutPlan(input.plan)
  assertOwner(input.member)
  const urls = buildSaasAdminUrls(input.member.tenant.slug)
  return createSubscriptionCheckout(
    {
      companyId: input.member.tenant.id,
      role: input.member.role,
      plan,
      successUrl: `${input.origin}${urls.success}`,
      cancelUrl: `${input.origin}${urls.cancel}`,
    },
    deps,
  )
}

/** Ouvre le Customer Portal Stripe du tenant serveur (Customer vérifié par le moteur). */
export async function openSaasAdminPortal(
  input: { member: SaasAdminMember; origin: string },
  deps: SubscriptionPortalDeps,
): Promise<{ url: string }> {
  assertOwner(input.member)
  return createSubscriptionPortalSession(
    {
      companyId: input.member.tenant.id,
      role: input.member.role,
      returnUrl: `${input.origin}${buildSaasAdminUrls(input.member.tenant.slug).portalReturn}`,
    },
    deps,
  )
}

/* ------------------------------- Affichage -------------------------------- */

export function getFreePlanDisplay() {
  return { name: BILLING_PLANS.FREE.commercialName, monthlyPriceCents: BILLING_PLANS.FREE.monthlyPriceCents }
}

export function describeCurrentSaasPlanName(licensePlan: string | null): string {
  if (isSubscriptionPlan(licensePlan)) return describeSubscriptionPlan(licensePlan as SubscriptionPlan).name
  return getFreePlanDisplay().name
}

export type SaasStatusBadge = { label: string; tone: "default" | "secondary" | "destructive" | "outline" }

export function describeSaasStatusBadges(
  company: Pick<CompanyBillingState, "subscriptionStatus" | "cancelAtPeriodEnd">,
): SaasStatusBadge[] {
  const badges: SaasStatusBadge[] = []
  switch (company.subscriptionStatus) {
    case "trialing":
      badges.push({ label: "Essai gratuit", tone: "secondary" })
      break
    case "active":
      badges.push({ label: "Actif", tone: "default" })
      break
    case "past_due":
    case "unpaid":
      badges.push({ label: "Paiement à régulariser", tone: "destructive" })
      break
    case "paused":
      badges.push({ label: "En pause", tone: "outline" })
      break
    default:
      if (company.subscriptionStatus) badges.push({ label: "Confirmation en cours", tone: "outline" })
  }
  if (company.cancelAtPeriodEnd) badges.push({ label: "Résiliation programmée", tone: "outline" })
  return badges
}

export function describeSaasPeriodEndLabel(
  company: Pick<CompanyBillingState, "subscriptionStatus" | "cancelAtPeriodEnd">,
): string {
  if (company.cancelAtPeriodEnd) return "Fin de l'abonnement"
  if (company.subscriptionStatus === "trialing") return "Fin de l'essai gratuit"
  return "Prochaine échéance"
}

/* ------------------------------ Page retour ------------------------------- */

export const RETURN_POLL_INTERVAL_MS = 2500
export const RETURN_POLL_MAX_ATTEMPTS = 12

export function shouldPollSubscriptionReturn(state: SubscriptionReturnState): boolean {
  return state === "pending"
}
