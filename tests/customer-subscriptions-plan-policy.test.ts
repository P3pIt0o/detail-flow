import { describe, it, expect } from "vitest"
import { planFeature, planLimit, FEATURE_REGISTRY } from "@/lib/licensing/registry"
import { LICENSE_PLANS, type LicensePlan } from "@/lib/licensing/types"
import {
  canCreateCustomerSubscription,
  getCustomerSubscriptionEntitlements,
  getCustomerSubscriptionPlatformFeeBps,
  getCustomerSubscriptionUsage,
} from "@/lib/customer-subscriptions/plan-policy"

const EXPECTED: Record<LicensePlan, { maxActive: number | null; feeBps: number }> = {
  FREE: { maxActive: 2, feeBps: 700 },
  ESSENTIAL: { maxActive: 2, feeBps: 700 },
  PRO: { maxActive: 10, feeBps: 300 },
  BUSINESS: { maxActive: null, feeBps: 0 },
  ENTERPRISE: { maxActive: null, feeBps: 0 },
  FOUNDER: { maxActive: null, feeBps: 0 },
}

const allowed = (plan: LicensePlan, activeCount: number) =>
  canCreateCustomerSubscription({ plan, activeCount }).allowed

describe("customer_subscriptions — feature / limite / commission", () => {
  it("feature enregistrée avec le bon label", () => {
    expect(FEATURE_REGISTRY.customer_subscriptions.label).toBe("Abonnements clients")
  })

  it.each(LICENSE_PLANS)("%s : feature activée (FOUNDER via sa génération)", (plan) => {
    expect(planFeature(plan, "customer_subscriptions")).toBe(true)
  })

  it.each(LICENSE_PLANS)("%s : limite et commission attendues", (plan) => {
    expect(planLimit(plan, "maxActiveCustomerSubscriptions")).toBe(EXPECTED[plan].maxActive)
    const fee = getCustomerSubscriptionPlatformFeeBps(plan)
    expect(fee).toBe(EXPECTED[plan].feeBps)
    expect(Number.isInteger(fee)).toBe(true)
    expect(getCustomerSubscriptionEntitlements(plan)).toEqual({
      enabled: true,
      maxActive: EXPECTED[plan].maxActive,
      platformFeeBps: EXPECTED[plan].feeBps,
    })
  })
})

describe("canCreateCustomerSubscription", () => {
  it("FREE : 0/2 et 1/2 autorisés, 2/2 et 3/2 refusés", () => {
    expect(allowed("FREE", 0)).toBe(true)
    expect(allowed("FREE", 1)).toBe(true)
    expect(allowed("FREE", 2)).toBe(false)
    expect(allowed("FREE", 3)).toBe(false)
    expect(canCreateCustomerSubscription({ plan: "FREE", activeCount: 2 })).toEqual({
      allowed: false,
      maxActive: 2,
      activeCount: 2,
      remaining: 0,
      reason: "LIMIT_REACHED",
    })
  })

  it("PRO : 9/10 autorisé, 10/10 et 25/10 refusés", () => {
    expect(allowed("PRO", 9)).toBe(true)
    expect(canCreateCustomerSubscription({ plan: "PRO", activeCount: 9 }).remaining).toBe(1)
    expect(allowed("PRO", 10)).toBe(false)
    expect(allowed("PRO", 25)).toBe(false)
  })

  it("BUSINESS / ENTERPRISE / FOUNDER : illimité", () => {
    expect(allowed("BUSINESS", 0)).toBe(true)
    expect(allowed("BUSINESS", 1000)).toBe(true)
    expect(allowed("ENTERPRISE", 1000)).toBe(true)
    expect(allowed("FOUNDER", 1000)).toBe(true)
    expect(canCreateCustomerSubscription({ plan: "BUSINESS", activeCount: 1000 }).remaining).toBeNull()
  })

  it("comptage invalide => refus (fail closed)", () => {
    for (const n of [-1, 1.5, Number.NaN]) {
      expect(canCreateCustomerSubscription({ plan: "BUSINESS", activeCount: n }).reason).toBe("INVALID_COUNT")
    }
  })
})

describe("downgrade : les contrats existants restent, seule la création est bloquée", () => {
  it("BUSINESS avec 25 actifs puis politique PRO", () => {
    expect(allowed("BUSINESS", 25)).toBe(true)
    const check = canCreateCustomerSubscription({ plan: "PRO", activeCount: 25 })
    expect(check).toMatchObject({ allowed: false, activeCount: 25, maxActive: 10, remaining: 0 })
    const usage = getCustomerSubscriptionUsage({ plan: "PRO", activeCount: 25 })
    expect(usage).toMatchObject({ activeCount: 25, limitReached: true, overLimit: true })
    // Création redevenue possible quand le nombre d'actifs repasse sous la limite.
    expect(allowed("PRO", 9)).toBe(true)
  })

  it("FREE avec 8 actifs après downgrade", () => {
    expect(canCreateCustomerSubscription({ plan: "FREE", activeCount: 8 })).toMatchObject({
      allowed: false,
      activeCount: 8,
      reason: "LIMIT_REACHED",
    })
  })
})

describe("getCustomerSubscriptionUsage", () => {
  it("valeurs structurées pour l'affichage", () => {
    expect(getCustomerSubscriptionUsage({ plan: "FREE", activeCount: 1 })).toEqual({
      activeCount: 1,
      maxActive: 2,
      unlimited: false,
      remaining: 1,
      limitReached: false,
      overLimit: false,
      platformFeeBps: 700,
    })
    expect(getCustomerSubscriptionUsage({ plan: "PRO", activeCount: 7 })).toMatchObject({
      maxActive: 10,
      remaining: 3,
      platformFeeBps: 300,
    })
    for (const plan of ["BUSINESS", "ENTERPRISE"] as const) {
      expect(getCustomerSubscriptionUsage({ plan, activeCount: 24 })).toMatchObject({
        activeCount: 24,
        maxActive: null,
        unlimited: true,
        remaining: null,
        limitReached: false,
        platformFeeBps: 0,
      })
    }
  })
})
