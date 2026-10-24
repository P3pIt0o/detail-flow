/**
 * Période de droits indépendante de l'échéancier (L27), PUR.
 *  - une formule donne N prestations par période de 1, 3 ou 12 mois ;
 *  - le client paie la période en une fois (= V1 : droits = facturation) ou chaque mois ;
 *  - mensualité = prix ÷ n arrondi au centime le plus proche (demi-centime vers le haut),
 *    dernière échéance = prix − (n − 1) × mensualité : chaque période coûte exactement son prix.
 * Colonnes NULL = comportement V1 strictement inchangé.
 */
import { CustomerSubscriptionError } from "./errors"
import { boundaryIndexAtOrAfter, type BillingInterval, type CommitmentUnit, type RenewalMode } from "./dates"

export const RIGHTS_PERIOD_MONTHS = [1, 3, 12] as const
export type RightsPeriodMonths = (typeof RIGHTS_PERIOD_MONTHS)[number]
export const PAYMENT_SCHEDULES = ["period", "monthly", "customer_choice"] as const
export type PaymentSchedule = (typeof PAYMENT_SCHEDULES)[number]
export const SCHEDULE_CHOICES = ["period", "monthly"] as const
export type ScheduleChoice = (typeof SCHEDULE_CHOICES)[number]

export const isRightsPeriodMonths = (v: unknown): v is RightsPeriodMonths => (RIGHTS_PERIOD_MONTHS as readonly unknown[]).includes(v)
export const isPaymentSchedule = (v: unknown): v is PaymentSchedule => (PAYMENT_SCHEDULES as readonly unknown[]).includes(v)
export const isScheduleChoice = (v: unknown): v is ScheduleChoice => (SCHEDULE_CHOICES as readonly unknown[]).includes(v)

export type InstallmentSplit = { installmentCents: number; lastInstallmentCents: number; adjustmentCents: number }

/** null si aucune échéance strictement positive n'est possible. */
export function splitInstallments(periodPriceCents: number, count: number): InstallmentSplit | null {
  if (!Number.isSafeInteger(periodPriceCents) || periodPriceCents <= 0 || !Number.isInteger(count) || count <= 0) return null
  const installmentCents = Math.floor((2 * periodPriceCents + count) / (2 * count))
  const lastInstallmentCents = periodPriceCents - (count - 1) * installmentCents
  if (installmentCents < 1 || lastInstallmentCents < 1) return null
  return { installmentCents, lastInstallmentCents, adjustmentCents: lastInstallmentCents - installmentCents }
}

/** Le paiement mensuel n'existe que si la période dure plus d'un mois. */
export const isMonthlyInstallments = (schedule: PaymentSchedule | null, periodMonths: number | null) =>
  (schedule === "monthly" || schedule === "customer_choice") && (periodMonths ?? 0) > 1

/**
 * Choix d'échéancier du contrat, re-vérifié serveur (jamais la valeur du navigateur telle quelle).
 * V1 (formule sans période de droits) : aucun choix, toujours null.
 */
export function resolveScheduleChoice(schedule: PaymentSchedule | null, requested: unknown): ScheduleChoice | null {
  if (schedule === null) return null
  if (schedule === "customer_choice") {
    if (!isScheduleChoice(requested)) throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE", [{ field: "paymentScheduleChoice", code: "INVALID_PAYMENT_MODE" }])
    return requested
  }
  if (requested != null && requested !== schedule) throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE", [{ field: "paymentScheduleChoice", code: "INVALID_PAYMENT_MODE" }])
  return schedule
}

export type SchedulePlan = {
  priceCents: number
  billingIntervalUnit: "week" | "month"
  billingIntervalCount: number
  commitmentUnit: CommitmentUnit
  commitmentCount: number
  renewalMode: RenewalMode
  rightsPeriodMonths: number | null
  paymentSchedule: PaymentSchedule | null
}

export type ScheduleSnapshot = {
  priceCentsSnapshot: number
  billingIntervalUnitSnapshot: string
  billingIntervalCountSnapshot: number
  commitmentUnitSnapshot: string
  commitmentCountSnapshot: number
  renewalModeSnapshot: string
  rightsPeriodMonthsSnapshot: number | null
  periodPriceCentsSnapshot: number | null
  installmentsPerPeriodSnapshot: number | null
}

/**
 * Conditions financières figées. Seul le paiement mensuel d'une période > 1 mois
 * renseigne les snapshots de période ; « en une fois » reste un contrat V1
 * (prix de la période, facturé à chaque période).
 */
export function scheduleSnapshot(plan: SchedulePlan, choice: ScheduleChoice | null): ScheduleSnapshot {
  const v1: ScheduleSnapshot = {
    priceCentsSnapshot: plan.priceCents,
    billingIntervalUnitSnapshot: plan.billingIntervalUnit,
    billingIntervalCountSnapshot: plan.billingIntervalCount,
    commitmentUnitSnapshot: plan.commitmentUnit,
    commitmentCountSnapshot: plan.commitmentCount,
    renewalModeSnapshot: plan.renewalMode,
    rightsPeriodMonthsSnapshot: null,
    periodPriceCentsSnapshot: null,
    installmentsPerPeriodSnapshot: null,
  }
  const months = plan.rightsPeriodMonths
  if (choice === null || months === null || !isMonthlyInstallments(plan.paymentSchedule, months)) return v1
  if (choice === "period") {
    // Branche « en une fois » d'une formule au choix : la formule porte l'engagement du mensuel.
    return plan.renewalMode === "none"
      ? { ...v1, commitmentUnitSnapshot: "month", commitmentCountSnapshot: months, renewalModeSnapshot: "none" }
      : { ...v1, commitmentUnitSnapshot: "none", commitmentCountSnapshot: 0, renewalModeSnapshot: "open_ended" }
  }
  const split = splitInstallments(plan.priceCents, months)
  if (!split) throw new CustomerSubscriptionError("INVALID_PLAN", [{ field: "priceCents", code: "INVALID_PLAN" }])
  return {
    priceCentsSnapshot: split.installmentCents,
    billingIntervalUnitSnapshot: "month",
    billingIntervalCountSnapshot: 1,
    commitmentUnitSnapshot: "month",
    commitmentCountSnapshot: months,
    renewalModeSnapshot: plan.renewalMode,
    rightsPeriodMonthsSnapshot: months,
    periodPriceCentsSnapshot: plan.priceCents,
    installmentsPerPeriodSnapshot: months,
  }
}

/** Fenêtre de droits du contrat : la période de droits si figée, sinon la facturation (V1). */
export function rightsInterval(sub: { rightsPeriodMonthsSnapshot: number | null; billingIntervalUnitSnapshot: string; billingIntervalCountSnapshot: number }): BillingInterval {
  if (sub.rightsPeriodMonthsSnapshot) return { unit: "month", count: sub.rightsPeriodMonthsSnapshot }
  return { unit: sub.billingIntervalUnitSnapshot as BillingInterval["unit"], count: sub.billingIntervalCountSnapshot }
}

const DAY_MS = 86_400_000

/**
 * Position (0..n-1) dans sa période de l'échéance mensuelle qui démarre à `periodStart`.
 * Tolère une dérive de quelques secondes / heures entre Stripe et l'ancre locale.
 */
export function installmentPosition(anchor: Date, periodStart: Date, n: number): { index: number; isLast: boolean } {
  const k = boundaryIndexAtOrAfter(anchor, { unit: "month", count: 1 }, new Date(periodStart.getTime() - DAY_MS))
  const index = k % n
  return { index, isLast: index === n - 1 }
}

/** Ajustement à porter par la facture de cette échéance (0 si aucune). */
export function lastInstallmentAdjustment(
  sub: { billingAnchorAt: Date | null; periodPriceCentsSnapshot: number | null; installmentsPerPeriodSnapshot: number | null },
  periodStart: Date,
): number {
  const n = sub.installmentsPerPeriodSnapshot
  if (!sub.billingAnchorAt || !n || n <= 1 || sub.periodPriceCentsSnapshot == null) return 0
  if (!installmentPosition(sub.billingAnchorAt, periodStart, n).isLast) return 0
  return splitInstallments(sub.periodPriceCentsSnapshot, n)?.adjustmentCents ?? 0
}
