/**
 * Données STRUCTURÉES (jamais de HTML ni de phrase) pour l'UI future :
 * résumé avant publication, aides contextuelles, presets. Calculées avec les
 * MÊMES règles que le contrat (dates.ts, contract.ts) : aucune seconde logique
 * côté navigateur.
 */
import {
  approximateBillingsPerYear,
  computeActualTermEnd,
  type BillingInterval,
  type Commitment,
} from "./dates"
import { computePrepaidTotalCents } from "./contract"
import type { PlanConfigInput, ValidatedPlanConfig } from "./plan-validation"

/** Codes d'aide centralisés ; l'UI les traduit (une seule source de textes). */
export const PLAN_HELP_CODES = [
  "interval.monthly",
  "interval.every_4_weeks",
  "interval.custom",
  "commitment.none",
  "commitment.months",
  "commitment.billing_cycles",
  "commitment.billings_may_exceed_months",
  "payment.recurring",
  "payment.prepaid",
  "renewal.none",
  "renewal.same_term",
  "renewal.open_ended",
  "cancellation.next_billing_date",
  "cancellation.end_of_commitment",
  "cancellation.end_of_prepaid_period",
  "initial_cleaning.required",
  "plan.changes_apply_to_new_subscriptions_only",
] as const
export type PlanHelpCode = (typeof PLAN_HELP_CODES)[number]

export type CancellationPolicy = "next_billing_date" | "end_of_commitment" | "end_of_prepaid_period"

export type PlanSummary = {
  name: string
  includedService: { id: number | null; name: string | null; usesPerCycle: number }
  price: { amountCents: number; currency: string }
  interval: BillingInterval & { exactDays: number | null; approxBillingsPerYear: number }
  commitment: Commitment & {
    /** Échéances dans le 1er terme (6 mois en 4 semaines → 7). null = sans engagement. */
    firstTermBillingCycles: number | null
    /** Dates d'exemple calculées depuis `referenceStart` (UTC). */
    exampleMinimumEnd: string | null
    exampleTermEnd: string | null
  }
  payment: {
    recurring: boolean
    prepaid: { cycles: number; totalCents: number } | null
  }
  renewal: { mode: ValidatedPlanConfig["renewalMode"]; noticeDays: number | null }
  cancellation: CancellationPolicy
  initialCleaning: { required: boolean; serviceName: string | null }
  platformFee: { bps: number }
  helpCodes: PlanHelpCode[]
  appliesToNewSubscriptionsOnly: true
}

export function buildPlanSummary(input: {
  plan: ValidatedPlanConfig
  includedServiceName: string | null
  initialServiceName?: string | null
  platformFeeBps: number
  referenceStart?: Date
}): PlanSummary {
  const { plan } = input
  const interval: BillingInterval = { unit: plan.billingIntervalUnit, count: plan.billingIntervalCount }
  const commitment: Commitment = { unit: plan.commitmentUnit, count: plan.commitmentCount }
  const term = computeActualTermEnd(input.referenceStart ?? new Date(), interval, commitment)

  const help: PlanHelpCode[] = []
  if (interval.unit === "month" && interval.count === 1) help.push("interval.monthly")
  else if (interval.unit === "week" && interval.count === 4) help.push("interval.every_4_weeks")
  else help.push("interval.custom")
  if (commitment.unit === "none") help.push("commitment.none")
  else help.push(commitment.unit === "month" ? "commitment.months" : "commitment.billing_cycles")
  if (commitment.unit === "month" && interval.unit === "week") help.push("commitment.billings_may_exceed_months")
  if (plan.allowRecurringPayment) help.push("payment.recurring")
  if (plan.allowPrepaidPayment) help.push("payment.prepaid")
  help.push(`renewal.${plan.renewalMode}` as PlanHelpCode)

  const cancellation: CancellationPolicy =
    !plan.allowRecurringPayment && plan.allowPrepaidPayment
      ? "end_of_prepaid_period"
      : commitment.unit === "none"
        ? "next_billing_date"
        : "end_of_commitment"
  help.push(`cancellation.${cancellation}` as PlanHelpCode)
  if (plan.initialCleaningRequired) help.push("initial_cleaning.required")
  help.push("plan.changes_apply_to_new_subscriptions_only")

  return {
    name: plan.name,
    includedService: { id: plan.includedServiceId, name: input.includedServiceName, usesPerCycle: plan.includedUsesPerCycle },
    price: { amountCents: plan.priceCents, currency: plan.currency },
    interval: {
      ...interval,
      exactDays: interval.unit === "week" ? interval.count * 7 : null,
      approxBillingsPerYear: approximateBillingsPerYear(interval),
    },
    commitment: {
      ...commitment,
      firstTermBillingCycles: term?.billingCycles ?? null,
      exampleMinimumEnd: term?.minimumEnd.toISOString() ?? null,
      exampleTermEnd: term?.termEnd.toISOString() ?? null,
    },
    payment: {
      recurring: plan.allowRecurringPayment,
      prepaid:
        plan.allowPrepaidPayment && plan.prepaidBillingCycles
          ? { cycles: plan.prepaidBillingCycles, totalCents: computePrepaidTotalCents(plan.priceCents, plan.prepaidBillingCycles) }
          : null,
    },
    renewal: { mode: plan.renewalMode, noticeDays: plan.renewalNoticeDays },
    cancellation,
    initialCleaning: { required: plan.initialCleaningRequired, serviceName: input.initialServiceName ?? null },
    platformFee: { bps: input.platformFeeBps },
    helpCodes: help,
    appliesToNewSubscriptionsOnly: true,
  }
}

/**
 * Presets = simples raccourcis UX. Ils produisent un PlanConfigInput qui passe
 * par validatePlanConfig, exactement comme une saisie manuelle.
 */
export const PLAN_PRESETS = {
  monthly: {
    billingIntervalUnit: "month", billingIntervalCount: 1, commitmentUnit: "none", commitmentCount: 0,
    renewalMode: "open_ended", allowRecurringPayment: true, allowPrepaidPayment: false, prepaidBillingCycles: null,
  },
  every_4_weeks: {
    billingIntervalUnit: "week", billingIntervalCount: 4, commitmentUnit: "none", commitmentCount: 0,
    renewalMode: "open_ended", allowRecurringPayment: true, allowPrepaidPayment: false, prepaidBillingCycles: null,
  },
  pack_6_months: {
    billingIntervalUnit: "month", billingIntervalCount: 1, commitmentUnit: "month", commitmentCount: 6,
    renewalMode: "open_ended", allowRecurringPayment: true, allowPrepaidPayment: false, prepaidBillingCycles: null,
  },
  annual: {
    billingIntervalUnit: "month", billingIntervalCount: 1, commitmentUnit: "month", commitmentCount: 12,
    renewalMode: "same_term", allowRecurringPayment: true, allowPrepaidPayment: false, prepaidBillingCycles: null,
  },
  prepaid: {
    billingIntervalUnit: "month", billingIntervalCount: 1, commitmentUnit: "none", commitmentCount: 0,
    renewalMode: "none", allowRecurringPayment: false, allowPrepaidPayment: true, prepaidBillingCycles: 6,
  },
} as const satisfies Record<string, PlanConfigInput>

export type PlanPresetKey = keyof typeof PLAN_PRESETS

export function applyPlanPreset(key: PlanPresetKey, base: PlanConfigInput = {}): PlanConfigInput {
  return { includedUsesPerCycle: 1, ...base, ...PLAN_PRESETS[key] }
}
