import { describe, it, expect } from "vitest"
import type Stripe from "stripe"
import { detectStripeMode, StripeSetupError } from "@/lib/billing/stripe-setup"
import { LIFETIME_PAYMENT_PLANS } from "@/lib/billing/lifetime"
import {
  LIFETIME_STRIPE_PRICES,
  LIFETIME_STRIPE_PRODUCT,
  assertEnvPriceIdConsistent,
  assertLifetimePriceMatches,
  assertLifetimeProductValid,
  assertStripeModeAllowed,
  readLifetimeEnvPriceIds,
  selectLifetimeProduct,
  type LifetimePriceKind,
} from "@/lib/billing/lifetime-stripe-setup"

/** LOT S2.5B — fixtures uniquement, aucun appel réseau Stripe. */

const PRODUCT_ID = "prod_lifetime"

function product(overrides: Partial<Stripe.Product> = {}): Stripe.Product {
  return {
    id: PRODUCT_ID,
    object: "product",
    active: true,
    name: "DetailFlow Lifetime",
    metadata: { app: "detailflow", billing_type: "lifetime", offer: "lifetime" },
    ...overrides,
  } as Stripe.Product
}

function price(kind: LifetimePriceKind, overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  const spec = LIFETIME_STRIPE_PRICES[kind]
  return {
    id: `price_${kind}`,
    object: "price",
    active: true,
    currency: "eur",
    unit_amount: spec.unitAmount,
    type: "one_time",
    recurring: null,
    product: PRODUCT_ID,
    lookup_key: spec.lookupKey,
    metadata: { ...spec.metadata },
    ...overrides,
  } as Stripe.Price
}

describe("spécification Lifetime Stripe", () => {
  it("montants issus de lib/billing/lifetime.ts", () => {
    expect(LIFETIME_STRIPE_PRICES.single.unitAmount).toBe(129000)
    expect(LIFETIME_STRIPE_PRICES.single.unitAmount).toBe(LIFETIME_PAYMENT_PLANS.single.totalCents)
    expect(LIFETIME_STRIPE_PRICES.installment.unitAmount).toBe(69000)
    expect(LIFETIME_STRIPE_PRICES.installment.unitAmount).toBe(LIFETIME_PAYMENT_PLANS.split_2x.installmentAmountCents)
    expect(LIFETIME_STRIPE_PRICES.installment.unitAmount).not.toBe(138000)
  })

  it("devise eur et lookup keys exactes", () => {
    expect(LIFETIME_STRIPE_PRICES.single.currency).toBe("eur")
    expect(LIFETIME_STRIPE_PRICES.installment.currency).toBe("eur")
    expect(LIFETIME_STRIPE_PRICES.single.lookupKey).toBe("detailflow_lifetime_single")
    expect(LIFETIME_STRIPE_PRICES.installment.lookupKey).toBe("detailflow_lifetime_installment")
    expect(LIFETIME_STRIPE_PRICES.single.envName).toBe("STRIPE_PRICE_LIFETIME_SINGLE")
    expect(LIFETIME_STRIPE_PRICES.installment.envName).toBe("STRIPE_PRICE_LIFETIME_INSTALLMENT")
  })

  it("metadata Product (jamais FOUNDER)", () => {
    expect(LIFETIME_STRIPE_PRODUCT.name).toBe("DetailFlow Lifetime")
    expect(LIFETIME_STRIPE_PRODUCT.metadata).toEqual({ app: "detailflow", billing_type: "lifetime", offer: "lifetime" })
    expect(JSON.stringify(LIFETIME_STRIPE_PRODUCT)).not.toContain("FOUNDER")
  })

  it("metadata Prices", () => {
    expect(LIFETIME_STRIPE_PRICES.single.metadata).toEqual({
      app: "detailflow",
      billing_type: "lifetime",
      payment_plan: "single",
      installment_count: "1",
    })
    expect(LIFETIME_STRIPE_PRICES.installment.metadata).toEqual({
      app: "detailflow",
      billing_type: "lifetime",
      payment_plan: "split_2x",
      installment_count: "2",
    })
  })

  it("Prices one-time conformes acceptés", () => {
    expect(() => assertLifetimePriceMatches(price("single"), "single", PRODUCT_ID)).not.toThrow()
    expect(() => assertLifetimePriceMatches(price("installment"), "installment", PRODUCT_ID)).not.toThrow()
  })
})

describe("mode Stripe TEST/LIVE", () => {
  it("TEST et LIVE reconnus", () => {
    expect(detectStripeMode("sk_test_x")).toBe("TEST")
    expect(detectStripeMode("rk_test_x")).toBe("TEST")
    expect(detectStripeMode("sk_live_x")).toBe("LIVE")
    expect(detectStripeMode("rk_live_x")).toBe("LIVE")
  })

  it("pk_ et clé invalide refusées", () => {
    expect(() => detectStripeMode("pk_test_x")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("n'importe quoi")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("")).toThrow(StripeSetupError)
  })

  it("LIVE sans --confirm-live refusé ; avec flag / TEST autorisés", () => {
    expect(() => assertStripeModeAllowed("LIVE", ["node", "script"])).toThrow(/--confirm-live/)
    expect(() => assertStripeModeAllowed("LIVE", ["node", "script", "--confirm-live"])).not.toThrow()
    expect(() => assertStripeModeAllowed("TEST", ["node", "script"])).not.toThrow()
  })
})

describe("Product Lifetime", () => {
  it("0 → null, 1 → réutilisé", () => {
    expect(selectLifetimeProduct([])).toBeNull()
    expect(selectLifetimeProduct([product()])?.id).toBe(PRODUCT_ID)
  })

  it("doublon détecté → STOP", () => {
    expect(() => selectLifetimeProduct([product({ id: "prod_a" }), product({ id: "prod_b" })])).toThrow(/doublons/)
  })

  it("Product incohérent → STOP", () => {
    expect(() => assertLifetimeProductValid(product({ name: "Autre" }))).toThrow(StripeSetupError)
    expect(() => assertLifetimeProductValid(product({ active: false }))).toThrow(StripeSetupError)
  })
})

describe("Price Lifetime incompatible → STOP", () => {
  const cases: Array<[string, Partial<Stripe.Price>]> = [
    ["mauvais montant", { unit_amount: 138000 }],
    ["mauvaise currency", { currency: "usd" }],
    ["recurring", { type: "recurring", recurring: { interval: "month" } as Stripe.Price.Recurring }],
    ["mauvais Product", { product: "prod_other" }],
    ["mauvais lookup_key", { lookup_key: "detailflow_lifetime_other" }],
    ["mauvaise metadata", { metadata: { app: "detailflow", billing_type: "subscription", payment_plan: "split_2x", installment_count: "2" } }],
    ["inactif", { active: false }],
  ]
  for (const [label, overrides] of cases) {
    it(label, () => {
      expect(() => assertLifetimePriceMatches(price("installment", overrides), "installment", PRODUCT_ID)).toThrow(
        /ne correspond pas/,
      )
    })
  }

  it("single avec metadata installment_count incorrect → STOP", () => {
    expect(() =>
      assertLifetimePriceMatches(
        price("single", { metadata: { ...LIFETIME_STRIPE_PRICES.single.metadata, installment_count: "2" } }),
        "single",
        PRODUCT_ID,
      ),
    ).toThrow(StripeSetupError)
  })
})

describe("env Price IDs", () => {
  it("absents → null", () => {
    expect(readLifetimeEnvPriceIds({})).toEqual({ single: null, installment: null })
  })

  it("price_ valides acceptés", () => {
    expect(
      readLifetimeEnvPriceIds({ STRIPE_PRICE_LIFETIME_SINGLE: "price_a", STRIPE_PRICE_LIFETIME_INSTALLMENT: "price_b" }),
    ).toEqual({ single: "price_a", installment: "price_b" })
  })

  it("format invalide → STOP", () => {
    expect(() => readLifetimeEnvPriceIds({ STRIPE_PRICE_LIFETIME_SINGLE: "prod_x" })).toThrow(StripeSetupError)
    expect(() => readLifetimeEnvPriceIds({ STRIPE_PRICE_LIFETIME_INSTALLMENT: "sk_test_x" })).toThrow(StripeSetupError)
  })

  it("mêmes Price IDs dans les deux variables → STOP", () => {
    expect(() =>
      readLifetimeEnvPriceIds({ STRIPE_PRICE_LIFETIME_SINGLE: "price_same", STRIPE_PRICE_LIFETIME_INSTALLMENT: "price_same" }),
    ).toThrow(/même Price ID/)
  })

  it("env ≠ Price du lookup_key → STOP", () => {
    expect(() => assertEnvPriceIdConsistent("single", "price_env", "price_lookup")).toThrow(StripeSetupError)
    expect(() => assertEnvPriceIdConsistent("single", "price_same", "price_same")).not.toThrow()
    expect(() => assertEnvPriceIdConsistent("single", null, "price_lookup")).not.toThrow()
  })
})
