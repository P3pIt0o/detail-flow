import { describe, it, expect } from "vitest"
import {
  BILLING_PLANS,
  PAID_BILLING_PLANS,
  REQUIRED_STRIPE_PRICE_ENVS,
  STRIPE_PRICE_ENV,
  BillingConfigError,
  getBillingPlanConfig,
  getStripePriceEnvForPlan,
  isBillingLicensePlan,
  resolveStripePriceIdForPlan,
  resolvePlanForStripePriceId,
  assertBillingPricesConfigured,
} from "@/lib/billing/config"

/**
 * LOT S2 — vérifie UNIQUEMENT la couche de configuration Stripe Billing
 * (mapping plan ↔ prix ↔ Price ID) et ses resolvers serveur. Aucun appel
 * Stripe, aucun Checkout, aucun webhook, aucune donnée Stripe Connect.
 *
 * Les resolvers acceptent un `env` injecté : les tests n'écrivent jamais dans
 * process.env réel et n'exposent aucun secret.
 */

const FAKE_ENV = {
  STRIPE_PRICE_INDEPENDANT_MONTHLY: "price_indep_test",
  STRIPE_PRICE_PERFORMANCE_MONTHLY: "price_perf_test",
  STRIPE_PRICE_EQUIPE_MONTHLY: "price_equipe_test",
}

describe("Config Billing — montants & noms commerciaux", () => {
  it("FREE → Essentiel, 0 €, aucun Price", () => {
    const c = getBillingPlanConfig("FREE")
    expect(c).not.toBeNull()
    expect(c?.commercialName).toBe("Essentiel")
    expect(c?.monthlyPriceCents).toBe(0)
    expect(c?.isPaid).toBe(false)
    expect(c?.interval).toBeNull()
    expect(c?.stripePriceEnv).toBeNull()
    expect(c?.lookupKey).toBeNull()
  })

  it("PRO → Indépendant, 1990, mensuel", () => {
    const c = getBillingPlanConfig("PRO")
    expect(c?.commercialName).toBe("Indépendant")
    expect(c?.monthlyPriceCents).toBe(1990)
    expect(c?.isPaid).toBe(true)
    expect(c?.interval).toBe("month")
    expect(c?.currency).toBe("eur")
    expect(c?.stripePriceEnv).toBe("STRIPE_PRICE_INDEPENDANT_MONTHLY")
    expect(c?.lookupKey).toBe("detailflow_independant_monthly")
  })

  it("BUSINESS → Performance, 3490, mensuel", () => {
    const c = getBillingPlanConfig("BUSINESS")
    expect(c?.commercialName).toBe("Performance")
    expect(c?.monthlyPriceCents).toBe(3490)
    expect(c?.stripePriceEnv).toBe("STRIPE_PRICE_PERFORMANCE_MONTHLY")
    expect(c?.lookupKey).toBe("detailflow_performance_monthly")
  })

  it("ENTERPRISE → Équipe, 5990, mensuel", () => {
    const c = getBillingPlanConfig("ENTERPRISE")
    expect(c?.commercialName).toBe("Équipe")
    expect(c?.monthlyPriceCents).toBe(5990)
    expect(c?.stripePriceEnv).toBe("STRIPE_PRICE_EQUIPE_MONTHLY")
    expect(c?.lookupKey).toBe("detailflow_equipe_monthly")
  })

  it("ESSENTIAL et FOUNDER n'ont pas de config d'abonnement (null, pas de fallback)", () => {
    expect(getBillingPlanConfig("ESSENTIAL")).toBeNull()
    expect(getBillingPlanConfig("FOUNDER")).toBeNull()
    expect(isBillingLicensePlan("ESSENTIAL")).toBe(false)
    expect(isBillingLicensePlan("FOUNDER")).toBe(false)
  })

  it("seuls PRO/BUSINESS/ENTERPRISE sont payants", () => {
    expect([...PAID_BILLING_PLANS]).toEqual(["PRO", "BUSINESS", "ENTERPRISE"])
    for (const plan of PAID_BILLING_PLANS) {
      expect(BILLING_PLANS[plan].isPaid).toBe(true)
    }
  })
})

describe("Resolver PLAN → PRICE ID", () => {
  it("résout chaque plan payant vers son Price ID depuis l'environnement injecté", () => {
    expect(resolveStripePriceIdForPlan("PRO", FAKE_ENV)).toBe("price_indep_test")
    expect(resolveStripePriceIdForPlan("BUSINESS", FAKE_ENV)).toBe("price_perf_test")
    expect(resolveStripePriceIdForPlan("ENTERPRISE", FAKE_ENV)).toBe("price_equipe_test")
  })

  it("FREE n'a aucun Price → erreur explicite (jamais de fallback)", () => {
    expect(() => resolveStripePriceIdForPlan("FREE", FAKE_ENV)).toThrow(BillingConfigError)
  })

  it("plan inconnu / sans abonnement → erreur (jamais un Price arbitraire)", () => {
    expect(() => resolveStripePriceIdForPlan("FOUNDER", FAKE_ENV)).toThrow(BillingConfigError)
    // @ts-expect-error test volontaire d'une valeur hors type
    expect(() => resolveStripePriceIdForPlan("HACK", FAKE_ENV)).toThrow(BillingConfigError)
  })

  it("variable manquante → erreur explicite mentionnant la variable", () => {
    expect(() => resolveStripePriceIdForPlan("PRO", {})).toThrow(/STRIPE_PRICE_INDEPENDANT_MONTHLY/)
  })

  it("ne confond jamais les plans (Performance n'utilise pas le Price Indépendant)", () => {
    const onlyIndep = { STRIPE_PRICE_INDEPENDANT_MONTHLY: "price_indep_test" }
    // BUSINESS doit échouer plutôt que retomber sur le Price d'Indépendant.
    expect(() => resolveStripePriceIdForPlan("BUSINESS", onlyIndep)).toThrow(BillingConfigError)
  })
})

describe("Resolver inverse PRICE ID → PLAN", () => {
  it("mappe chaque Price ID connu vers son plan", () => {
    expect(resolvePlanForStripePriceId("price_indep_test", FAKE_ENV)).toBe("PRO")
    expect(resolvePlanForStripePriceId("price_perf_test", FAKE_ENV)).toBe("BUSINESS")
    expect(resolvePlanForStripePriceId("price_equipe_test", FAKE_ENV)).toBe("ENTERPRISE")
  })

  it("Price ID inconnu → erreur (jamais FREE ni BUSINESS par défaut)", () => {
    expect(() => resolvePlanForStripePriceId("price_unknown", FAKE_ENV)).toThrow(BillingConfigError)
  })

  it("Price ID vide → erreur", () => {
    expect(() => resolvePlanForStripePriceId("", FAKE_ENV)).toThrow(BillingConfigError)
  })
})

describe("Validation stricte de configuration", () => {
  it("assertBillingPricesConfigured passe quand les trois variables existent", () => {
    expect(() => assertBillingPricesConfigured(FAKE_ENV)).not.toThrow()
  })

  it("lève une erreur listant les variables manquantes", () => {
    expect(() => assertBillingPricesConfigured({ STRIPE_PRICE_INDEPENDANT_MONTHLY: "price_x" })).toThrow(
      /STRIPE_PRICE_PERFORMANCE_MONTHLY.*STRIPE_PRICE_EQUIPE_MONTHLY|STRIPE_PRICE_EQUIPE_MONTHLY/,
    )
  })

  it("REQUIRED_STRIPE_PRICE_ENVS couvre exactement les trois variables payantes", () => {
    expect([...REQUIRED_STRIPE_PRICE_ENVS]).toEqual([
      "STRIPE_PRICE_INDEPENDANT_MONTHLY",
      "STRIPE_PRICE_PERFORMANCE_MONTHLY",
      "STRIPE_PRICE_EQUIPE_MONTHLY",
    ])
  })
})

describe("Séparation Billing / Connect & sécurité client", () => {
  it("aucune variable Price n'est exposée au client (pas de préfixe NEXT_PUBLIC_)", () => {
    for (const name of Object.values(STRIPE_PRICE_ENV)) {
      expect(name.startsWith("NEXT_PUBLIC_")).toBe(false)
    }
  })

  it("la config Billing ne référence aucune donnée Stripe Connect", () => {
    const serialized = JSON.stringify(BILLING_PLANS)
    for (const forbidden of ["stripeAccountId", "application_fee", "acct_", "connect"]) {
      expect(serialized.includes(forbidden)).toBe(false)
    }
  })
})
