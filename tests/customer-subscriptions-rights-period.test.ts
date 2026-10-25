import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
import {
  splitInstallments,
  installmentPosition,
  resolveScheduleChoice,
  scheduleSnapshot,
  rightsInterval,
  installmentAmountAt,
  installmentsRemaining,
} from "@/lib/customer-subscriptions/rights-period"
import { validatePlanConfig, type PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"
import { buildCycleWindow } from "@/lib/customer-subscriptions/engine"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"

const sum = (s: { installmentCents: number; lastInstallmentCents: number }, n: number) => (n - 1) * s.installmentCents + s.lastInstallmentCents

describe("splitInstallments — arrondi au plus proche, écart sur la dernière", () => {
  it("359 € / 12 → 11 × 29,92 € puis 29,88 € (dernière plus basse)", () => {
    const s = splitInstallments(35_900, 12)!
    expect(s).toEqual({ installmentCents: 2992, lastInstallmentCents: 2988, adjustmentCents: -4 })
    expect(sum(s, 12)).toBe(35_900)
  })
  it("361 € / 12 → 11 × 30,08 € puis 30,12 € (dernière plus haute)", () => {
    const s = splitInstallments(36_100, 12)!
    expect(s).toEqual({ installmentCents: 3008, lastInstallmentCents: 3012, adjustmentCents: 4 })
    expect(sum(s, 12)).toBe(36_100)
  })
  it("prix divisible : aucun écart", () => {
    expect(splitInstallments(36_000, 12)).toEqual({ installmentCents: 3000, lastInstallmentCents: 3000, adjustmentCents: 0 })
  })
  it("demi-centime arrondi vers le haut", () => {
    // 35 906 / 12 = 2992,1… ; 35 910 / 12 = 2992,5 → 2993
    expect(splitInstallments(35_910, 12)!.installmentCents).toBe(2993)
    expect(sum(splitInstallments(35_910, 12)!, 12)).toBe(35_910)
  })
  it("trimestre payé chaque mois : 3 échéances", () => {
    const s = splitInstallments(10_000, 3)!
    expect(s).toEqual({ installmentCents: 3333, lastInstallmentCents: 3334, adjustmentCents: 1 })
  })
  it("une seule échéance : le prix entier", () => {
    expect(splitInstallments(35_900, 1)).toEqual({ installmentCents: 35_900, lastInstallmentCents: 35_900, adjustmentCents: 0 })
  })
  it("prix trop bas ou invalide : refusé (aucune échéance à 0 € ou négative)", () => {
    expect(splitInstallments(6, 12)).toBeNull() // 11 × 0,01 € > 0,06 € : dernière négative
    expect(splitInstallments(0, 12)).toBeNull()
    expect(splitInstallments(-1, 12)).toBeNull()
    expect(splitInstallments(35_900.5, 12)).toBeNull()
    expect(splitInstallments(35_900, 0)).toBeNull()
  })
  it("total exact sur toute une plage de prix", () => {
    for (let p = 1_200; p < 1_400; p++) {
      const s = splitInstallments(p, 12)!
      expect(sum(s, 12)).toBe(p)
      expect(Math.abs(s.adjustmentCents)).toBeLessThanOrEqual(6)
    }
  })
})

describe("installmentPosition — n-ième échéance de chaque période", () => {
  const anchor = new Date("2026-10-23T09:00:00.000Z")
  const monthStart = (k: number) => new Date(Date.UTC(2026, 9 + k, 23, 9))
  it("indices 0..11 puis 12..23 : dernière = 11 et 23", () => {
    const lasts: number[] = []
    for (let k = 0; k < 24; k++) {
      const p = installmentPosition(anchor, monthStart(k), 12)
      expect(p.index).toBe(k % 12)
      if (p.isLast) lasts.push(k)
    }
    expect(lasts).toEqual([11, 23])
  })
  it("robuste à quelques secondes de dérive Stripe", () => {
    expect(installmentPosition(anchor, new Date(monthStart(11).getTime() - 5_000), 12)).toEqual({ index: 11, isLast: true })
    expect(installmentPosition(anchor, new Date(monthStart(11).getTime() + 5_000), 12)).toEqual({ index: 11, isLast: true })
  })
  it("ancre au 31 : mois courts bornés, sans dérive", () => {
    const a = new Date("2026-01-31T00:00:00.000Z")
    expect(installmentPosition(a, new Date("2026-02-28T00:00:00.000Z"), 12).index).toBe(1)
    expect(installmentPosition(a, new Date("2026-12-31T00:00:00.000Z"), 12)).toEqual({ index: 11, isLast: true })
    expect(installmentPosition(a, new Date("2027-01-31T00:00:00.000Z"), 12)).toEqual({ index: 0, isLast: false })
  })
})

describe("fenêtre de droits 12 mois avec facturation mensuelle", () => {
  it("toutes les échéances d'une année tombent dans la même fenêtre", () => {
    const anchor = new Date("2028-02-29T00:00:00.000Z") // bissextile
    const interval = rightsInterval({ rightsPeriodMonthsSnapshot: 12, billingIntervalUnitSnapshot: "month", billingIntervalCountSnapshot: 1 })
    const w0 = buildCycleWindow(anchor, interval, new Date("2028-03-15T00:00:00.000Z"))!
    const w11 = buildCycleWindow(anchor, interval, new Date("2029-02-10T00:00:00.000Z"))!
    expect(w0.cycleStart).toEqual(w11.cycleStart)
    expect(w0.cycleEnd).toEqual(new Date("2029-02-28T00:00:00.000Z"))
    const next = buildCycleWindow(anchor, interval, new Date("2029-03-01T00:00:00.000Z"))!
    expect(next.index).toBe(1)
  })
  it("V1 (snapshot NULL) : la fenêtre reste la période de facturation", () => {
    expect(rightsInterval({ rightsPeriodMonthsSnapshot: null, billingIntervalUnitSnapshot: "week", billingIntervalCountSnapshot: 4 })).toEqual({ unit: "week", count: 4 })
  })
})

describe("resolveScheduleChoice — choix re-vérifié côté serveur", () => {
  it.each([
    [null, undefined, null],
    [null, "monthly", null], // V1 : un choix envoyé par le navigateur est ignoré
    ["period", undefined, "period"],
    ["monthly", undefined, "monthly"],
    ["customer_choice", "monthly", "monthly"],
    ["customer_choice", "period", "period"],
  ] as const)("%s + %s → %s", (schedule, requested, expected) => {
    expect(resolveScheduleChoice(schedule, requested)).toBe(expected)
  })
  it.each([
    ["period", "monthly"],
    ["monthly", "period"],
    ["customer_choice", undefined],
    ["customer_choice", "prepaid"],
    ["customer_choice", "weekly"],
  ] as const)("%s + %s → refusé", (schedule, requested) => {
    expect(() => resolveScheduleChoice(schedule, requested)).toThrow(CustomerSubscriptionError)
  })
})

const yearly = {
  priceCents: 35_900,
  billingIntervalUnit: "month" as const,
  billingIntervalCount: 12,
  commitmentUnit: "month" as const,
  commitmentCount: 12,
  renewalMode: "same_term" as const,
  rightsPeriodMonths: 12,
  paymentSchedule: "customer_choice" as const,
}

describe("scheduleSnapshot — conditions figées du contrat", () => {
  it("mensuel : mensualité, facturation mensuelle, engagement 12 mois, snapshots de période", () => {
    expect(scheduleSnapshot(yearly, "monthly")).toEqual({
      priceCentsSnapshot: 2992,
      billingIntervalUnitSnapshot: "month",
      billingIntervalCountSnapshot: 1,
      commitmentUnitSnapshot: "month",
      commitmentCountSnapshot: 12,
      renewalModeSnapshot: "same_term",
      rightsPeriodMonthsSnapshot: 12,
      periodPriceCentsSnapshot: 35_900,
      installmentsPerPeriodSnapshot: 12,
    })
  })
  it("en une fois (formule au choix, renouvelée) : 359 € / an, sans engagement, comme V1", () => {
    expect(scheduleSnapshot(yearly, "period")).toEqual({
      priceCentsSnapshot: 35_900,
      billingIntervalUnitSnapshot: "month",
      billingIntervalCountSnapshot: 12,
      commitmentUnitSnapshot: "none",
      commitmentCountSnapshot: 0,
      renewalModeSnapshot: "open_ended",
      rightsPeriodMonthsSnapshot: null,
      periodPriceCentsSnapshot: null,
      installmentsPerPeriodSnapshot: null,
    })
  })
  it("en une fois (formule au choix, qui s'arrête) : une période puis fin", () => {
    const s = scheduleSnapshot({ ...yearly, renewalMode: "none" }, "period")
    expect([s.commitmentUnitSnapshot, s.commitmentCountSnapshot, s.renewalModeSnapshot]).toEqual(["month", 12, "none"])
  })
  it("formule « en une fois » : copie exacte de la formule (V1)", () => {
    const plan = { ...yearly, paymentSchedule: "period" as const, commitmentUnit: "none" as const, commitmentCount: 0, renewalMode: "open_ended" as const }
    expect(scheduleSnapshot(plan, "period")).toMatchObject({ priceCentsSnapshot: 35_900, billingIntervalCountSnapshot: 12, commitmentUnitSnapshot: "none", renewalModeSnapshot: "open_ended", rightsPeriodMonthsSnapshot: null })
  })
  it("formule V1 (aucune période de droits) : copie exacte", () => {
    const plan = { ...yearly, billingIntervalUnit: "week" as const, billingIntervalCount: 4, priceCents: 8900, rightsPeriodMonths: null, paymentSchedule: null, commitmentUnit: "none" as const, commitmentCount: 0, renewalMode: "open_ended" as const }
    expect(scheduleSnapshot(plan, null)).toEqual({
      priceCentsSnapshot: 8900,
      billingIntervalUnitSnapshot: "week",
      billingIntervalCountSnapshot: 4,
      commitmentUnitSnapshot: "none",
      commitmentCountSnapshot: 0,
      renewalModeSnapshot: "open_ended",
      rightsPeriodMonthsSnapshot: null,
      periodPriceCentsSnapshot: null,
      installmentsPerPeriodSnapshot: null,
    })
  })
})

const base: PlanConfigInput = {
  name: "Formule Sérénité",
  priceCents: 35_900,
  currency: "EUR",
  billingIntervalUnit: "month",
  billingIntervalCount: 12,
  includedUsesPerCycle: 6,
  includedServiceId: 1,
  commitmentUnit: "month",
  commitmentCount: 12,
  renewalMode: "same_term",
  renewalNoticeDays: 3,
  allowRecurringPayment: true,
  allowPrepaidPayment: false,
  prepaidBillingCycles: null,
  rightsPeriodMonths: 12,
  paymentSchedule: "monthly",
  status: "active",
}
const fields = (input: PlanConfigInput) => {
  const v = validatePlanConfig(input)
  return v.ok ? [] : v.issues.map((i) => i.field)
}

describe("validatePlanConfig — période de droits", () => {
  it("6 lavages / an, paiement mensuel, engagement 12 mois : valide", () => {
    const v = validatePlanConfig(base)
    expect(v.ok).toBe(true)
    if (v.ok) expect([v.value.rightsPeriodMonths, v.value.paymentSchedule]).toEqual([12, "monthly"])
  })
  it("V1 inchangé : colonnes absentes ⇒ null", () => {
    const v = validatePlanConfig({ ...base, rightsPeriodMonths: undefined, paymentSchedule: undefined })
    expect(v.ok && [v.value.rightsPeriodMonths, v.value.paymentSchedule]).toEqual([null, null])
  })
  it("mensuel pluri-mensuel : « continue sans engagement » refusé (décision C)", () => {
    expect(fields({ ...base, renewalMode: "open_ended" })).toContain("renewalMode")
    expect(fields({ ...base, paymentSchedule: "customer_choice", renewalMode: "open_ended" })).toContain("renewalMode")
  })
  it("mensuel pluri-mensuel : engagement obligatoire = durée de la période", () => {
    expect(fields({ ...base, commitmentUnit: "none", commitmentCount: 0, renewalMode: "none" })).toContain("commitmentCount")
    expect(fields({ ...base, commitmentCount: 6 })).toContain("commitmentCount")
    expect(fields({ ...base, commitmentUnit: "billing_cycle" })).toContain("commitmentCount")
  })
  it("la facturation de référence doit être la période elle-même", () => {
    expect(fields({ ...base, billingIntervalCount: 1 })).toContain("billingIntervalCount")
    expect(fields({ ...base, billingIntervalUnit: "week", billingIntervalCount: 52 })).toContain("billingIntervalCount")
  })
  it("valeurs hors liste refusées", () => {
    expect(fields({ ...base, rightsPeriodMonths: 6, billingIntervalCount: 6, commitmentCount: 6 })).toContain("rightsPeriodMonths")
    expect(fields({ ...base, paymentSchedule: "weekly" })).toContain("paymentSchedule")
    expect(fields({ ...base, paymentSchedule: null })).toContain("paymentSchedule")
    expect(fields({ ...base, rightsPeriodMonths: null })).toContain("rightsPeriodMonths")
  })
  it("prepaid interdit avec une période de droits (prepaid hors périmètre)", () => {
    expect(fields({ ...base, allowPrepaidPayment: true, prepaidBillingCycles: 1 })).toContain("paymentMode")
  })
  it("période d'un mois : seul « en une fois » a du sens", () => {
    expect(fields({ ...base, rightsPeriodMonths: 1, billingIntervalCount: 1, commitmentCount: 1 })).toContain("paymentSchedule")
    expect(fields({ ...base, rightsPeriodMonths: 1, billingIntervalCount: 1, paymentSchedule: "period", commitmentUnit: "none", commitmentCount: 0, renewalMode: "open_ended" })).toEqual([])
  })
  it("mensualité impossible (prix trop bas) : refusée sur le prix", () => {
    expect(fields({ ...base, priceCents: 6 })).toContain("priceCents")
  })
  it("en une fois : engagement et renouvellement libres comme V1", () => {
    expect(fields({ ...base, paymentSchedule: "period", commitmentUnit: "none", commitmentCount: 0, renewalMode: "open_ended" })).toEqual([])
  })
})

describe("montant réel d'une échéance et mensualités restantes", () => {
  const sub = { billingAnchorAt: new Date("2026-10-23T09:00:00.000Z"), priceCentsSnapshot: 2992, periodPriceCentsSnapshot: 35_900, installmentsPerPeriodSnapshot: 12 }
  const at = (k: number) => new Date(Date.UTC(2026, 9 + k, 23, 9))
  it("12e échéance de chaque période : 29,88 € ; les autres : 29,92 €", () => {
    expect([0, 1, 10, 11, 12, 23].map((k) => installmentAmountAt(sub, at(k)))).toEqual([2992, 2992, 2992, 2988, 2992, 2988])
  })
  it("V1 : toujours le prix figé", () => {
    expect(installmentAmountAt({ ...sub, periodPriceCentsSnapshot: null, installmentsPerPeriodSnapshot: null }, at(11))).toBe(2992)
  })
  it("mensualités restantes : 11 sur 12 après la 1re, 0 au 12e mois, 11 au 13e", () => {
    expect(installmentsRemaining(sub, new Date("2026-10-24T00:00:00.000Z"))).toEqual({ remaining: 11, total: 12 })
    expect(installmentsRemaining(sub, new Date("2027-10-01T00:00:00.000Z"))).toEqual({ remaining: 0, total: 12 })
    expect(installmentsRemaining(sub, new Date("2027-10-24T00:00:00.000Z"))).toEqual({ remaining: 11, total: 12 })
    expect(installmentsRemaining({ ...sub, installmentsPerPeriodSnapshot: null }, new Date())).toBeNull()
  })
})
