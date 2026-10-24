/**
 * Pont PUR entre le configurateur (choix métier) et PlanConfigInput.
 * Le serveur réapplique toPlanConfigInput puis validatePlanConfig : le
 * navigateur ne fait qu'un aperçu avec ces MÊMES fonctions.
 */
import { validatePlanConfig, type PlanConfigInput, type PlanVisibility, type ValidatedPlanConfig } from "./plan-validation"
import type { PlanSummary } from "./plan-summary"
import { splitInstallments, type PaymentSchedule } from "./rights-period"

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

/* ------------------ Formulaire en 3 étapes (L27, créations) ------------------ */

export type WizardPeriod = 1 | 3 | 12
export type WizardAfterPeriod = "renew" | "continue" | "stop"

export type WizardFormState = {
  name: string
  description: string
  includedServiceId: number | null
  uses: number
  periodMonths: WizardPeriod
  /** Prix de la PÉRIODE (ex. l'année), jamais la mensualité. */
  priceEuros: string
  paymentSchedule: PaymentSchedule
  afterPeriod: WizardAfterPeriod
  reminderDays: 0 | 3 | 7
  initialCleaning: boolean
  initialServiceId: number | null
  status: "draft" | "active"
  visibility: PlanVisibility
}

export const DEFAULT_WIZARD_FORM: WizardFormState = {
  name: "",
  description: "",
  includedServiceId: null,
  uses: 6,
  periodMonths: 12,
  priceEuros: "",
  paymentSchedule: "monthly",
  afterPeriod: "renew",
  reminderDays: 3,
  initialCleaning: false,
  initialServiceId: null,
  status: "active",
  visibility: "public",
}

export const WIZARD_STEPS = [
  { key: "plan", title: "La formule", hint: "Ce que votre client reçoit." },
  { key: "price", title: "Prix et paiement", hint: "" },
  { key: "publish", title: "Options et publication", hint: "" },
] as const
export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"]

const WIZARD_STEP_FIELDS: Record<WizardStepKey, readonly string[]> = {
  plan: ["name", "description", "includedServiceId", "includedUsesPerCycle", "rightsPeriodMonths"],
  price: ["priceCents", "currency", "billingIntervalUnit", "billingIntervalCount", "paymentSchedule", "commitmentUnit", "commitmentCount", "renewalMode", "paymentMode"],
  publish: ["renewalNoticeDays", "initialCleaningRequired", "initialServiceId", "visibility", "status"],
}

const PERIOD_WORDS: Record<WizardPeriod, { per: string; of: string; short: string; months: string }> = {
  1: { per: "par mois", of: "du mois", short: "/ mois", months: "1 mois" },
  3: { per: "par trimestre", of: "du trimestre", short: "/ trimestre", months: "3 mois" },
  12: { per: "par an", of: "de l'année", short: "/ an", months: "12 mois" },
}
export const periodWords = (m: number) => PERIOD_WORDS[(m === 1 || m === 3 ? m : 12) as WizardPeriod]

/** « Lavage complet intérieur + extérieur » → « lavage(s) » : nom court de la prestation. */
export function serviceNoun(serviceName: string | null | undefined, count: number): string {
  const first = (serviceName ?? "").trim().split(/\s+/)[0]?.toLocaleLowerCase("fr-FR") || "prestation"
  return count > 1 && !/[sxz]$/.test(first) ? `${first}s` : first
}

const isMonthlyChoice = (f: Pick<WizardFormState, "periodMonths" | "paymentSchedule">) => f.periodMonths > 1 && f.paymentSchedule !== "period"

/** Seule traduction des choix métier en configuration technique (le serveur la réapplique). */
export function wizardToPlanConfigInput(form: WizardFormState): PlanConfigInput {
  const months: WizardPeriod = form.periodMonths === 1 || form.periodMonths === 3 ? form.periodMonths : 12
  const schedule: PaymentSchedule = months === 1 ? "period" : form.paymentSchedule === "monthly" || form.paymentSchedule === "customer_choice" ? form.paymentSchedule : "period"
  const monthly = months > 1 && schedule !== "period"
  // Paiement mensuel : jamais « continue sans engagement » (décision C).
  const after: WizardAfterPeriod = monthly && form.afterPeriod === "continue" ? "renew" : form.afterPeriod
  const committed = monthly || after !== "continue"
  return {
    name: typeof form.name === "string" ? form.name : "",
    description: typeof form.description === "string" && form.description.trim() ? form.description : null,
    priceCents: parseEurosToCents(String(form.priceEuros ?? "")),
    currency: "EUR",
    billingIntervalUnit: "month",
    billingIntervalCount: months,
    includedUsesPerCycle: toInt(form.uses, 0),
    includedServiceId: form.includedServiceId ?? null,
    commitmentUnit: committed ? "month" : "none",
    commitmentCount: committed ? months : 0,
    renewalMode: after === "stop" ? "none" : after === "renew" ? "same_term" : "open_ended",
    renewalNoticeDays: form.reminderDays === 0 || form.reminderDays === 7 ? form.reminderDays : 3,
    initialCleaningRequired: form.initialCleaning === true,
    initialServiceId: form.initialCleaning ? (form.initialServiceId ?? null) : null,
    allowRecurringPayment: true,
    allowPrepaidPayment: false,
    prepaidBillingCycles: null,
    visibility: form.visibility,
    status: form.status,
    rightsPeriodMonths: months,
    paymentSchedule: schedule,
  }
}

/**
 * Formule existante → nouveau formulaire si ses réglages y sont exprimables, sinon null
 * (l'ancien formulaire en 5 étapes est conservé pour ces seuls cas, décision B).
 */
export function wizardFromConfig(plan: ValidatedPlanConfig): WizardFormState | null {
  const months = plan.billingIntervalCount
  if (plan.billingIntervalUnit !== "month" || (months !== 1 && months !== 3 && months !== 12)) return null
  if (plan.allowPrepaidPayment || !plan.allowRecurringPayment) return null
  if (plan.renewalNoticeDays !== 0 && plan.renewalNoticeDays !== 3 && plan.renewalNoticeDays !== 7) return null
  const committed = plan.commitmentUnit === "month" && plan.commitmentCount === months
  if (plan.commitmentUnit !== "none" && !committed) return null
  const afterPeriod: WizardAfterPeriod | null =
    !committed && plan.renewalMode === "open_ended" ? "continue" : committed && plan.renewalMode === "same_term" ? "renew" : committed && plan.renewalMode === "none" ? "stop" : null
  if (!afterPeriod) return null
  return {
    name: plan.name,
    description: plan.description ?? "",
    includedServiceId: plan.includedServiceId,
    uses: plan.includedUsesPerCycle,
    periodMonths: months as WizardPeriod,
    priceEuros: centsToEurosInput(plan.priceCents),
    paymentSchedule: plan.paymentSchedule ?? "period",
    afterPeriod,
    reminderDays: plan.renewalNoticeDays as WizardFormState["reminderDays"],
    initialCleaning: plan.initialCleaningRequired,
    initialServiceId: plan.initialServiceId,
    status: plan.status === "draft" ? "draft" : "active",
    visibility: plan.visibility,
  }
}

const WIZARD_MESSAGES: Record<string, (f: WizardFormState) => string> = {
  name: () => "Donnez un nom à votre formule, par exemple « Formule Sérénité ».",
  includedServiceId: () => "Choisissez la prestation incluse dans la formule.",
  includedUsesPerCycle: () => "Indiquez entre 1 et 100 prestations.",
  initialServiceId: () => "Choisissez la prestation de nettoyage initial.",
}

/** Erreurs de l'étape, calculées par le validateur serveur ; message sous le champ, avec la solution. */
export function wizardIssuesForStep(form: WizardFormState, step: WizardStepKey, serviceName?: string | null): FormIssue[] {
  const fields = WIZARD_STEP_FIELDS[step]
  const v = validatePlanConfig({ ...wizardToPlanConfigInput(form), status: "active" })
  const out: FormIssue[] = []
  if (!v.ok) {
    for (const i of v.issues) {
      if (!fields.includes(i.field) || out.some((o) => o.field === i.field)) continue
      const msg = i.field === "priceCents" ? priceMessage(form, serviceName) : (WIZARD_MESSAGES[i.field]?.(form) ?? FIELD_MESSAGES[i.field] ?? "Valeur invalide.")
      out.push({ field: i.field, message: msg })
    }
  }
  if (step === "publish" && form.initialCleaning && form.initialServiceId == null && !out.some((i) => i.field === "initialServiceId")) {
    out.push({ field: "initialServiceId", message: WIZARD_MESSAGES.initialServiceId(form) })
  }
  return out
}

function priceMessage(form: WizardFormState, serviceName?: string | null): string {
  const what = `${form.uses} ${serviceNoun(serviceName ?? "lavage", form.uses)}`
  return `Indiquez le prix ${periodWords(form.periodMonths).of} pour ${what}, par exemple 359.${isMonthlyChoice(form) ? " Le prix par mois sera calculé pour vous." : ""}`
}

export type WizardClientPreview = {
  usesLine: string
  priceMain: string
  priceSuffix: string
  duration: string
  total: string
  commitment: string | null
  calculation: string | null
  sentence: string
}

/** Encadré « Ce que verra votre client » + phrase-résumé ; null tant que le prix n'est pas valide. */
export function wizardClientPreview(form: WizardFormState, serviceName: string | null): WizardClientPreview | null {
  const input = wizardToPlanConfigInput(form)
  const price = input.priceCents as number
  const months = input.rightsPeriodMonths as WizardPeriod
  if (!Number.isInteger(price) || price <= 0) return null
  const w = periodWords(months)
  const noun = serviceNoun(serviceName, form.uses)
  const usesLine = `${form.uses} ${noun} ${w.per}`
  const total = formatEuros(price)
  const monthly = isMonthlyChoice({ periodMonths: months, paymentSchedule: input.paymentSchedule as PaymentSchedule })
  const split = monthly ? splitInstallments(price, months) : null
  if (monthly && !split) return null
  const after =
    input.renewalMode === "none"
      ? "Ensuite, la formule s'arrête."
      : input.renewalMode === "same_term"
        ? `Ensuite, un nouvel engagement de ${w.months} démarre avec ${form.uses} nouveaux ${noun}, sauf s'ils demandent l'arrêt avant.`
        : "Ensuite, la formule continue et ils peuvent arrêter à chaque échéance."
  if (split) {
    const m = formatEuros(split.installmentCents)
    const calculation =
      split.adjustmentCents === 0
        ? `Calcul automatique : ${months} × ${m}. Total exact : ${total}.`
        : `Calcul automatique : ${months - 1} × ${m} puis une dernière échéance de ${formatEuros(split.lastInstallmentCents)}. Total exact : ${total}.`
    return {
      usesLine,
      priceMain: m,
      priceSuffix: "/ mois",
      duration: w.months,
      total,
      commitment: w.months,
      calculation,
      sentence: `Vos clients reçoivent ${usesLine} et paient ${m} par mois pendant ${w.months} (${total} au total), avec un engagement de ${w.months}. ${after}`,
    }
  }
  const committed = input.commitmentUnit !== "none"
  return {
    usesLine,
    priceMain: total,
    priceSuffix: w.short,
    duration: w.months,
    total,
    commitment: committed ? w.months : null,
    calculation: null,
    sentence: `Vos clients reçoivent ${usesLine} et paient ${total} ${w.per}${committed ? `, avec un engagement de ${w.months}` : ""}. ${after}`,
  }
}
