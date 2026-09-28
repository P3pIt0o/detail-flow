/**
 * DetailFlow — Moteur CENTRAL des règles commerciales d'abonnement.
 *
 * Source de vérité unique pour :
 *   1. la commission DetailFlow prélevée via Stripe Connect, par offre ;
 *   2. son plafond par MOIS CIVIL (fuseau du tenant) ;
 *   3. la réduction fidélité appliquée au PRIX de l'abonnement DetailFlow.
 *
 * Fichier PUR : aucun import serveur, aucune DB, aucun appel Stripe, aucun
 * accès à process.env. Les prix mensuels ne sont PAS redéfinis ici : ils
 * restent dans `lib/pricing/plans.ts` (consommés par `lib/billing/config.ts`).
 *
 * Séparation stricte Billing / Connect : ce module ne dépend pas de
 * lib/payments. La commission Connect et la fidélité Billing sont deux
 * calculs indépendants — la fidélité ne modifie JAMAIS le taux, le plafond,
 * les frais Stripe, les SMS ni les droits.
 *
 * Tous les montants sont des centimes entiers.
 */

import type { BillingMode } from "./types"
import type { LicensePlan } from "../licensing/types"

/* -------------------------------------------------------------------------- */
/*  1. Commissions par offre                                                  */
/* -------------------------------------------------------------------------- */

export type CommissionPlan = Extract<LicensePlan, "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE">

export type CommissionRule = {
  /** Taux en points de base (200 = 2 %). */
  readonly feeBps: number
  /** Plafond de commission par mois civil, en centimes. */
  readonly monthlyFeeCapCents: number
}

export const COMMISSION_RULES: Readonly<Record<CommissionPlan, CommissionRule>> = {
  FREE: { feeBps: 200, monthlyFeeCapCents: 1990 },
  PRO: { feeBps: 100, monthlyFeeCapCents: 500 },
  BUSINESS: { feeBps: 50, monthlyFeeCapCents: 500 },
  ENTERPRISE: { feeBps: 25, monthlyFeeCapCents: 600 },
} as const

/** Lifetime : 0 % et plafond 0, quel que soit son licensePlan (BUSINESS). */
export const LIFETIME_COMMISSION_RULE: CommissionRule = { feeBps: 0, monthlyFeeCapCents: 0 } as const

export function isCommissionPlan(plan: unknown): plan is CommissionPlan {
  return plan === "FREE" || plan === "PRO" || plan === "BUSINESS" || plan === "ENTERPRISE"
}

export type ResolvedCommission = {
  feeBps: number
  /** `null` = aucun plafond connu (uniquement pour le fallback historique). */
  monthlyFeeCapCents: number | null
  source: "lifetime" | "override" | "plan" | "fallback"
}

/**
 * Résout la commission applicable à un tenant.
 *
 * Priorité :
 *   1. billingMode === "lifetime"         → 0 % / plafond 0 (jamais via licensePlan)
 *   2. override Super Admin platformFeeBps → taux override, plafond de l'offre
 *   3. taux de l'offre commerciale
 *   4. fallback global (anciens cas non identifiables, ex. ESSENTIAL/FOUNDER/null)
 */
export function resolveCommercialCommission(
  tenant: {
    billingMode: BillingMode | string | null | undefined
    licensePlan: LicensePlan | string | null | undefined
    platformFeeBps: number | null | undefined
  },
  fallbackFeeBps: number,
): ResolvedCommission {
  if (tenant.billingMode === "lifetime") {
    return { ...LIFETIME_COMMISSION_RULE, source: "lifetime" }
  }

  const rule = isCommissionPlan(tenant.licensePlan) ? COMMISSION_RULES[tenant.licensePlan] : null
  const override = tenant.platformFeeBps

  if (override != null && Number.isInteger(override) && override >= 0) {
    return { feeBps: override, monthlyFeeCapCents: rule?.monthlyFeeCapCents ?? null, source: "override" }
  }
  if (rule) {
    return { feeBps: rule.feeBps, monthlyFeeCapCents: rule.monthlyFeeCapCents, source: "plan" }
  }
  return { feeBps: toNonNegativeInt(fallbackFeeBps), monthlyFeeCapCents: null, source: "fallback" }
}

/* -------------------------------------------------------------------------- */
/*  2. Plafond par mois civil                                                 */
/* -------------------------------------------------------------------------- */

/** Fuseau par défaut, identique au défaut de `companies.timezone`. */
export const DEFAULT_BUSINESS_TIMEZONE = "Europe/Paris"

function monthKeyIn(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date)
    const y = parts.find((p) => p.type === "year")?.value
    const m = parts.find((p) => p.type === "month")?.value
    return y && m ? `${y}-${m}` : null
  } catch {
    return null
  }
}

/**
 * Clé du mois civil métier `YYYY-MM` dans le fuseau du tenant.
 * Fuseau absent ou invalide → Europe/Paris (jamais UTC arbitraire).
 */
export function getBusinessMonthKey(date: Date, timeZone: string | null | undefined): string {
  const key = (timeZone ? monthKeyIn(date, timeZone) : null) ?? monthKeyIn(date, DEFAULT_BUSINESS_TIMEZONE)
  if (!key) throw new RangeError("getBusinessMonthKey: date invalide")
  return key
}

function toNonNegativeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Commission réellement prélevable sur un paiement, compte tenu de ce qui a
 * déjà été consommé dans le mois civil.
 *
 *   - jamais négative, toujours un entier
 *   - jamais supérieure à la commission théorique
 *   - la somme consommée ne dépasse jamais `monthlyCapCents`
 *   - `monthlyCapCents === null` → aucun plafond (fallback historique)
 */
export function computeCappedPlatformFeeCents(input: {
  grossAmountCents: number
  feeBps: number
  monthlyCapCents: number | null
  alreadyConsumedCents: number
}): number {
  const gross = toNonNegativeInt(input.grossAmountCents)
  const bps = toNonNegativeInt(input.feeBps)
  const theoretical = Math.round((gross * bps) / 10_000)
  if (input.monthlyCapCents === null) return theoretical

  const cap = toNonNegativeInt(input.monthlyCapCents)
  const consumed = toNonNegativeInt(input.alreadyConsumedCents)
  const remaining = Math.max(0, cap - consumed)
  return Math.min(theoretical, remaining)
}

/* -------------------------------------------------------------------------- */
/*  3. Réduction fidélité (prix de l'abonnement uniquement)                   */
/* -------------------------------------------------------------------------- */

/** Paliers triés par ancienneté croissante (mois calendaires complets). */
export const LOYALTY_DISCOUNT_TIERS: readonly { readonly minMonths: number; readonly discountBps: number }[] = [
  { minMonths: 0, discountBps: 0 },
  { minMonths: 6, discountBps: 500 },
  { minMonths: 12, discountBps: 1000 },
  { minMonths: 18, discountBps: 1500 },
  { minMonths: 24, discountBps: 1750 },
  { minMonths: 30, discountBps: 2000 },
] as const

/** 20 % : maximum absolu, jamais dépassé. */
export const MAX_LOYALTY_DISCOUNT_BPS = 2000

/** `d + n mois`, jour borné à la fin du mois cible (31 jan + 1 mois = 28/29 fév). */
function addCalendarMonthsUtc(d: Date, n: number): number {
  const totalMonth = d.getUTCMonth() + n
  const year = d.getUTCFullYear() + Math.floor(totalMonth / 12)
  const month = ((totalMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )
}

/**
 * Nombre de MOIS CALENDAIRES COMPLETS écoulés depuis `startedAt`
 * (jamais jours / 30). `null`, date invalide ou future → 0.
 */
export function getFullCalendarMonthsElapsed(startedAt: Date | null | undefined, now: Date): number {
  if (!startedAt || Number.isNaN(startedAt.getTime()) || Number.isNaN(now.getTime())) return 0
  if (startedAt.getTime() > now.getTime()) return 0
  let months =
    (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 + (now.getUTCMonth() - startedAt.getUTCMonth())
  if (addCalendarMonthsUtc(startedAt, months) > now.getTime()) months -= 1
  return Math.max(0, months)
}

/**
 * Réduction fidélité en bps à partir de `companies.continuousSubscriptionStartedAt`
 * (première facture réellement payée ; trial exclu). Valeurs : 0, 500, 1000,
 * 1500, 1750, 2000.
 */
export function getLoyaltyDiscountBps(startedAt: Date | null | undefined, now: Date): number {
  const months = getFullCalendarMonthsElapsed(startedAt, now)
  let bps = 0
  for (const tier of LOYALTY_DISCOUNT_TIERS) {
    if (months >= tier.minMonths) bps = tier.discountBps
  }
  return Math.min(bps, MAX_LOYALTY_DISCOUNT_BPS)
}

/** Prix de l'abonnement après réduction fidélité (centimes entiers, arrondi au centime). */
export function applyLoyaltyDiscountCents(basePriceCents: number, discountBps: number): number {
  const base = toNonNegativeInt(basePriceCents)
  const bps = Math.min(toNonNegativeInt(discountBps), MAX_LOYALTY_DISCOUNT_BPS)
  return Math.round((base * (10_000 - bps)) / 10_000)
}
