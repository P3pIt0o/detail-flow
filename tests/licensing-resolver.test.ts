import { describe, it, expect } from "vitest"
import {
  resolveEntitlements,
  resolveFeature,
  resolveLimit,
  type LicenseContext,
  type ResolvedOverride,
} from "@/lib/licensing/resolver"
import { PLAN_MATRIX, planFeature, PLAN_META } from "@/lib/licensing/registry"
import { FEATURE_KEYS } from "@/lib/licensing/types"

const NOW = new Date("2026-08-20T12:00:00Z")

function ctx(plan: LicenseContext["plan"], overrides: ResolvedOverride[] = []): LicenseContext {
  return { plan, generation: plan ? "LIFETIME_V1" : null, overrides }
}
function feature(view: ReturnType<typeof resolveEntitlements>, key: string) {
  return view.features.find((f) => f.key === key)!
}

describe("matrice des plans", () => {
  it("FREE : aucune feature premium + limites strictes", () => {
    for (const k of FEATURE_KEYS) expect(planFeature("FREE", k)).toBe(false)
    expect(PLAN_MATRIX.FREE.limits).toEqual({
      maxCustomers: 10,
      maxVehicles: 10,
      maxQuotesPerMonth: 3,
      maxInvoicesPerMonth: 3,
    })
  })

  it("ESSENTIAL : business_stats + expense_management, pas online_booking", () => {
    expect(planFeature("ESSENTIAL", "business_stats")).toBe(true)
    expect(planFeature("ESSENTIAL", "expense_management")).toBe(true)
    expect(planFeature("ESSENTIAL", "online_booking")).toBe(false)
    expect(PLAN_MATRIX.ESSENTIAL.limits.maxCustomers).toBeNull()
  })

  it("PRO : profitability_analysis oui, advanced_reporting non", () => {
    expect(planFeature("PRO", "profitability_analysis")).toBe(true)
    expect(planFeature("PRO", "advanced_reporting")).toBe(false)
    expect(planFeature("PRO", "online_booking")).toBe(true)
    expect(planFeature("PRO", "online_payments")).toBe(true)
  })

  it("BUSINESS : advanced_reporting oui, early_access non", () => {
    expect(planFeature("BUSINESS", "advanced_reporting")).toBe(true)
    expect(planFeature("BUSINESS", "marketing")).toBe(true)
    expect(planFeature("BUSINESS", "sms")).toBe(true)
    expect(planFeature("BUSINESS", "early_access")).toBe(false)
  })

  it("FOUNDER : toutes les features LIFETIME_V1 (dérivé du registre) + early_access", () => {
    for (const k of FEATURE_KEYS) expect(planFeature("FOUNDER", k)).toBe(true)
    expect(planFeature("FOUNDER", "early_access")).toBe(true)
    expect(PLAN_META.FOUNDER.internalOnly).toBe(true)
    expect(PLAN_META.FOUNDER.purchasable).toBe(false)
  })

  it("BUSINESS non commercialisable ; FREE/ESSENTIAL/PRO publics", () => {
    expect(PLAN_META.BUSINESS.purchasable).toBe(false)
    expect(PLAN_META.BUSINESS.internalOnly).toBe(false)
    expect(PLAN_META.FREE.purchasable).toBe(true)
    expect(PLAN_META.ESSENTIAL.purchasable).toBe(true)
    expect(PLAN_META.PRO.purchasable).toBe(true)
  })
})

describe("resolver — overrides", () => {
  it("ENABLED force une feature OFF du plan à ON", () => {
    const c = ctx("ESSENTIAL", [
      { featureKey: "online_booking", state: "ENABLED", source: "COMMERCIAL_GESTURE", expiresAt: null },
    ])
    expect(resolveFeature(c, "online_booking", NOW)).toBe(true)
  })

  it("DISABLED écrase un droit du plan (PRO booking coupé)", () => {
    const c = ctx("PRO", [{ featureKey: "online_booking", state: "DISABLED", source: "MANUAL", expiresAt: null }])
    expect(resolveFeature(c, "online_booking", NOW)).toBe(false)
  })

  it("INHERIT (absence d'override) retourne au droit du plan", () => {
    const c = ctx("PRO")
    expect(resolveFeature(c, "online_booking", NOW)).toBe(true)
    expect(resolveFeature(c, "advanced_reporting", NOW)).toBe(false)
  })
})

describe("resolver — essais (expiresAt)", () => {
  it("trial NON expiré est actif", () => {
    const c = ctx("ESSENTIAL", [
      {
        featureKey: "automations",
        state: "ENABLED",
        source: "TRIAL",
        expiresAt: new Date("2026-09-15T00:00:00Z"),
      },
    ])
    expect(resolveFeature(c, "automations", NOW)).toBe(true)
  })

  it("trial EXPIRÉ est ignoré (retour au plan)", () => {
    const c = ctx("ESSENTIAL", [
      {
        featureKey: "automations",
        state: "ENABLED",
        source: "TRIAL",
        expiresAt: new Date("2026-07-01T00:00:00Z"),
      },
    ])
    expect(resolveFeature(c, "automations", NOW)).toBe(false)
    const view = resolveEntitlements(c, NOW)
    expect(feature(view, "automations").overrideExpired).toBe(true)
    expect(feature(view, "automations").effective).toBe(false)
  })
})

describe("resolver — vue complète + fail-closed + legacy", () => {
  it("expose planValue / overrideState / effective par feature", () => {
    const c = ctx("ESSENTIAL", [
      { featureKey: "online_booking", state: "ENABLED", source: "COMMERCIAL_GESTURE", expiresAt: null },
    ])
    const view = resolveEntitlements(c, NOW)
    const booking = feature(view, "online_booking")
    expect(booking.planValue).toBe(false)
    expect(booking.overrideState).toBe("ENABLED")
    expect(booking.overrideSource).toBe("COMMERCIAL_GESTURE")
    expect(booking.effective).toBe(true)
    expect(booking.from).toBe("OVERRIDE")
  })

  it("LEGACY (plan null) : accès complet préservé, illimité", () => {
    const c = ctx(null)
    const view = resolveEntitlements(c, NOW)
    expect(view.legacy).toBe(true)
    for (const f of view.features) expect(f.effective).toBe(true)
    for (const l of view.limits) expect(l.value).toBeNull()
    expect(resolveFeature(c, "online_payments", NOW)).toBe(true)
    expect(resolveLimit(c, "maxCustomers")).toBeNull()
  })

  it("FAIL CLOSED : plan explicite inconnu => aucun droit premium", () => {
    const bad = { plan: "HACKER" as unknown as LicenseContext["plan"], generation: "LIFETIME_V1", overrides: [] }
    const view = resolveEntitlements(bad as LicenseContext, NOW)
    expect(view.legacy).toBe(false)
    for (const f of view.features) expect(f.effective).toBe(false)
    expect(resolveFeature(bad as LicenseContext, "website", NOW)).toBe(false)
    expect(resolveLimit(bad as LicenseContext, "maxCustomers")).toBe(0)
  })

  it("limites : FREE plafonnées, PRO illimitées", () => {
    expect(resolveLimit(ctx("FREE"), "maxCustomers")).toBe(10)
    expect(resolveLimit(ctx("FREE"), "maxQuotesPerMonth")).toBe(3)
    expect(resolveLimit(ctx("PRO"), "maxCustomers")).toBeNull()
  })

  it("FOUNDER via resolver : toutes features + early_access effectifs", () => {
    const view = resolveEntitlements(ctx("FOUNDER"), NOW)
    for (const f of view.features) expect(f.effective).toBe(true)
    expect(feature(view, "early_access").effective).toBe(true)
  })
})
