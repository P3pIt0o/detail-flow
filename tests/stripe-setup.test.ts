import { describe, it, expect } from "vitest"
import type Stripe from "stripe"
import {
  StripeSetupError,
  detectStripeMode,
  selectProductForPlan,
  assertPriceMatchesConfig,
  expectedPriceShape,
} from "@/lib/billing/stripe-setup"
import type { BillingLicensePlan } from "@/lib/billing/config"

/**
 * LOT S2.1 — fonctions PURES extraites du script de setup Stripe.
 * Aucun appel réseau : les objets Stripe.Product / Stripe.Price sont des
 * fixtures. Aucune clé Stripe réelle, aucun secret.
 */

/* -------------------------------------------------------------------------- */
/*  Détection stricte du mode (fail-closed)                                    */
/* -------------------------------------------------------------------------- */

describe("detectStripeMode — fail-closed", () => {
  it("clés TEST reconnues → TEST", () => {
    expect(detectStripeMode("sk_test_abc123")).toBe("TEST")
    expect(detectStripeMode("rk_test_abc123")).toBe("TEST")
  })

  it("clés LIVE reconnues → LIVE", () => {
    expect(detectStripeMode("sk_live_abc123")).toBe("LIVE")
    expect(detectStripeMode("rk_live_abc123")).toBe("LIVE")
  })

  it("clé publiable, format inconnu, vide ou nul → REFUS", () => {
    expect(() => detectStripeMode("pk_test_abc123")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("pk_live_abc123")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("garbage")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("sk_test_")).toThrow(StripeSetupError)
    expect(() => detectStripeMode("")).toThrow(StripeSetupError)
    expect(() => detectStripeMode(undefined)).toThrow(StripeSetupError)
    expect(() => detectStripeMode(null)).toThrow(StripeSetupError)
  })

  it("ne suppose jamais TEST par défaut sur une clé inconnue", () => {
    expect(() => detectStripeMode("whatever_key")).toThrow(/invalide ou mode impossible/)
  })
})

/* -------------------------------------------------------------------------- */
/*  Sélection du Product (détection de doublons)                               */
/* -------------------------------------------------------------------------- */

function makeProduct(plan: BillingLicensePlan, overrides: Partial<Stripe.Product> = {}): Stripe.Product {
  return {
    id: `prod_${plan}`,
    active: true,
    metadata: { app: "detailflow", billing_type: "subscription", license_plan: plan },
    ...overrides,
  } as unknown as Stripe.Product
}

describe("selectProductForPlan — doublons fail-closed", () => {
  it("aucune correspondance → null (l'appelant créera le Product)", () => {
    expect(selectProductForPlan([], "BUSINESS")).toBeNull()
  })

  it("une seule correspondance → ce Product", () => {
    const p = makeProduct("BUSINESS")
    expect(selectProductForPlan([p], "BUSINESS")?.id).toBe("prod_BUSINESS")
  })

  it("ignore un Product au mauvais plan ou aux mauvaises metadata", () => {
    const wrongPlan = makeProduct("PRO")
    const wrongMeta = makeProduct("BUSINESS", { metadata: { app: "other" } as unknown as Stripe.Metadata })
    expect(selectProductForPlan([wrongPlan, wrongMeta], "BUSINESS")).toBeNull()
  })

  it("plusieurs correspondances → erreur (jamais le premier arbitrairement)", () => {
    const a = makeProduct("BUSINESS", { id: "prod_a" })
    const b = makeProduct("BUSINESS", { id: "prod_b" })
    expect(() => selectProductForPlan([a, b], "BUSINESS")).toThrow(StripeSetupError)
  })
})

/* -------------------------------------------------------------------------- */
/*  Validation d'un Price existant                                             */
/* -------------------------------------------------------------------------- */

const PRODUCT_ID = "prod_BUSINESS"

function makePrice(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  const shape = expectedPriceShape("BUSINESS", PRODUCT_ID)
  return {
    id: "price_business",
    active: true,
    currency: shape.currency,
    unit_amount: shape.unitAmount,
    recurring: { interval: shape.interval },
    product: shape.productId,
    lookup_key: shape.lookupKey,
    metadata: { app: "detailflow", billing_type: "subscription", license_plan: "BUSINESS" },
    ...overrides,
  } as unknown as Stripe.Price
}

describe("assertPriceMatchesConfig — conformité exacte", () => {
  it("Price parfaitement conforme → accepté", () => {
    expect(() => assertPriceMatchesConfig(makePrice(), "BUSINESS", PRODUCT_ID)).not.toThrow()
  })

  it("montant incorrect → rejet", () => {
    expect(() => assertPriceMatchesConfig(makePrice({ unit_amount: 1990 }), "BUSINESS", PRODUCT_ID)).toThrow(
      StripeSetupError,
    )
  })

  it("mauvaise devise → rejet", () => {
    expect(() => assertPriceMatchesConfig(makePrice({ currency: "usd" }), "BUSINESS", PRODUCT_ID)).toThrow(
      StripeSetupError,
    )
  })

  it("interval incorrect → rejet", () => {
    expect(() =>
      assertPriceMatchesConfig(
        makePrice({ recurring: { interval: "year" } as unknown as Stripe.Price.Recurring }),
        "BUSINESS",
        PRODUCT_ID,
      ),
    ).toThrow(StripeSetupError)
  })

  it("mauvais Product associé → rejet", () => {
    expect(() => assertPriceMatchesConfig(makePrice({ product: "prod_autre" }), "BUSINESS", PRODUCT_ID)).toThrow(
      StripeSetupError,
    )
  })

  it("mauvais lookup_key → rejet", () => {
    expect(() => assertPriceMatchesConfig(makePrice({ lookup_key: "autre_key" }), "BUSINESS", PRODUCT_ID)).toThrow(
      StripeSetupError,
    )
  })

  it("metadata incorrecte → rejet", () => {
    expect(() =>
      assertPriceMatchesConfig(
        makePrice({ metadata: { app: "detailflow", billing_type: "subscription", license_plan: "PRO" } as Stripe.Metadata }),
        "BUSINESS",
        PRODUCT_ID,
      ),
    ).toThrow(StripeSetupError)
  })

  it("Price inactif → rejet", () => {
    expect(() => assertPriceMatchesConfig(makePrice({ active: false }), "BUSINESS", PRODUCT_ID)).toThrow(
      StripeSetupError,
    )
  })
})
