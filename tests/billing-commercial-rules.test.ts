import { describe, it, expect } from "vitest"
import {
  COMMISSION_RULES,
  LIFETIME_COMMISSION_RULE,
  resolveCommercialCommission,
  getBusinessMonthKey,
  computeCappedPlatformFeeCents,
  getFullCalendarMonthsElapsed,
  getLoyaltyDiscountBps,
  applyLoyaltyDiscountCents,
  MAX_LOYALTY_DISCOUNT_BPS,
} from "@/lib/billing/commercial-rules"
import { BILLING_PLANS } from "@/lib/billing/config"
import { LIFETIME_LICENSE_PLAN, LIFETIME_PLATFORM_FEE_BPS } from "@/lib/billing/lifetime"

/** startedAt + n mois calendaires (même jour/heure UTC). */
function plusMonths(start: Date, n: number): Date {
  const d = new Date(start)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d
}

describe("commissions par offre", () => {
  it("FREE = 200 bps / cap 1990", () => {
    expect(COMMISSION_RULES.FREE).toEqual({ feeBps: 200, monthlyFeeCapCents: 1990 })
  })
  it("PRO = 100 / 500", () => {
    expect(COMMISSION_RULES.PRO).toEqual({ feeBps: 100, monthlyFeeCapCents: 500 })
  })
  it("BUSINESS = 50 / 500", () => {
    expect(COMMISSION_RULES.BUSINESS).toEqual({ feeBps: 50, monthlyFeeCapCents: 500 })
  })
  it("ENTERPRISE = 25 / 600", () => {
    expect(COMMISSION_RULES.ENTERPRISE).toEqual({ feeBps: 25, monthlyFeeCapCents: 600 })
  })
  it("Lifetime = 0 / 0, cohérent avec LIFETIME_PLATFORM_FEE_BPS", () => {
    expect(LIFETIME_COMMISSION_RULE).toEqual({ feeBps: 0, monthlyFeeCapCents: 0 })
    expect(LIFETIME_COMMISSION_RULE.feeBps).toBe(LIFETIME_PLATFORM_FEE_BPS)
  })
})

describe("resolveCommercialCommission — priorité", () => {
  it("Lifetime détecté par billingMode, même avec licensePlan BUSINESS et un override", () => {
    const r = resolveCommercialCommission(
      { billingMode: "lifetime", licensePlan: LIFETIME_LICENSE_PLAN, platformFeeBps: 300 },
      150,
    )
    expect(r).toEqual({ feeBps: 0, monthlyFeeCapCents: 0, source: "lifetime" })
  })
  it("BUSINESS sans billingMode lifetime = taux Performance, JAMAIS 0 %", () => {
    const r = resolveCommercialCommission({ billingMode: "subscription", licensePlan: "BUSINESS", platformFeeBps: null }, 0)
    expect(r).toEqual({ feeBps: 50, monthlyFeeCapCents: 500, source: "plan" })
  })
  it("override Super Admin : taux override, plafond de l'offre conservé", () => {
    const r = resolveCommercialCommission({ billingMode: "subscription", licensePlan: "PRO", platformFeeBps: 30 }, 0)
    expect(r).toEqual({ feeBps: 30, monthlyFeeCapCents: 500, source: "override" })
  })
  it("override explicite à 0 respecté", () => {
    const r = resolveCommercialCommission({ billingMode: "free", licensePlan: "FREE", platformFeeBps: 0 }, 0)
    expect(r).toEqual({ feeBps: 0, monthlyFeeCapCents: 1990, source: "override" })
  })
  it("taux de l'offre FREE", () => {
    const r = resolveCommercialCommission({ billingMode: "free", licensePlan: "FREE", platformFeeBps: null }, 0)
    expect(r).toEqual({ feeBps: 200, monthlyFeeCapCents: 1990, source: "plan" })
  })
  it("fallback global pour un plan non identifiable", () => {
    for (const licensePlan of ["FOUNDER", "ESSENTIAL", null, "INCONNU"]) {
      const r = resolveCommercialCommission({ billingMode: "free", licensePlan, platformFeeBps: null }, 120)
      expect(r).toEqual({ feeBps: 120, monthlyFeeCapCents: null, source: "fallback" })
    }
  })
})

describe("computeCappedPlatformFeeCents — plafond mensuel", () => {
  it("commission normale sous le plafond", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 12000, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 0 })).toBe(120)
  })
  it("exemple Indépendant : cap 500, consommé 470, théorique 120 → 30", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 12000, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 470 })).toBe(30)
  })
  it("plafond déjà atteint → 0", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 12000, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 500 })).toBe(0)
  })
  it("plafond dépassé (données incohérentes) → 0, jamais négatif", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 12000, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 900 })).toBe(0)
  })
  it("ne dépasse jamais le plafond sur une série de paiements", () => {
    let consumed = 0
    for (let i = 0; i < 50; i++) {
      consumed += computeCappedPlatformFeeCents({ grossAmountCents: 8990, feeBps: 200, monthlyCapCents: 1990, alreadyConsumedCents: consumed })
      expect(consumed).toBeLessThanOrEqual(1990)
    }
    expect(consumed).toBe(1990)
  })
  it("jamais supérieure à la commission théorique", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 1000, feeBps: 200, monthlyCapCents: 1990, alreadyConsumedCents: 0 })).toBe(20)
  })
  it("0 % → 0", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 50000, feeBps: 0, monthlyCapCents: 500, alreadyConsumedCents: 0 })).toBe(0)
  })
  it("Lifetime 0 / 0 → 0", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 50000, feeBps: 0, monthlyCapCents: 0, alreadyConsumedCents: 0 })).toBe(0)
  })
  it("entrées négatives ou non finies → 0, résultat entier", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: -500, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 0 })).toBe(0)
    expect(computeCappedPlatformFeeCents({ grossAmountCents: Number.NaN, feeBps: 100, monthlyCapCents: 500, alreadyConsumedCents: 0 })).toBe(0)
    const fee = computeCappedPlatformFeeCents({ grossAmountCents: 3333, feeBps: 25, monthlyCapCents: 600, alreadyConsumedCents: -10 })
    expect(Number.isInteger(fee)).toBe(true)
  })
  it("cap null (fallback historique) → commission théorique", () => {
    expect(computeCappedPlatformFeeCents({ grossAmountCents: 100000, feeBps: 100, monthlyCapCents: null, alreadyConsumedCents: 99999 })).toBe(1000)
  })
})

describe("getBusinessMonthKey — mois civil", () => {
  it("détecte le changement de mois", () => {
    expect(getBusinessMonthKey(new Date("2026-10-31T12:00:00Z"), "Europe/Paris")).toBe("2026-10")
    expect(getBusinessMonthKey(new Date("2026-11-01T12:00:00Z"), "Europe/Paris")).toBe("2026-11")
  })
  it("Europe/Paris : 1er novembre 00:30 Paris (= 31 oct 23:30 UTC) est déjà novembre", () => {
    const d = new Date("2026-10-31T23:30:00Z")
    expect(getBusinessMonthKey(d, "Europe/Paris")).toBe("2026-11")
    expect(getBusinessMonthKey(d, "UTC")).toBe("2026-10")
  })
  it("Europe/Paris en été : 1er octobre 00:30 Paris (= 30 sept 22:30 UTC) est octobre", () => {
    expect(getBusinessMonthKey(new Date("2026-09-30T22:30:00Z"), "Europe/Paris")).toBe("2026-10")
  })
  it("pas de bascule erronée : 31 oct 23:59:59 Paris reste octobre", () => {
    expect(getBusinessMonthKey(new Date("2026-10-31T22:59:59Z"), "Europe/Paris")).toBe("2026-10")
  })
  it("fuseau absent ou invalide → Europe/Paris", () => {
    const d = new Date("2026-10-31T23:30:00Z")
    expect(getBusinessMonthKey(d, null)).toBe("2026-11")
    expect(getBusinessMonthKey(d, "")).toBe("2026-11")
    expect(getBusinessMonthKey(d, "Pas/UnFuseau")).toBe("2026-11")
  })
  it("exemple getBusinessMonthKey(date, tz) => 2026-09", () => {
    expect(getBusinessMonthKey(new Date("2026-09-28T10:00:00Z"), "Europe/Paris")).toBe("2026-09")
  })
})

describe("fidélité — ancienneté et paliers", () => {
  const start = new Date("2024-01-15T10:00:00Z")
  const cases: [number, number][] = [
    [0, 0],
    [5, 0],
    [6, 500],
    [11, 500],
    [12, 1000],
    [18, 1500],
    [24, 1750],
    [30, 2000],
    [48, 2000],
  ]
  for (const [months, bps] of cases) {
    it(`${months} mois → ${bps / 100} %`, () => {
      expect(getLoyaltyDiscountBps(start, plusMonths(start, months))).toBe(bps)
    })
  }
  it("1 ms avant les 6 mois exacts → toujours 0 %", () => {
    const now = new Date(plusMonths(start, 6).getTime() - 1)
    expect(getFullCalendarMonthsElapsed(start, now)).toBe(5)
    expect(getLoyaltyDiscountBps(start, now)).toBe(0)
  })
  it("mois calendaires, pas jours / 30 (6 × 30 j ne font pas 6 mois)", () => {
    const now = new Date(start.getTime() + 180 * 86_400_000)
    expect(getFullCalendarMonthsElapsed(start, now)).toBe(5)
  })
  it("fin de mois : 31 janvier + 1 mois = 29 février (année bissextile)", () => {
    const s = new Date("2024-01-31T00:00:00Z")
    expect(getFullCalendarMonthsElapsed(s, new Date("2024-02-28T23:59:59Z"))).toBe(0)
    expect(getFullCalendarMonthsElapsed(s, new Date("2024-02-29T00:00:00Z"))).toBe(1)
  })
  it("date absente, invalide ou future → 0 %", () => {
    const now = new Date("2026-09-28T00:00:00Z")
    expect(getLoyaltyDiscountBps(null, now)).toBe(0)
    expect(getLoyaltyDiscountBps(undefined, now)).toBe(0)
    expect(getLoyaltyDiscountBps(new Date("invalid"), now)).toBe(0)
    expect(getLoyaltyDiscountBps(new Date("2027-01-01T00:00:00Z"), now)).toBe(0)
  })
  it("jamais au-delà de 20 %", () => {
    expect(getLoyaltyDiscountBps(new Date("2000-01-01T00:00:00Z"), new Date("2026-09-28T00:00:00Z"))).toBe(MAX_LOYALTY_DISCOUNT_BPS)
  })
})

describe("fidélité — prix remisé", () => {
  it("1990 / 3490 / 5990 avec 20 % → 1592 / 2792 / 4792", () => {
    expect(applyLoyaltyDiscountCents(1990, 2000)).toBe(1592)
    expect(applyLoyaltyDiscountCents(3490, 2000)).toBe(2792)
    expect(applyLoyaltyDiscountCents(5990, 2000)).toBe(4792)
  })
  it("prix issus de la source commerciale existante (aucune duplication)", () => {
    expect(BILLING_PLANS.PRO.monthlyPriceCents).toBe(1990)
    expect(BILLING_PLANS.BUSINESS.monthlyPriceCents).toBe(3490)
    expect(BILLING_PLANS.ENTERPRISE.monthlyPriceCents).toBe(5990)
    const at30 = getLoyaltyDiscountBps(new Date("2024-01-15T10:00:00Z"), new Date("2026-07-15T10:00:00Z"))
    expect(applyLoyaltyDiscountCents(BILLING_PLANS.PRO.monthlyPriceCents, at30)).toBe(1592)
    expect(applyLoyaltyDiscountCents(BILLING_PLANS.BUSINESS.monthlyPriceCents, at30)).toBe(2792)
    expect(applyLoyaltyDiscountCents(BILLING_PLANS.ENTERPRISE.monthlyPriceCents, at30)).toBe(4792)
  })
  it("réduction plafonnée à 20 % même si on demande plus", () => {
    expect(applyLoyaltyDiscountCents(1990, 5000)).toBe(1592)
  })
  it("0 % → prix inchangé ; résultat toujours entier", () => {
    expect(applyLoyaltyDiscountCents(1990, 0)).toBe(1990)
    expect(Number.isInteger(applyLoyaltyDiscountCents(1990, 1750))).toBe(true)
  })
  it("la fidélité ne modifie pas la commission", () => {
    const before = resolveCommercialCommission({ billingMode: "subscription", licensePlan: "PRO", platformFeeBps: null }, 0)
    applyLoyaltyDiscountCents(1990, 2000)
    expect(before).toEqual({ feeBps: 100, monthlyFeeCapCents: 500, source: "plan" })
    expect(COMMISSION_RULES.PRO).toEqual({ feeBps: 100, monthlyFeeCapCents: 500 })
  })
})
