/**
 * Règles contractuelles PURES : snapshots, capacité, commission, prépaiement,
 * utilisation des droits, annulation / non-renouvellement. Aucun accès DB.
 */
import { canCreateCustomerSubscription, getCustomerSubscriptionPlatformFeeBps, CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS } from "./plan-policy"
import { isCreationAllowed, resolveFeature, resolveLimit, type LicenseContext } from "@/lib/licensing/resolver"
import { isLicensePlan, type LimitValue } from "@/lib/licensing/types"
import { CustomerSubscriptionError, type CustomerSubscriptionErrorCode } from "./errors"
import { addBillingInterval, nextBillingBoundaryAfter, type BillingInterval } from "./dates"
import { isPaymentModeAllowed, type PaymentMode, type ValidatedPlanConfig } from "./plan-validation"
import { CUSTOMER_SUBSCRIPTION_USABLE_STATUSES, isTerminalStatus } from "./statuses"

const INT4_MAX = 2_147_483_647

/* ------------------------------- Capacité -------------------------------- */

export type CapacityView = {
  activeCount: number
  /** null = illimité. */
  maxActive: LimitValue
  remaining: number | null
  /** activeCount >= maxActive : création bloquée, existant intact. */
  limitReached: boolean
  /** activeCount > maxActive (typiquement après un downgrade DetailFlow). */
  overLimit: boolean
  creationAllowed: boolean
  reason: "FEATURE_DISABLED" | "LIMIT_REACHED" | null
  platformFeeBps: number
}

/**
 * Plan effectif + overrides via le resolver de licences (jamais `plan === "PRO"`).
 * Downgrade : rien n'est réduit, seule la création est refusée. Upgrade : la
 * nouvelle limite s'applique immédiatement, sans toucher aux contrats.
 */
export function evaluateCapacity(ctx: LicenseContext, activeCount: number, now: Date = new Date()): CapacityView {
  const count = Number.isInteger(activeCount) && activeCount >= 0 ? activeCount : 0
  const enabled = resolveFeature(ctx, "customer_subscriptions", now)
  const maxActive = resolveLimit(ctx, "maxActiveCustomerSubscriptions")
  const platformFeeBps = resolvePlatformFeeBps(ctx.plan)

  // Garde-fou de cohérence avec la politique historique (plan sans override).
  if (ctx.plan === null || isLicensePlan(ctx.plan)) {
    const policy = canCreateCustomerSubscription({ plan: ctx.plan, activeCount: count })
    if (policy.maxActive !== maxActive) throw new CustomerSubscriptionError("INTERNAL_ERROR")
  }

  const unlimited = maxActive === null
  const remaining = unlimited ? null : Math.max(0, maxActive - count)
  const limitReached = !unlimited && count >= maxActive
  const reason = !enabled ? "FEATURE_DISABLED" : isCreationAllowed(maxActive, count) ? null : "LIMIT_REACHED"
  return {
    activeCount: count,
    maxActive,
    remaining,
    limitReached,
    overLimit: !unlimited && count > maxActive,
    creationAllowed: reason === null,
    reason,
    platformFeeBps,
  }
}

/* ------------------------------ Commission ------------------------------- */

/**
 * Commission du plan EFFECTIF au moment du paiement (pas figée au contrat).
 * Plan stocké invalide : fail-safe sur la commission la plus haute du barème
 * (la création est de toute façon bloquée par le resolver).
 */
export function resolvePlatformFeeBps(plan: string | null): number {
  if (plan === null) return getCustomerSubscriptionPlatformFeeBps(null)
  if (isLicensePlan(plan)) return getCustomerSubscriptionPlatformFeeBps(plan)
  return Math.max(...Object.values(CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS))
}

/** Montant de commission (arrondi inférieur, entier, borné au brut). */
export function computePlatformFeeAmountCents(grossCents: number, bps: number): number {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0 || grossCents > INT4_MAX) throw new CustomerSubscriptionError("INVALID_PLAN")
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new CustomerSubscriptionError("INTERNAL_ERROR")
  return Math.floor((grossCents * bps) / 10_000)
}

/* ------------------------------ Prépaiement ------------------------------ */

/** price × cycles, entier, borné à int4 (colonne grossAmountCents). */
export function computePrepaidTotalCents(priceCents: number, cycles: number): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || !Number.isSafeInteger(cycles) || cycles <= 0) {
    throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE")
  }
  const total = priceCents * cycles
  if (!Number.isSafeInteger(total) || total > INT4_MAX) throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE")
  return total
}

/* ------------------------------- Snapshots ------------------------------- */

export type ContractSnapshot = {
  planNameSnapshot: string
  priceCentsSnapshot: number
  currency: string
  billingIntervalUnitSnapshot: string
  billingIntervalCountSnapshot: number
  includedUsesPerCycleSnapshot: number
  includedServiceId: number
  includedServiceNameSnapshot: string
  commitmentUnitSnapshot: string
  commitmentCountSnapshot: number
  renewalModeSnapshot: string
  renewalNoticeDaysSnapshot: number | null
  prepaidBillingCyclesSnapshot: number | null
  paymentMode: PaymentMode
  initialCleaningRequiredSnapshot: boolean
  initialServiceNameSnapshot: string | null
  initialServicePriceCentsSnapshot: number | null
}

/**
 * Copie FIGÉE des conditions de la formule. Après création, modifier la
 * formule (ou la prestation) ne modifie jamais ces valeurs.
 */
export function buildContractSnapshot(input: {
  plan: ValidatedPlanConfig
  paymentMode: unknown
  includedService: { id: number; name: string }
  initialService: { name: string; priceCents: number } | null
}): ContractSnapshot {
  const { plan } = input
  if (plan.status !== "active") throw new CustomerSubscriptionError("PLAN_NOT_ACTIVE")
  if (!isPaymentModeAllowed(plan, input.paymentMode)) throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE")
  const prepaid = input.paymentMode === "prepaid"
  if (prepaid) computePrepaidTotalCents(plan.priceCents, plan.prepaidBillingCycles ?? 0)
  const initialPrice = input.initialService?.priceCents ?? null
  if (initialPrice !== null && (!Number.isInteger(initialPrice) || initialPrice < 0)) throw new CustomerSubscriptionError("SERVICE_NOT_FOUND")

  return {
    planNameSnapshot: plan.name,
    priceCentsSnapshot: plan.priceCents,
    currency: plan.currency,
    billingIntervalUnitSnapshot: plan.billingIntervalUnit,
    billingIntervalCountSnapshot: plan.billingIntervalCount,
    includedUsesPerCycleSnapshot: plan.includedUsesPerCycle,
    includedServiceId: input.includedService.id,
    includedServiceNameSnapshot: input.includedService.name,
    commitmentUnitSnapshot: plan.commitmentUnit,
    commitmentCountSnapshot: plan.commitmentCount,
    // Prépayé V1 : jamais de reconduction automatique (CHECK schéma).
    renewalModeSnapshot: prepaid ? "none" : plan.renewalMode,
    renewalNoticeDaysSnapshot: plan.renewalNoticeDays,
    prepaidBillingCyclesSnapshot: prepaid ? plan.prepaidBillingCycles : null,
    paymentMode: input.paymentMode as PaymentMode,
    initialCleaningRequiredSnapshot: plan.initialCleaningRequired,
    initialServiceNameSnapshot: plan.initialCleaningRequired ? (input.initialService?.name ?? null) : null,
    initialServicePriceCentsSnapshot: plan.initialCleaningRequired ? initialPrice : null,
  }
}

/** Statut initial : le nettoyage initial précède tout paiement / ancre de facturation. */
export function initialStatusFor(snapshot: Pick<ContractSnapshot, "initialCleaningRequiredSnapshot">) {
  return snapshot.initialCleaningRequiredSnapshot ? ("pending_initial_cleaning" as const) : ("pending_payment" as const)
}

/* --------------------------- Utilisation droits -------------------------- */

export type SubscriptionTimeline = {
  status: string
  paymentMode: string
  billingIntervalUnitSnapshot: string
  billingIntervalCountSnapshot: number
  renewalModeSnapshot: string
  billingAnchorAt: Date | null
  currentTermEndsAt: Date | null
  prepaidUntil: Date | null
  cancelAt: Date | null
  renewalOptOutAt: Date | null
}

export type UsabilityCheck = { allowed: true } | { allowed: false; reason: CustomerSubscriptionErrorCode }

/**
 * Un NOUVEAU droit est-il utilisable maintenant ? Ne touche jamais aux
 * réservations déjà existantes (un past_due n'annule aucun booking).
 */
export function canUseEntitlement(sub: SubscriptionTimeline, now: Date): UsabilityCheck {
  if (sub.status === "past_due") return { allowed: false, reason: "PAST_DUE" }
  if (isTerminalStatus(sub.status)) return { allowed: false, reason: "ALREADY_CANCELLED" }
  if (!(CUSTOMER_SUBSCRIPTION_USABLE_STATUSES as readonly string[]).includes(sub.status)) {
    return { allowed: false, reason: "SUBSCRIPTION_NOT_USABLE" }
  }
  const t = now.getTime()
  if (sub.cancelAt && t >= sub.cancelAt.getTime()) return { allowed: false, reason: "ALREADY_CANCELLED" }
  if (sub.prepaidUntil && t >= sub.prepaidUntil.getTime()) return { allowed: false, reason: "SUBSCRIPTION_NOT_USABLE" }
  const termIsFinal = sub.renewalModeSnapshot === "none" || sub.renewalOptOutAt !== null
  if (termIsFinal && sub.currentTermEndsAt && t >= sub.currentTermEndsAt.getTime()) {
    return { allowed: false, reason: "SUBSCRIPTION_NOT_USABLE" }
  }
  return { allowed: true }
}

/* ------------------------ Annulation / renouvellement -------------------- */

function intervalOf(sub: SubscriptionTimeline): BillingInterval {
  return { unit: sub.billingIntervalUnitSnapshot as BillingInterval["unit"], count: sub.billingIntervalCountSnapshot }
}

/**
 * Date d'effet MINIMALE d'une annulation demandée à `now` (primitives
 * configurables, aucune règle juridique codée en dur) :
 *  - pas encore démarré (aucune ancre) : immédiat, rien n'a été facturé ;
 *  - prépayé : fin de la période prépayée ;
 *  - engagement en cours : fin du terme courant (jamais au milieu) ;
 *  - sans engagement / engagement échu : prochaine frontière de facturation.
 */
export function computeEarliestCancellationAt(sub: SubscriptionTimeline, now: Date): Date {
  if (!sub.billingAnchorAt) return now
  if (sub.paymentMode === "prepaid" && sub.prepaidUntil) return sub.prepaidUntil > now ? sub.prepaidUntil : now
  if (sub.currentTermEndsAt && sub.currentTermEndsAt > now) return sub.currentTermEndsAt
  return nextBillingBoundaryAfter(sub.billingAnchorAt, intervalOf(sub), now)
}

/** Une date demandée ne peut jamais précéder la date minimale ; elle doit tomber sur une frontière. */
export function resolveCancellationAt(sub: SubscriptionTimeline, now: Date, requested?: Date | null): Date {
  const earliest = computeEarliestCancellationAt(sub, now)
  if (!requested) return earliest
  if (Number.isNaN(requested.getTime()) || requested < earliest) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_MUTABLE")
  if (!sub.billingAnchorAt) return requested
  const aligned = nextBillingBoundaryAfter(sub.billingAnchorAt, intervalOf(sub), new Date(requested.getTime() - 1))
  return aligned
}

/** Le non-renouvellement n'a de sens que s'il existe un terme à ne pas reconduire. */
export function canOptOutOfRenewal(sub: Pick<SubscriptionTimeline, "status" | "renewalModeSnapshot" | "renewalOptOutAt" | "paymentMode">) {
  if (isTerminalStatus(sub.status)) return { allowed: false as const, reason: "ALREADY_CANCELLED" as const }
  if (sub.paymentMode === "prepaid" || sub.renewalModeSnapshot === "none") return { allowed: false as const, reason: "INVALID_RENEWAL" as const }
  return { allowed: true as const }
}

export { addBillingInterval }
