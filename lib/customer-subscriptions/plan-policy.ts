/**
 * Abonnements clients (entretien vendu par le tenant à SES clients) —
 * POLITIQUE DE PLAN. Fichier PUR : aucun accès DB, aucun appel Stripe.
 *
 * Sources de vérité :
 *  - disponibilité : planFeature(plan, "customer_subscriptions")  (moteur de licences)
 *  - capacité      : planLimit(plan, "maxActiveCustomerSubscriptions") (moteur de licences)
 *  - commission    : CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS (ci-dessous, couche commerciale)
 *
 * Contrat pour le futur service serveur (lots suivants) :
 *  - `plan` = plan technique EFFECTIF résolu côté serveur pour le companyId de
 *    la session. Jamais un plan, une commission, un maxActive ou un companyId
 *    fourni par le navigateur. Un downgrade/résiliation programmé(e) ne change
 *    rien tant que la licence effective n'a pas changé.
 *  - `activeCount` = contrats du SEUL tenant dont le statut MÉTIER DetailFlow
 *    consomme une place (ACTIVE, et TRIALING si cette notion existe). Les états
 *    CANCELLED / ENDED / EXPIRED / TERMINATED ne consomment pas de place. Ce
 *    statut est propre à DetailFlow, il ne se confond pas avec le statut Stripe.
 *  - Le contrôle de capacité devra être TRANSACTIONNEL/ATOMIQUE côté serveur
 *    (pas de simple SELECT count puis INSERT) : deux requêtes concurrentes ne
 *    doivent pas pouvoir dépasser la limite. Le contrôle UI n'est jamais suffisant.
 *  - Downgrade : les contrats existants continuent normalement (aucune
 *    suppression, annulation ni désactivation) ; seule la CRÉATION est refusée
 *    tant que activeCount >= maxActive.
 *  - Commission : elle suit le plan EFFECTIF et ne doit pas être figée au
 *    premier contrat. Le futur service Stripe Connect devra pouvoir la
 *    resynchroniser lors d'un changement de formule DetailFlow (évite :
 *    Performance -> créer à 0 % -> redescendre sur FREE). La commission
 *    DetailFlow est distincte des frais Stripe.
 */

import { planFeature, planLimit } from "@/lib/licensing/registry"
import { isCreationAllowed } from "@/lib/licensing/resolver"
import type { LicensePlan, LimitValue } from "@/lib/licensing/types"

/** Commission plateforme DetailFlow en basis points (100 bps = 1 %). */
export const CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS: Readonly<Record<LicensePlan, number>> = {
  FREE: 700,
  ESSENTIAL: 700,
  PRO: 300,
  BUSINESS: 0,
  ENTERPRISE: 0,
  FOUNDER: 0,
}

export function getCustomerSubscriptionPlatformFeeBps(plan: LicensePlan): number {
  return CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS[plan]
}

export type CustomerSubscriptionEntitlements = {
  enabled: boolean
  /** `null` = illimité. */
  maxActive: LimitValue
  platformFeeBps: number
}

export function getCustomerSubscriptionEntitlements(plan: LicensePlan): CustomerSubscriptionEntitlements {
  return {
    enabled: planFeature(plan, "customer_subscriptions"),
    maxActive: planLimit(plan, "maxActiveCustomerSubscriptions"),
    platformFeeBps: getCustomerSubscriptionPlatformFeeBps(plan),
  }
}

export type CustomerSubscriptionCapacityInput = {
  plan: LicensePlan
  activeCount: number
}

export type CustomerSubscriptionCreationDeniedReason = "FEATURE_DISABLED" | "LIMIT_REACHED" | "INVALID_COUNT"

export type CustomerSubscriptionCreationCheck = {
  allowed: boolean
  maxActive: LimitValue
  activeCount: number
  /** Places restantes (jamais négatif) ; `null` = illimité. */
  remaining: number | null
  reason: CustomerSubscriptionCreationDeniedReason | null
}

function isValidCount(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

function remainingSlots(maxActive: LimitValue, activeCount: number): number | null {
  return maxActive === null ? null : Math.max(0, maxActive - activeCount)
}

/** Une NOUVELLE création est-elle autorisée ? (ne concerne jamais l'existant). */
export function canCreateCustomerSubscription({
  plan,
  activeCount,
}: CustomerSubscriptionCapacityInput): CustomerSubscriptionCreationCheck {
  const { enabled, maxActive } = getCustomerSubscriptionEntitlements(plan)

  if (!isValidCount(activeCount)) {
    return { allowed: false, maxActive, activeCount, remaining: null, reason: "INVALID_COUNT" }
  }

  const remaining = remainingSlots(maxActive, activeCount)
  if (!enabled) return { allowed: false, maxActive, activeCount, remaining, reason: "FEATURE_DISABLED" }
  if (!isCreationAllowed(maxActive, activeCount)) {
    return { allowed: false, maxActive, activeCount, remaining, reason: "LIMIT_REACHED" }
  }
  return { allowed: true, maxActive, activeCount, remaining, reason: null }
}

export type CustomerSubscriptionUsage = {
  activeCount: number
  maxActive: LimitValue
  unlimited: boolean
  remaining: number | null
  /** activeCount >= maxActive (création bloquée, module toujours accessible). */
  limitReached: boolean
  /** activeCount > maxActive (typiquement après un downgrade). */
  overLimit: boolean
  platformFeeBps: number
}

/** Données structurées d'affichage (« 7 / 10 », « Illimité ») — sans texte UI. */
export function getCustomerSubscriptionUsage({
  plan,
  activeCount,
}: CustomerSubscriptionCapacityInput): CustomerSubscriptionUsage {
  const { maxActive, platformFeeBps } = getCustomerSubscriptionEntitlements(plan)
  const count = isValidCount(activeCount) ? activeCount : 0
  const unlimited = maxActive === null
  return {
    activeCount: count,
    maxActive,
    unlimited,
    remaining: remainingSlots(maxActive, count),
    limitReached: !unlimited && count >= maxActive,
    overLimit: !unlimited && count > maxActive,
    platformFeeBps,
  }
}
