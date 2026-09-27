import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  LIFETIME_MAX_LICENSES,
  LIFETIME_LICENSE_PLAN,
  LIFETIME_BILLING_MODE,
  LIFETIME_PLATFORM_FEE_BPS,
  LIFETIME_WELCOME_SMS,
  LIFETIME_RESERVATION_TTL_MINUTES,
  LIFETIME_CURRENCY,
  LIFETIME_INVENTORY_LOCK_KEY,
  LIFETIME_PAYMENT_PLANS,
  LifetimeError,
  SUBSCRIPTION_CONVERSION_UNSUPPORTED_MESSAGE,
  assertCompanyEligibleForLifetime,
  assertValidCompanyId,
  computeLifetimeAvailability,
  parseLifetimePaymentPlan,
} from "@/lib/billing/lifetime"
import { PLAN_MATRIX } from "@/lib/licensing/registry"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof LifetimeError ? e.code : "NOT_LIFETIME_ERROR"
  }
  return undefined
}

const eligibleCompany = {
  billingMode: "free",
  licensePlan: "FREE",
  stripeSubscriptionId: null,
  subscriptionStatus: null,
}

describe("Lifetime — configuration centrale", () => {
  it("plafond = 50, BUSINESS, lifetime, 0 bps, 20 SMS, TTL réservation 60 min, EUR", () => {
    expect(LIFETIME_MAX_LICENSES).toBe(50)
    expect(LIFETIME_LICENSE_PLAN).toBe("BUSINESS")
    expect(LIFETIME_BILLING_MODE).toBe("lifetime")
    expect(LIFETIME_PLATFORM_FEE_BPS).toBe(0)
    expect(LIFETIME_WELCOME_SMS).toBe(20)
    expect(LIFETIME_RESERVATION_TTL_MINUTES).toBe(60)
    expect(LIFETIME_CURRENCY).toBe("eur")
  })

  it("paiement comptant = 129000 cents en une fois", () => {
    expect(LIFETIME_PAYMENT_PLANS.single).toEqual({
      type: "single",
      installmentCount: 1,
      installmentAmountCents: 129000,
      totalCents: 129000,
    })
  })

  it("paiement fractionné = 2 × 69000 = 138000 cents", () => {
    const split = LIFETIME_PAYMENT_PLANS.split_2x
    expect(split.installmentCount).toBe(2)
    expect(split.installmentAmountCents).toBe(69000)
    expect(split.totalCents).toBe(138000)
    expect(split.installmentAmountCents * split.installmentCount).toBe(split.totalCents)
  })

  it("les plans de paiement sont figés (non mutables)", () => {
    expect(Object.isFrozen(LIFETIME_PAYMENT_PLANS)).toBe(true)
    expect(Object.isFrozen(LIFETIME_PAYMENT_PLANS.single)).toBe(true)
  })

  it("les droits proviennent de PLAN_MATRIX.BUSINESS, jamais ENTERPRISE/FOUNDER", () => {
    expect(PLAN_MATRIX[LIFETIME_LICENSE_PLAN]).toBe(PLAN_MATRIX.BUSINESS)
    expect(LIFETIME_LICENSE_PLAN).not.toBe("ENTERPRISE")
    expect(LIFETIME_LICENSE_PLAN).not.toBe("FOUNDER")
  })
})

describe("Lifetime — validation", () => {
  it("paymentPlan connu accepté, inconnu rejeté", () => {
    expect(parseLifetimePaymentPlan("single").totalCents).toBe(129000)
    expect(parseLifetimePaymentPlan("split_2x").totalCents).toBe(138000)
    for (const bad of ["split_3x", "SINGLE", "", null, undefined, 129000, {}]) {
      expect(errorCode(() => parseLifetimePaymentPlan(bad))).toBe("INVALID_PAYMENT_PLAN")
    }
  })

  it("companyId doit être un entier positif", () => {
    expect(errorCode(() => assertValidCompanyId(1))).toBeUndefined()
    for (const bad of [0, -1, 1.5, "1", null, Number.NaN]) {
      expect(errorCode(() => assertValidCompanyId(bad))).toBe("INVALID_COMPANY_ID")
    }
  })
})

describe("Lifetime — éligibilité (fail closed)", () => {
  it("tenant free sans abonnement : éligible", () => {
    expect(errorCode(() => assertCompanyEligibleForLifetime(eligibleCompany))).toBeUndefined()
  })

  it("stripeCustomerId n'est pas un critère (un Customer peut exister sans abonnement)", () => {
    expect(
      errorCode(() => assertCompanyEligibleForLifetime({ ...eligibleCompany, stripeCustomerId: "cus_x" } as never)),
    ).toBeUndefined()
  })

  it("abonnement Stripe existant => conversion refusée avec message explicite", () => {
    for (const company of [
      { ...eligibleCompany, stripeSubscriptionId: "sub_test" },
      { ...eligibleCompany, subscriptionStatus: "active" },
      { ...eligibleCompany, subscriptionStatus: "canceled" },
      { ...eligibleCompany, billingMode: "subscription" },
    ]) {
      try {
        assertCompanyEligibleForLifetime(company)
        throw new Error("should have thrown")
      } catch (e) {
        expect((e as LifetimeError).code).toBe("SUBSCRIPTION_CONVERSION_UNSUPPORTED")
        expect((e as LifetimeError).message).toBe(SUBSCRIPTION_CONVERSION_UNSUPPORTED_MESSAGE)
      }
    }
  })

  it("FOUNDER refusé, déjà Lifetime refusé", () => {
    expect(errorCode(() => assertCompanyEligibleForLifetime({ ...eligibleCompany, licensePlan: "FOUNDER" }))).toBe(
      "FOUNDER_NOT_ELIGIBLE",
    )
    expect(errorCode(() => assertCompanyEligibleForLifetime({ ...eligibleCompany, billingMode: "lifetime" }))).toBe(
      "ALREADY_LIFETIME",
    )
  })
})

describe("Lifetime — calcul de disponibilité", () => {
  it("used = active + reserved, remaining borné à 0", () => {
    expect(computeLifetimeAvailability(0, 0)).toEqual({
      max: 50, active: 0, reserved: 0, used: 0, remaining: 50, soldOut: false,
    })
    expect(computeLifetimeAvailability(40, 9)).toMatchObject({ used: 49, remaining: 1, soldOut: false })
    expect(computeLifetimeAvailability(45, 5)).toMatchObject({ used: 50, remaining: 0, soldOut: true })
    expect(computeLifetimeAvailability(60, 0)).toMatchObject({ remaining: 0, soldOut: true })
  })
})

describe("Lifetime — cohérence code / migration / isolation", () => {
  const sqlText = read("scripts/lifetime-license-allocation-migration.sql")

  it("la migration utilise le même plafond et la même clé de verrou", () => {
    expect(sqlText).toContain(`consumed >= ${LIFETIME_MAX_LICENSES}`)
    expect(sqlText).toContain(`hashtext('${LIFETIME_INVENTORY_LOCK_KEY}')`)
  })

  it("la migration est additive (aucun DROP / RENAME / UPDATE companies / ALTER companies)", () => {
    const code = sqlText.replace(/--.*$/gm, "")
    expect(code).not.toMatch(/\bDROP\b/i)
    expect(code).not.toMatch(/\bRENAME\b/i)
    expect(code).not.toMatch(/UPDATE\s+"?companies"?/i)
    expect(code).not.toMatch(/ALTER\s+TABLE\s+"?companies"?/i)
  })

  it("aucun appel Stripe, aucune clé Stripe dans les modules Lifetime", () => {
    for (const file of ["lib/billing/lifetime.ts", "lib/billing/lifetime-server.ts"]) {
      const src = read(file)
      expect(src).not.toMatch(/from\s+["']stripe["']/)
      expect(src).not.toContain("STRIPE_SECRET_KEY")
      expect(src).not.toContain("lib/payments")
    }
  })

  it("aucune détection Lifetime via licenseGeneration", () => {
    const src = read("lib/billing/lifetime-server.ts")
    expect(src).not.toContain("licenseGeneration")
    expect(src).not.toContain("LIFETIME_V1")
  })

  it("le service Lifetime est server-only et non importé côté client", () => {
    expect(read("lib/billing/lifetime-server.ts").startsWith('import "server-only"')).toBe(true)
  })
})
