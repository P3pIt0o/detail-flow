import { describe, expect, it } from "vitest"
import {
  COMMERCIAL_TIERS,
  LIFETIME_MAX_LICENSES,
  LIFETIME_OFFER,
  LOYALTY_ELIGIBLE_PLANS,
  LOYALTY_MAX_DISCOUNT_BASIS_POINTS,
  PUBLIC_PLAN_NAME,
  applyLoyaltyDiscount,
  feeCapLabel,
  formatBasisPointsPercent,
  formatEuroCents,
  getCommercialTierForPlan,
  loyaltyDiscountBasisPoints,
  nextLoyaltyTenureMonths,
  smsAllowanceLabel,
} from "@/lib/pricing/commercial-rules"

describe("commercial mapping (technique -> public)", () => {
  it("maps each technical plan to its public name", () => {
    expect(PUBLIC_PLAN_NAME.FREE).toBe("Essentiel")
    expect(PUBLIC_PLAN_NAME.PRO).toBe("Indépendant")
    expect(PUBLIC_PLAN_NAME.BUSINESS).toBe("Croissance")
    expect(PUBLIC_PLAN_NAME.ENTERPRISE).toBe("Centre")
  })
})

describe("prices (cents)", () => {
  it("holds the validated monthly prices", () => {
    expect(COMMERCIAL_TIERS.FREE.monthlyPriceCents).toBe(0)
    expect(COMMERCIAL_TIERS.PRO.monthlyPriceCents).toBe(1990)
    expect(COMMERCIAL_TIERS.BUSINESS.monthlyPriceCents).toBe(3490)
    expect(COMMERCIAL_TIERS.ENTERPRISE.monthlyPriceCents).toBe(5990)
  })
})

describe("DetailFlow commission (basis points) and monthly caps (cents)", () => {
  it("has the correct commission per tier", () => {
    expect(COMMERCIAL_TIERS.FREE.fee.basisPoints).toBe(200) // 2 %
    expect(COMMERCIAL_TIERS.PRO.fee.basisPoints).toBe(100) // 1 %
    expect(COMMERCIAL_TIERS.BUSINESS.fee.basisPoints).toBe(50) // 0,5 %
    expect(COMMERCIAL_TIERS.ENTERPRISE.fee.basisPoints).toBe(25) // 0,25 %
  })

  it("has the correct monthly caps", () => {
    expect(COMMERCIAL_TIERS.FREE.fee.monthlyCapCents).toBe(1990)
    expect(COMMERCIAL_TIERS.PRO.fee.monthlyCapCents).toBe(500)
    expect(COMMERCIAL_TIERS.BUSINESS.fee.monthlyCapCents).toBe(500)
    expect(COMMERCIAL_TIERS.ENTERPRISE.fee.monthlyCapCents).toBe(600)
  })
})

describe("SMS allowances", () => {
  it("Essentiel has no SMS module", () => {
    expect(COMMERCIAL_TIERS.FREE.sms).toEqual({ kind: "none" })
  })
  it("Indépendant offers 20 welcome SMS once", () => {
    expect(COMMERCIAL_TIERS.PRO.sms).toEqual({ kind: "welcome_once", count: 20 })
  })
  it("Croissance includes 50 monthly SMS", () => {
    expect(COMMERCIAL_TIERS.BUSINESS.sms).toEqual({ kind: "monthly", count: 50 })
  })
  it("Centre includes 150 monthly SMS", () => {
    expect(COMMERCIAL_TIERS.ENTERPRISE.sms).toEqual({ kind: "monthly", count: 150 })
  })
})

describe("loyalty program", () => {
  it("excludes FREE and includes PRO/BUSINESS/ENTERPRISE only", () => {
    expect(LOYALTY_ELIGIBLE_PLANS).not.toContain("FREE")
    expect([...LOYALTY_ELIGIBLE_PLANS].sort()).toEqual(["BUSINESS", "ENTERPRISE", "PRO"])
  })

  it("returns the correct discount at each tenure threshold", () => {
    expect(loyaltyDiscountBasisPoints(5)).toBe(0)
    expect(loyaltyDiscountBasisPoints(6)).toBe(500) // -5 %
    expect(loyaltyDiscountBasisPoints(12)).toBe(1000) // -10 %
    expect(loyaltyDiscountBasisPoints(18)).toBe(1500) // -15 %
    expect(loyaltyDiscountBasisPoints(24)).toBe(1750) // -17,5 %
    expect(loyaltyDiscountBasisPoints(30)).toBe(2000) // -20 %
  })

  it("never exceeds the -20 % absolute cap, even after 48 months", () => {
    expect(loyaltyDiscountBasisPoints(48)).toBe(LOYALTY_MAX_DISCOUNT_BASIS_POINTS)
    expect(loyaltyDiscountBasisPoints(48)).toBe(2000)
    expect(loyaltyDiscountBasisPoints(999)).toBe(2000)
  })

  it("ignores negative / invalid tenure", () => {
    expect(loyaltyDiscountBasisPoints(-3)).toBe(0)
    expect(loyaltyDiscountBasisPoints(Number.NaN)).toBe(0)
  })

  it("applies the discount only to the subscription price", () => {
    // BUSINESS 34,90 € after 30 months (-20 %) => 27,92 €
    expect(applyLoyaltyDiscount(3490, 30)).toBe(2792)
    // 19,90 € after 6 months (-5 %) => 18,905 => 1891 cents (rounded)
    expect(applyLoyaltyDiscount(1990, 6)).toBe(1891)
    // < 6 months => unchanged
    expect(applyLoyaltyDiscount(1990, 3)).toBe(1990)
  })
})

describe("loyalty continuity", () => {
  it("resets tenure to zero on any cancellation", () => {
    expect(nextLoyaltyTenureMonths(30, "CANCELLATION")).toBe(0)
    expect(nextLoyaltyTenureMonths(6, "CANCELLATION")).toBe(0)
  })

  it("keeps tenure on an uninterrupted plan change (up or down)", () => {
    expect(nextLoyaltyTenureMonths(14, "PLAN_CHANGE_CONTINUOUS")).toBe(14)
  })

  it("keeps tenure during a temporary payment-failure grace period", () => {
    expect(nextLoyaltyTenureMonths(9, "PAYMENT_FAILURE_GRACE")).toBe(9)
  })
})

describe("DetailFlow Lifetime", () => {
  it("costs 1 290 € HT one-time", () => {
    expect(LIFETIME_OFFER.oneTimePriceCents).toBe(129000)
  })

  it("offers 2 × 690 € HT (1 380 € total, more expensive)", () => {
    expect(LIFETIME_OFFER.installmentCount).toBe(2)
    expect(LIFETIME_OFFER.installmentAmountCents).toBe(69000)
    expect(LIFETIME_OFFER.installmentTotalCents).toBe(138000)
    expect(LIFETIME_OFFER.installmentTotalCents).toBeGreaterThan(LIFETIME_OFFER.oneTimePriceCents)
  })

  it("is limited to 50 licenses", () => {
    expect(LIFETIME_MAX_LICENSES).toBe(50)
    expect(LIFETIME_OFFER.maxLicenses).toBe(50)
  })

  it("grants BUSINESS / Croissance commercial scope (never FOUNDER)", () => {
    expect(LIFETIME_OFFER.entitlementPlan).toBe("BUSINESS")
  })

  it("has no monthly subscription and no DetailFlow commission", () => {
    expect(LIFETIME_OFFER.billingMode).toBe("LIFETIME")
    expect(LIFETIME_OFFER.fee.basisPoints).toBe(0)
    expect(LIFETIME_OFFER.fee.monthlyCapCents).toBe(0)
  })

  it("includes 20 welcome SMS once (no free monthly quota)", () => {
    expect(LIFETIME_OFFER.sms).toEqual({ kind: "welcome_once", count: 20 })
  })
})

describe("formatting helpers (deterministic)", () => {
  it("formats euro cents with conditional decimals", () => {
    expect(formatEuroCents(0)).toBe("0 €")
    expect(formatEuroCents(1990)).toBe("19,90 €")
    expect(formatEuroCents(5990)).toBe("59,90 €")
    expect(formatEuroCents(129000)).toBe("1\u00A0290 €")
    expect(formatEuroCents(138000)).toBe("1\u00A0380 €")
  })

  it("formats basis points as french percentages", () => {
    expect(formatBasisPointsPercent(200)).toBe("2 %")
    expect(formatBasisPointsPercent(100)).toBe("1 %")
    expect(formatBasisPointsPercent(50)).toBe("0,5 %")
    expect(formatBasisPointsPercent(25)).toBe("0,25 %")
    expect(formatBasisPointsPercent(1750)).toBe("17,5 %")
  })

  it("builds the fee cap label", () => {
    expect(feeCapLabel(COMMERCIAL_TIERS.FREE.fee)).toBe("2 % par paiement — plafonné à 19,90 € / mois")
    expect(feeCapLabel(COMMERCIAL_TIERS.ENTERPRISE.fee)).toBe("0,25 % par paiement — plafonné à 6 € / mois")
  })

  it("builds the SMS allowance label", () => {
    expect(smsAllowanceLabel(COMMERCIAL_TIERS.FREE.sms)).toBeNull()
    expect(smsAllowanceLabel(COMMERCIAL_TIERS.PRO.sms)).toBe("20 SMS offerts au démarrage, puis à la consommation")
    expect(smsAllowanceLabel(COMMERCIAL_TIERS.BUSINESS.sms)).toBe("50 SMS / mois inclus")
    expect(smsAllowanceLabel(COMMERCIAL_TIERS.ENTERPRISE.sms)).toBe("150 SMS / mois inclus")
  })
})

describe("plan lookup guard", () => {
  it("returns null for non-commercial / null plans", () => {
    expect(getCommercialTierForPlan(null)).toBeNull()
    expect(getCommercialTierForPlan("FOUNDER")).toBeNull()
  })

  it("returns the tier for commercial plans", () => {
    expect(getCommercialTierForPlan("PRO")?.publicName).toBe("Indépendant")
  })
})
