import { describe, it, expect } from "vitest"
import {
  DEFAULT_WIZARD_FORM,
  WIZARD_STEPS,
  wizardToPlanConfigInput,
  wizardFromConfig,
  wizardIssuesForStep,
  wizardClientPreview,
  type WizardFormState,
} from "@/lib/customer-subscriptions/plan-form"
import { validatePlanConfig, type ValidatedPlanConfig } from "@/lib/customer-subscriptions/plan-validation"

const SERVICE = { id: 7, name: "Lavage complet intérieur + extérieur" }
// Intl insère des espaces insécables (fr-FR) : comparaison en espaces simples.
const n = <T,>(v: T): T => JSON.parse(JSON.stringify(v).replace(/[\u00a0\u202f]/g, " "))
const previewOf = (f: WizardFormState) => n(wizardClientPreview(f, SERVICE.name))
const serenite: WizardFormState = { ...DEFAULT_WIZARD_FORM, name: "Formule Sérénité", includedServiceId: SERVICE.id, priceEuros: "359" }

describe("formulaire en 3 étapes — valeurs par défaut", () => {
  it("3 étapes, dans l'ordre de l'aperçu", () => {
    expect(WIZARD_STEPS.map((s) => s.title)).toEqual(["La formule", "Prix et paiement", "Options et publication"])
  })
  it("défauts sensés : 6 par an, paiement mensuel, nouvel engagement, rappel 3 jours, publication", () => {
    expect(DEFAULT_WIZARD_FORM).toMatchObject({ uses: 6, periodMonths: 12, paymentSchedule: "monthly", afterPeriod: "renew", reminderDays: 3, status: "active", initialCleaning: false })
  })
})

describe("wizardToPlanConfigInput → validateur serveur", () => {
  it("6 lavages / an payés chaque mois : engagement 12 mois, renouvelé", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput(serenite))
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value).toMatchObject({
      priceCents: 35_900,
      billingIntervalUnit: "month",
      billingIntervalCount: 12,
      includedUsesPerCycle: 6,
      commitmentUnit: "month",
      commitmentCount: 12,
      renewalMode: "same_term",
      renewalNoticeDays: 3,
      rightsPeriodMonths: 12,
      paymentSchedule: "monthly",
      allowPrepaidPayment: false,
    })
  })
  it("mensuel + « la formule s'arrête »", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, afterPeriod: "stop" }))
    expect(v.ok && v.value.renewalMode).toBe("none")
  })
  it("mensuel : « continue sans engagement » impossible même si le navigateur l'envoie", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, afterPeriod: "continue" }))
    expect(v.ok && v.value.renewalMode).toBe("same_term")
  })
  it("en une fois : sans engagement, résiliable à chaque échéance (= V1)", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, paymentSchedule: "period", afterPeriod: "continue" }))
    expect(v.ok && [v.value.commitmentUnit, v.value.renewalMode, v.value.paymentSchedule]).toEqual(["none", "open_ended", "period"])
  })
  it("par mois : toujours « en une fois » (payer chaque mois = même chose)", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, periodMonths: 1, priceEuros: "39", afterPeriod: "continue" }))
    expect(v.ok && [v.value.billingIntervalCount, v.value.paymentSchedule, v.value.commitmentUnit]).toEqual([1, "period", "none"])
  })
  it("au choix du client, trimestre", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, periodMonths: 3, uses: 2, priceEuros: "100", paymentSchedule: "customer_choice" }))
    expect(v.ok && [v.value.billingIntervalCount, v.value.commitmentCount, v.value.paymentSchedule]).toEqual([3, 3, "customer_choice"])
  })
  it("valeurs techniques jamais lues du formulaire : prepaid, devise", () => {
    const tampered = { ...serenite, allowPrepaidPayment: true, currency: "USD" } as unknown as WizardFormState
    const input = wizardToPlanConfigInput(tampered)
    expect([input.allowPrepaidPayment, input.currency]).toEqual([false, "EUR"])
  })
})

describe("erreurs sous le champ, avec la solution", () => {
  it("prix vide : message de l'aperçu", () => {
    const issues = wizardIssuesForStep({ ...serenite, priceEuros: "" }, "price")
    expect(issues).toEqual([{ field: "priceCents", message: "Indiquez le prix de l'année pour 6 lavages, par exemple 359. Le prix par mois sera calculé pour vous." }])
  })
  it("prestation manquante sur l'étape 1", () => {
    expect(wizardIssuesForStep({ ...serenite, includedServiceId: null }, "plan").map((i) => i.field)).toContain("includedServiceId")
  })
  it("nombre de prestations hors bornes", () => {
    expect(wizardIssuesForStep({ ...serenite, uses: 0 }, "plan").map((i) => i.field)).toContain("includedUsesPerCycle")
  })
  it("formule valide : aucune erreur à aucune étape", () => {
    for (const s of WIZARD_STEPS) expect(wizardIssuesForStep(serenite, s.key)).toEqual([])
  })
})

describe("« Ce que verra votre client » et résumé", () => {
  it("mensuel 359 € : 29,92 € / mois, détail de la dernière échéance, total exact", () => {
    const p = previewOf(serenite)
    expect(p).toMatchObject({
      usesLine: "6 lavages par an",
      priceMain: "29,92 €",
      priceSuffix: "/ mois",
      duration: "12 mois",
      total: "359 €",
      commitment: "12 mois",
      calculation: "Calcul automatique : 11 × 29,92 € puis une dernière échéance de 29,88 €. Total exact : 359 €.",
    })
    expect(p?.sentence).toBe(
      "Vos clients reçoivent 6 lavages par an et paient 29,92 € par mois pendant 12 mois (359 € au total), avec un engagement de 12 mois. Ensuite, un nouvel engagement de 12 mois démarre avec 6 nouveaux lavages, sauf s'ils demandent l'arrêt avant.",
    )
  })
  it("361 € : dernière échéance plus haute", () => {
    expect(previewOf({ ...serenite, priceEuros: "361" })?.calculation).toBe(
      "Calcul automatique : 11 × 30,08 € puis une dernière échéance de 30,12 €. Total exact : 361 €.",
    )
  })
  it("prix divisible : pas de dernière échéance différente", () => {
    expect(previewOf({ ...serenite, priceEuros: "360" })?.calculation).toBe("Calcul automatique : 12 × 30 €. Total exact : 360 €.")
  })
  it("en une fois", () => {
    const p = previewOf({ ...serenite, paymentSchedule: "period", afterPeriod: "continue" })
    expect(p).toMatchObject({ priceMain: "359 €", priceSuffix: "/ an", commitment: null })
  })
  it("prix absent : pas de résumé (état vide de l'aperçu)", () => {
    expect(previewOf({ ...serenite, priceEuros: "" })).toBeNull()
  })
})

const v1 = (over: Partial<ValidatedPlanConfig>): ValidatedPlanConfig => ({
  name: "Entretien",
  description: "Desc",
  priceCents: 4900,
  currency: "EUR",
  billingIntervalUnit: "month",
  billingIntervalCount: 1,
  includedUsesPerCycle: 1,
  includedServiceId: 7,
  commitmentUnit: "none",
  commitmentCount: 0,
  renewalMode: "open_ended",
  renewalNoticeDays: 7,
  initialCleaningRequired: false,
  initialServiceId: null,
  allowRecurringPayment: true,
  allowPrepaidPayment: false,
  prepaidBillingCycles: null,
  visibility: "unlisted",
  status: "active",
  rightsPeriodMonths: null,
  paymentSchedule: null,
  ...over,
})

describe("formules existantes : nouveau formulaire si exprimable, sinon l'ancien", () => {
  it.each([
    ["semaines", { billingIntervalUnit: "week" as const, billingIntervalCount: 4 }],
    ["tous les 2 mois", { billingIntervalCount: 2 }],
    ["prepaid", { allowPrepaidPayment: true, prepaidBillingCycles: 6 }],
    ["engagement libre", { commitmentUnit: "month" as const, commitmentCount: 6 }],
    ["engagement en échéances", { commitmentUnit: "billing_cycle" as const, commitmentCount: 3 }],
    ["rappel 14 jours", { renewalNoticeDays: 14 }],
    ["rappel par défaut (null)", { renewalNoticeDays: null }],
  ])("%s → ancien formulaire", (_label, over) => {
    expect(wizardFromConfig(v1(over))).toBeNull()
  })
  it("mensuel V1 exprimable : ouvert dans le nouveau formulaire, aller-retour sans perte", () => {
    const plan = v1({})
    const form = wizardFromConfig(plan)!
    expect(form).toMatchObject({ periodMonths: 1, paymentSchedule: "period", afterPeriod: "continue", reminderDays: 7 })
    const back = validatePlanConfig(wizardToPlanConfigInput(form))
    expect(back.ok && { ...back.value, rightsPeriodMonths: null, paymentSchedule: null }).toEqual(plan)
  })
  it("formule L27 : aller-retour exact", () => {
    const v = validatePlanConfig(wizardToPlanConfigInput({ ...serenite, paymentSchedule: "customer_choice", afterPeriod: "stop", reminderDays: 0 }))
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const form = wizardFromConfig(v.value)!
    expect(validatePlanConfig(wizardToPlanConfigInput(form))).toEqual(v)
  })
})
