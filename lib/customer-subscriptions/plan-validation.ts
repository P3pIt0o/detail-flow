/**
 * VALIDATEUR SERVEUR UNIQUE des formules d'entretien. Utilisé à la création,
 * à la modification, à la publication ET au moment de figer un contrat (la
 * formule est rechargée en DB puis revalidée). Le navigateur ne décide jamais
 * du prix réel, de la devise, de la durée effective ni du tenant.
 */
import { CustomerSubscriptionError, type CustomerSubscriptionErrorCode, type FieldIssue } from "./errors"
import type { BillingIntervalUnit, CommitmentUnit, RenewalMode } from "./dates"
import { isMonthlyInstallments, isPaymentSchedule, isRightsPeriodMonths, splitInstallments, type PaymentSchedule } from "./rights-period"

export const PLAN_STATUSES = ["draft", "active", "archived"] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]
export const PLAN_VISIBILITIES = ["public", "unlisted", "private"] as const
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number]
export type PaymentMode = "recurring" | "prepaid"

export const PLAN_LIMITS = {
  nameMax: 120,
  descriptionMax: 2000,
  priceCentsMax: 10_000_000,
  usesPerCycleMax: 100,
  weekCountMax: 52,
  monthCountMax: 12,
  commitmentMonthsMax: 60,
  commitmentCyclesMax: 260,
  prepaidCyclesMax: 60,
  renewalNoticeDaysMax: 365,
} as const

export type ValidatedPlanConfig = {
  name: string
  description: string | null
  priceCents: number
  currency: string
  billingIntervalUnit: BillingIntervalUnit
  billingIntervalCount: number
  includedUsesPerCycle: number
  includedServiceId: number | null
  commitmentUnit: CommitmentUnit
  commitmentCount: number
  renewalMode: RenewalMode
  renewalNoticeDays: number | null
  initialCleaningRequired: boolean
  initialServiceId: number | null
  allowRecurringPayment: boolean
  allowPrepaidPayment: boolean
  prepaidBillingCycles: number | null
  visibility: PlanVisibility
  status: PlanStatus
  /** L27 : null = V1 (un cycle de droits = une période de facturation). */
  rightsPeriodMonths: number | null
  paymentSchedule: PaymentSchedule | null
}

export type PlanConfigInput = { [K in keyof ValidatedPlanConfig]?: unknown }

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)
const inRange = (v: unknown, min: number, max: number): v is number => isInt(v) && v >= min && v <= max
const optionalId = (v: unknown): number | null | undefined =>
  v == null || v === "" ? null : isInt(v) && v > 0 ? v : undefined

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
}

export type PlanValidation = { ok: true; value: ValidatedPlanConfig } | { ok: false; code: CustomerSubscriptionErrorCode; issues: FieldIssue[] }

/**
 * Règles :
 *  - priceCents entier >= 0 ; includedUsesPerCycle entier > 0 ;
 *  - billingInterval week|month avec count > 0 (bornes raisonnables) ;
 *  - none ⇔ 0 ; month / billing_cycle ⇔ > 0 ; same_term interdit sans engagement ;
 *  - prepaid autorisé ⇒ prepaidBillingCycles > 0 ; au moins un mode de paiement ;
 *  - une formule ACTIVE doit avoir une prestation incluse (brouillon : facultatif) ;
 *  - période de droits (L27, les deux champs ou aucun) : 1/3/12 mois = facturation de référence,
 *    jamais de prepaid ; paiement mensuel d'une période > 1 mois ⇒ engagement = la période et
 *    renouvellement same_term | none (jamais open_ended : droits consommés puis arrêt).
 * L'appartenance des services au tenant est vérifiée par le moteur (DB).
 */
export function validatePlanConfig(input: PlanConfigInput): PlanValidation {
  const issues: FieldIssue[] = []
  const add = (field: string, code: CustomerSubscriptionErrorCode) => issues.push({ field, code })

  const name = cleanText(input.name)
  if (!name || name.length > PLAN_LIMITS.nameMax) add("name", "INVALID_PLAN")
  const description = input.description == null ? "" : typeof input.description === "string" ? input.description.trim() : null
  if (description === null || description.length > PLAN_LIMITS.descriptionMax) add("description", "INVALID_PLAN")

  if (!inRange(input.priceCents, 0, PLAN_LIMITS.priceCentsMax)) add("priceCents", "INVALID_PLAN")
  const currency = input.currency == null ? "EUR" : input.currency
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) add("currency", "INVALID_PLAN")
  if (!inRange(input.includedUsesPerCycle, 1, PLAN_LIMITS.usesPerCycleMax)) add("includedUsesPerCycle", "INVALID_PLAN")

  const unit = input.billingIntervalUnit
  if (unit !== "week" && unit !== "month") add("billingIntervalUnit", "INVALID_INTERVAL")
  else {
    const max = unit === "week" ? PLAN_LIMITS.weekCountMax : PLAN_LIMITS.monthCountMax
    if (!inRange(input.billingIntervalCount, 1, max)) add("billingIntervalCount", "INVALID_INTERVAL")
  }

  const cUnit = input.commitmentUnit
  if (cUnit === "none") {
    if (input.commitmentCount !== 0) add("commitmentCount", "INVALID_COMMITMENT")
  } else if (cUnit === "month") {
    if (!inRange(input.commitmentCount, 1, PLAN_LIMITS.commitmentMonthsMax)) add("commitmentCount", "INVALID_COMMITMENT")
  } else if (cUnit === "billing_cycle") {
    if (!inRange(input.commitmentCount, 1, PLAN_LIMITS.commitmentCyclesMax)) add("commitmentCount", "INVALID_COMMITMENT")
  } else add("commitmentUnit", "INVALID_COMMITMENT")

  const renewal = input.renewalMode
  if (renewal !== "none" && renewal !== "same_term" && renewal !== "open_ended") add("renewalMode", "INVALID_RENEWAL")
  else if (renewal === "same_term" && cUnit === "none") add("renewalMode", "INVALID_RENEWAL")
  const notice = input.renewalNoticeDays == null ? null : input.renewalNoticeDays
  if (notice !== null && !inRange(notice, 0, PLAN_LIMITS.renewalNoticeDaysMax)) add("renewalNoticeDays", "INVALID_RENEWAL")

  const allowRecurring = input.allowRecurringPayment ?? true
  const allowPrepaid = input.allowPrepaidPayment ?? false
  if (typeof allowRecurring !== "boolean" || typeof allowPrepaid !== "boolean" || (!allowRecurring && !allowPrepaid)) {
    add("paymentMode", "INVALID_PAYMENT_MODE")
  }
  const prepaidCycles = input.prepaidBillingCycles == null ? null : input.prepaidBillingCycles
  if (prepaidCycles !== null && !inRange(prepaidCycles, 1, PLAN_LIMITS.prepaidCyclesMax)) add("prepaidBillingCycles", "INVALID_PAYMENT_MODE")
  if (allowPrepaid === true && prepaidCycles === null) add("prepaidBillingCycles", "INVALID_PAYMENT_MODE")

  const includedServiceId = optionalId(input.includedServiceId)
  if (includedServiceId === undefined) add("includedServiceId", "SERVICE_NOT_FOUND")
  const initialServiceId = optionalId(input.initialServiceId)
  if (initialServiceId === undefined) add("initialServiceId", "SERVICE_NOT_FOUND")
  const initialCleaningRequired = input.initialCleaningRequired ?? false
  if (typeof initialCleaningRequired !== "boolean") add("initialCleaningRequired", "INVALID_PLAN")

  const visibility = input.visibility ?? "public"
  if (!(PLAN_VISIBILITIES as readonly unknown[]).includes(visibility)) add("visibility", "INVALID_PLAN")
  const status = input.status ?? "draft"
  if (!(PLAN_STATUSES as readonly unknown[]).includes(status)) add("status", "INVALID_PLAN")
  if (status === "active" && includedServiceId == null) add("includedServiceId", "SERVICE_NOT_FOUND")

  const rightsPeriodMonths = input.rightsPeriodMonths ?? null
  const paymentSchedule = input.paymentSchedule ?? null
  if (rightsPeriodMonths !== null || paymentSchedule !== null) {
    if (!isRightsPeriodMonths(rightsPeriodMonths)) add("rightsPeriodMonths", "INVALID_INTERVAL")
    if (!isPaymentSchedule(paymentSchedule)) add("paymentSchedule", "INVALID_PAYMENT_MODE")
    if (isRightsPeriodMonths(rightsPeriodMonths) && isPaymentSchedule(paymentSchedule)) {
      if (unit !== "month" || input.billingIntervalCount !== rightsPeriodMonths) add("billingIntervalCount", "INVALID_INTERVAL")
      if (allowPrepaid !== false || allowRecurring !== true) add("paymentMode", "INVALID_PAYMENT_MODE")
      if (rightsPeriodMonths === 1 && paymentSchedule !== "period") add("paymentSchedule", "INVALID_PAYMENT_MODE")
      if (isMonthlyInstallments(paymentSchedule, rightsPeriodMonths)) {
        if (cUnit !== "month" || input.commitmentCount !== rightsPeriodMonths) add("commitmentCount", "INVALID_COMMITMENT")
        if (renewal !== "same_term" && renewal !== "none") add("renewalMode", "INVALID_RENEWAL")
        if (isInt(input.priceCents) && !splitInstallments(input.priceCents, rightsPeriodMonths)) add("priceCents", "INVALID_PLAN")
      }
    }
  }

  if (issues.length) return { ok: false, code: issues[0].code, issues }

  return {
    ok: true,
    value: {
      name,
      description: description || null,
      priceCents: input.priceCents as number,
      currency: currency as string,
      billingIntervalUnit: unit as BillingIntervalUnit,
      billingIntervalCount: input.billingIntervalCount as number,
      includedUsesPerCycle: input.includedUsesPerCycle as number,
      includedServiceId: includedServiceId ?? null,
      commitmentUnit: cUnit as CommitmentUnit,
      commitmentCount: input.commitmentCount as number,
      renewalMode: renewal as RenewalMode,
      renewalNoticeDays: notice as number | null,
      initialCleaningRequired: initialCleaningRequired as boolean,
      initialServiceId: initialServiceId ?? null,
      allowRecurringPayment: allowRecurring as boolean,
      allowPrepaidPayment: allowPrepaid as boolean,
      prepaidBillingCycles: prepaidCycles as number | null,
      visibility: visibility as PlanVisibility,
      status: status as PlanStatus,
      rightsPeriodMonths: rightsPeriodMonths as number | null,
      paymentSchedule: paymentSchedule as PaymentSchedule | null,
    },
  }
}

export function assertValidPlanConfig(input: PlanConfigInput): ValidatedPlanConfig {
  const result = validatePlanConfig(input)
  if (!result.ok) throw new CustomerSubscriptionError(result.code, result.issues)
  return result.value
}

export function isPaymentModeAllowed(plan: Pick<ValidatedPlanConfig, "allowRecurringPayment" | "allowPrepaidPayment">, mode: unknown): mode is PaymentMode {
  return (mode === "recurring" && plan.allowRecurringPayment) || (mode === "prepaid" && plan.allowPrepaidPayment)
}
