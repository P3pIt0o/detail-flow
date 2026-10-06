/**
 * Pont PUR entre le configurateur (choix métier) et PlanConfigInput.
 * Le serveur réapplique toPlanConfigInput puis validatePlanConfig : le
 * navigateur ne fait qu'un aperçu avec ces MÊMES fonctions.
 */
import { validatePlanConfig, type PlanConfigInput, type PlanVisibility, type ValidatedPlanConfig } from "./plan-validation"
import type { PlanSummary } from "./plan-summary"

export type PaymentChoice = "recurring" | "prepaid" | "both"
export type EndOfTermChoice = "stop" | "renew" | "continue"

export type PlanFormState = {
  name: string
  description: string
  includedServiceId: number | null
  usesPerCycle: number
  priceEuros: string
  intervalUnit: "week" | "month"
  intervalCount: number
  hasCommitment: boolean
  commitmentUnit: "month" | "billing_cycle"
  commitmentCount: number
  endOfTerm: EndOfTermChoice
  reminderDays: number | null
  paymentChoice: PaymentChoice
  prepaidCycles: number
  initialCleaning: boolean
  initialServiceId: number | null
  status: "draft" | "active"
  visibility: PlanVisibility
}

export const DEFAULT_PLAN_FORM: PlanFormState = {
  name: "",
  description: "",
  includedServiceId: null,
  usesPerCycle: 1,
  priceEuros: "",
  intervalUnit: "month",
  intervalCount: 1,
  hasCommitment: false,
  commitmentUnit: "month",
  commitmentCount: 6,
  endOfTerm: "continue",
  reminderDays: 7,
  paymentChoice: "recurring",
  prepaidCycles: 6,
  initialCleaning: false,
  initialServiceId: null,
  status: "active",
  visibility: "public",
}

/** "39" | "39,90" | "39.9" → 3990. Toute autre saisie → NaN (refusé par le validateur). */
export function parseEurosToCents(input: string): number {
  const s = input.replace(/\s|€/g, "").replace(",", ".")
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return Number.NaN
  const [whole, frac = ""] = s.split(".")
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"))
}

export function centsToEurosInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",")
}

const toInt = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback)

/** Seule fonction qui décide des valeurs techniques : combinaisons invalides impossibles par construction. */
export function toPlanConfigInput(form: PlanFormState): PlanConfigInput {
  const recurring = form.paymentChoice !== "prepaid"
  const prepaid = form.paymentChoice !== "recurring"
  const renewalMode = !recurring
    ? "none"
    : !form.hasCommitment
      ? "open_ended"
      : form.endOfTerm === "stop"
        ? "none"
        : form.endOfTerm === "renew"
          ? "same_term"
          : "open_ended"
  return {
    name: typeof form.name === "string" ? form.name : "",
    description: typeof form.description === "string" && form.description.trim() ? form.description : null,
    priceCents: parseEurosToCents(String(form.priceEuros ?? "")),
    currency: "EUR",
    billingIntervalUnit: form.intervalUnit,
    billingIntervalCount: toInt(form.intervalCount, 0),
    includedUsesPerCycle: toInt(form.usesPerCycle, 0),
    includedServiceId: form.includedServiceId ?? null,
    commitmentUnit: form.hasCommitment ? form.commitmentUnit : "none",
    commitmentCount: form.hasCommitment ? toInt(form.commitmentCount, 0) : 0,
    renewalMode,
    renewalNoticeDays: form.reminderDays == null ? null : toInt(form.reminderDays, -1),
    initialCleaningRequired: form.initialCleaning === true,
    initialServiceId: form.initialCleaning ? (form.initialServiceId ?? null) : null,
    allowRecurringPayment: recurring,
    allowPrepaidPayment: prepaid,
    prepaidBillingCycles: prepaid ? toInt(form.prepaidCycles, 0) : null,
    visibility: form.visibility,
    status: form.status,
  }
}

export function planFormFromConfig(plan: ValidatedPlanConfig): PlanFormState {
  const paymentChoice: PaymentChoice =
    plan.allowRecurringPayment && plan.allowPrepaidPayment ? "both" : plan.allowPrepaidPayment ? "prepaid" : "recurring"
  return {
    name: plan.name,
    description: plan.description ?? "",
    includedServiceId: plan.includedServiceId,
    usesPerCycle: plan.includedUsesPerCycle,
    priceEuros: centsToEurosInput(plan.priceCents),
    intervalUnit: plan.billingIntervalUnit,
    intervalCount: plan.billingIntervalCount,
    hasCommitment: plan.commitmentUnit !== "none",
    commitmentUnit: plan.commitmentUnit === "billing_cycle" ? "billing_cycle" : "month",
    commitmentCount: plan.commitmentUnit === "none" ? 6 : plan.commitmentCount,
    endOfTerm: plan.renewalMode === "none" ? "stop" : plan.renewalMode === "same_term" ? "renew" : "continue",
    reminderDays: plan.renewalNoticeDays,
    paymentChoice,
    prepaidCycles: plan.prepaidBillingCycles ?? 6,
    initialCleaning: plan.initialCleaningRequired,
    initialServiceId: plan.initialServiceId,
    status: plan.status === "draft" ? "draft" : "active",
    visibility: plan.visibility,
  }
}

export const PLAN_FORM_STEPS = [
  { key: "plan", title: "La formule", hint: "Ce que vous proposez à votre client." },
  { key: "price", title: "Prix et fréquence", hint: "Combien et à quel rythme votre client paie." },
  { key: "commitment", title: "Engagement", hint: "Durée minimale et ce qui se passe ensuite." },
  { key: "payment", title: "Paiement", hint: "Comment votre client règle sa formule." },
  { key: "publish", title: "Publication", hint: "Qui peut voir cette formule." },
] as const
export type PlanFormStepKey = (typeof PLAN_FORM_STEPS)[number]["key"]

const STEP_FIELDS: Record<PlanFormStepKey, readonly string[]> = {
  plan: ["name", "description", "includedServiceId", "includedUsesPerCycle"],
  price: ["priceCents", "currency", "billingIntervalUnit", "billingIntervalCount"],
  commitment: ["commitmentUnit", "commitmentCount", "renewalMode", "renewalNoticeDays"],
  payment: ["paymentMode", "prepaidBillingCycles", "initialCleaningRequired", "initialServiceId"],
  publish: ["visibility", "status"],
}

const FIELD_MESSAGES: Record<string, string> = {
  name: "Donnez un nom à votre formule (120 caractères maximum).",
  description: "La description est trop longue (2 000 caractères maximum).",
  includedServiceId: "Choisissez la prestation incluse.",
  includedUsesPerCycle: "Indiquez entre 1 et 100 prestations par période.",
  priceCents: "Indiquez un prix valide, par exemple 39 ou 39,90.",
  billingIntervalCount: "Choisissez une fréquence entre 1 et 12 mois, ou 1 et 52 semaines.",
  billingIntervalUnit: "Choisissez une fréquence.",
  commitmentCount: "Indiquez une durée d'engagement valide.",
  commitmentUnit: "Choisissez une durée d'engagement.",
  renewalMode: "Choisissez ce qui se passe à la fin de l'engagement.",
  renewalNoticeDays: "Le rappel doit être compris entre 0 et 365 jours.",
  paymentMode: "Choisissez au moins un mode de paiement.",
  prepaidBillingCycles: "Indiquez entre 1 et 60 périodes payées d'avance.",
  initialServiceId: "Choisissez la prestation de nettoyage initial.",
  visibility: "Choisissez qui peut voir la formule.",
  status: "Choisissez si la formule est publiée.",
}

export type FormIssue = { field: string; message: string }

/** Problèmes de l'étape, calculés par le validateur serveur (formule considérée publiée). */
export function issuesForStep(form: PlanFormState, step: PlanFormStepKey): FormIssue[] {
  const fields = STEP_FIELDS[step]
  const out: FormIssue[] = []
  const v = validatePlanConfig({ ...toPlanConfigInput(form), status: "active" })
  if (!v.ok) for (const i of v.issues) if (fields.includes(i.field)) out.push({ field: i.field, message: FIELD_MESSAGES[i.field] ?? "Valeur invalide." })
  if (step === "payment" && form.initialCleaning && form.initialServiceId == null && !out.some((i) => i.field === "initialServiceId")) {
    out.push({ field: "initialServiceId", message: FIELD_MESSAGES.initialServiceId })
  }
  return out
}

export function firstInvalidStep(form: PlanFormState): PlanFormStepKey | null {
  for (const s of PLAN_FORM_STEPS) if (issuesForStep(form, s.key).length) return s.key
  return null
}

/* --------------------------- Phrases métier --------------------------- */

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
export function formatEuros(cents: number): string {
  return euro.format(cents / 100).replace(/,00\s/, " ")
}

export function intervalSentence(unit: string, count: number): string {
  if (unit === "month") return count === 1 ? "tous les mois" : `tous les ${count} mois`
  return count === 1 ? "toutes les semaines" : `toutes les ${count} semaines`
}

export function perIntervalShort(unit: string, count: number): string {
  if (unit === "month") return count === 1 ? "/ mois" : `/ ${count} mois`
  return count === 1 ? "/ semaine" : `/ ${count} semaines`
}

export function periodNoun(unit: string, count: number): string {
  if (unit === "month") return count === 1 ? "par mois" : `tous les ${count} mois`
  return count === 1 ? "par semaine" : `toutes les ${count} semaines`
}

export function commitmentSentence(unit: string, count: number): string {
  if (unit === "none" || !count) return "Sans engagement"
  if (unit === "month") return `Engagement ${count} mois`
  return `Engagement ${count} échéance${count > 1 ? "s" : ""}`
}

export function renewalSentence(mode: string, hasCommitment: boolean, recurring: boolean): string {
  if (!recurring) return "S'arrête à la fin de la période payée"
  if (!hasCommitment) return "Résiliable à chaque échéance"
  if (mode === "same_term") return "Puis renouvelé pour la même durée"
  if (mode === "open_ended") return "Puis continue sans engagement"
  return "S'arrête automatiquement à la fin de l'engagement"
}

export function cancellationSentence(policy: PlanSummary["cancellation"]): string {
  if (policy === "end_of_prepaid_period") return "Se termine à la fin de la période payée"
  if (policy === "end_of_commitment") return "Arrêt possible à la fin de l'engagement"
  return "Arrêt possible avant chaque échéance"
}

export function reminderSentence(days: number | null): string {
  if (days == null || days === 0) return "Pas de rappel avant échéance"
  return `Rappel ${days} jour${days > 1 ? "s" : ""} avant l'échéance`
}

export function formatPercentFromBps(bps: number): string {
  return `${(bps / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`
}
