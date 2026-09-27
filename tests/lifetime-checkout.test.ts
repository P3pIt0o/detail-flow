import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type Stripe from "stripe"
import {
  LIFETIME_BILLING_WEBHOOK_EVENTS,
  LIFETIME_SINGLE_AMOUNT_CENTS,
  LifetimeCheckoutError,
  assertLifetimePurchaseRole,
  buildLifetimeSingleCheckoutParams,
  checkoutExpiresBeforeReservation,
  describeLifetimeReturnState,
  parseLifetimeSessionRefs,
  resolveLifetimeSinglePriceId,
  validatePaidLifetimeSession,
  type AllocationSnapshot,
} from "@/lib/billing/lifetime-checkout-core"
import { LIFETIME_CHECKOUT_TTL_MINUTES, LIFETIME_RESERVATION_TTL_MINUTES } from "@/lib/billing/lifetime"

/** LOT S3A — règles pures du Checkout Lifetime comptant. Aucun réseau. */

const PRICE = "price_single_test"
const NOW = new Date("2026-09-27T10:00:00Z")
const RESERVATION_END = new Date(NOW.getTime() + LIFETIME_RESERVATION_TTL_MINUTES * 60_000)

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof LifetimeCheckoutError ? e.code : `OTHER:${(e as Error).message}`
  }
  return "OK"
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    currency: "eur",
    amount_total: 129000,
    client_reference_id: "7",
    payment_intent: "pi_test_1",
    metadata: { app: "detailflow", billing_type: "lifetime", payment_plan: "single", company_id: "7", allocation_id: "3" },
    ...overrides,
  } as Stripe.Checkout.Session
}

const ALLOCATION: AllocationSnapshot = {
  id: 3,
  companyId: 7,
  status: "RESERVED",
  paymentPlan: "single",
  stripeCheckoutSessionId: "cs_test_1",
}

function lineItems(priceId = PRICE, quantity = 1): Stripe.LineItem[] {
  return [{ price: { id: priceId }, quantity } as Stripe.LineItem]
}

function validate(o: {
  session?: Stripe.Checkout.Session
  items?: Stripe.LineItem[]
  allocation?: AllocationSnapshot | null
} = {}) {
  return validatePaidLifetimeSession({
    session: o.session ?? session(),
    lineItems: o.items ?? lineItems(),
    allocation: o.allocation === undefined ? ALLOCATION : o.allocation,
    expectedPriceId: PRICE,
  })
}

describe("Autorisation", () => {
  it("OWNER autorisé, super-admin autorisé", () => {
    expect(code(() => assertLifetimePurchaseRole("OWNER", false))).toBe("OK")
    expect(code(() => assertLifetimePurchaseRole("EMPLOYEE", true))).toBe("OK")
  })
  it("ADMIN et EMPLOYEE refusés", () => {
    expect(code(() => assertLifetimePurchaseRole("ADMIN", false))).toBe("FORBIDDEN_ROLE")
    expect(code(() => assertLifetimePurchaseRole("EMPLOYEE", false))).toBe("FORBIDDEN_ROLE")
  })
})

describe("Price env — fail closed", () => {
  it("absent / vide → refus", () => {
    expect(code(() => resolveLifetimeSinglePriceId({}))).toBe("PRICE_NOT_CONFIGURED")
    expect(code(() => resolveLifetimeSinglePriceId({ STRIPE_PRICE_LIFETIME_SINGLE: "  " }))).toBe("PRICE_NOT_CONFIGURED")
  })
  it("format invalide → refus", () => {
    for (const v of ["prod_x", "sk_test_x", "abc"]) {
      expect(code(() => resolveLifetimeSinglePriceId({ STRIPE_PRICE_LIFETIME_SINGLE: v }))).toBe("PRICE_NOT_CONFIGURED")
    }
  })
  it("price_ valide ; le Price installment n'est jamais lu", () => {
    expect(resolveLifetimeSinglePriceId({ STRIPE_PRICE_LIFETIME_SINGLE: PRICE })).toBe(PRICE)
    expect(
      code(() => resolveLifetimeSinglePriceId({ STRIPE_PRICE_LIFETIME_INSTALLMENT: "price_installment" })),
    ).toBe("PRICE_NOT_CONFIGURED")
  })
})

describe("Paramètres Checkout", () => {
  const params = buildLifetimeSingleCheckoutParams({
    companyId: 7,
    allocationId: 3,
    priceId: PRICE,
    successUrl: "https://x/retour?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://x/retour?annule=1",
    reservationExpiresAt: RESERVATION_END,
    now: NOW,
  })

  it("mode payment, card, quantity 1, Price de l'env", () => {
    expect(params.mode).toBe("payment")
    expect(params.payment_method_types).toEqual(["card"])
    expect(params.line_items).toEqual([{ price: PRICE, quantity: 1 }])
  })
  it("pas de Tax, pas de promo, pas d'application fee, pas de Connect", () => {
    expect(params.automatic_tax).toEqual({ enabled: false })
    expect(params.allow_promotion_codes).toBe(false)
    expect(params.discounts).toBeUndefined()
    expect(JSON.stringify(params)).not.toContain("application_fee")
    expect(JSON.stringify(params)).not.toContain("transfer_data")
  })
  it("metadata session + payment_intent_data générées serveur", () => {
    const expected = { app: "detailflow", billing_type: "lifetime", payment_plan: "single", company_id: "7", allocation_id: "3" }
    expect(params.metadata).toEqual(expected)
    expect(params.payment_intent_data?.metadata).toEqual(expected)
    expect(params.client_reference_id).toBe("7")
  })
  it("Checkout ≈ 30 min, réservation 60 min, Checkout expire avant la réservation", () => {
    expect(LIFETIME_CHECKOUT_TTL_MINUTES).toBe(30)
    expect(LIFETIME_RESERVATION_TTL_MINUTES).toBe(60)
    const delta = (params.expires_at as number) - NOW.getTime() / 1000
    expect(delta).toBeGreaterThanOrEqual(30 * 60)
    expect(delta).toBeLessThan(32 * 60)
    expect(checkoutExpiresBeforeReservation()).toBe(true)
  })
  it("montant source = 129000 (lib/billing/lifetime.ts)", () => {
    expect(LIFETIME_SINGLE_AMOUNT_CENTS).toBe(129000)
  })
  it("réservation expirant avant le Checkout → refus", () => {
    expect(
      code(() =>
        buildLifetimeSingleCheckoutParams({
          companyId: 7,
          allocationId: 3,
          priceId: PRICE,
          successUrl: "s",
          cancelUrl: "c",
          reservationExpiresAt: new Date(NOW.getTime() + 20 * 60_000),
          now: NOW,
        }),
      ),
    ).toBe("CHECKOUT_CREATE_FAILED")
  })
})

describe("Validation avant activation", () => {
  it("session conforme → acceptée", () => {
    expect(validate()).toEqual({
      companyId: 7,
      allocationId: 3,
      checkoutSessionId: "cs_test_1",
      paymentIntentId: "pi_test_1",
      paidAmountCents: 129000,
    })
  })

  const rejects: Array<[string, Parameters<typeof validate>[0]]> = [
    ["non payée", { session: session({ payment_status: "unpaid" }) }],
    ["mode subscription", { session: session({ mode: "subscription" }) }],
    ["mauvaise devise", { session: session({ currency: "usd" }) }],
    ["mauvais montant", { session: session({ amount_total: 69000 }) }],
    ["mauvais Price", { items: lineItems("price_other") }],
    ["quantité 2", { items: lineItems(PRICE, 2) }],
    ["aucun line item", { items: [] }],
    ["metadata app", { session: session({ metadata: { ...session().metadata, app: "other" } }) }],
    ["payment_plan split", { session: session({ metadata: { ...session().metadata, payment_plan: "split_2x" } }) }],
    ["company_id non numérique", { session: session({ metadata: { ...session().metadata, company_id: "7abc" } }) }],
    ["mauvais company_id", { session: session({ client_reference_id: null, metadata: { ...session().metadata, company_id: "8" } }) }],
    ["mauvais allocation_id", { session: session({ metadata: { ...session().metadata, allocation_id: "4" } }) }],
    ["client_reference_id incohérent", { session: session({ client_reference_id: "9" }) }],
    ["allocation absente", { allocation: null }],
    ["allocation autre tenant", { allocation: { ...ALLOCATION, companyId: 8 } }],
    ["allocation plan split", { allocation: { ...ALLOCATION, paymentPlan: "split_2x" } }],
    ["session non rattachée", { allocation: { ...ALLOCATION, stripeCheckoutSessionId: "cs_other" } }],
  ]
  for (const [label, input] of rejects) {
    it(`${label} → rejet`, () => {
      expect(code(() => validate(input))).toBe("SESSION_VALIDATION_FAILED")
    })
  }
})

describe("Divers", () => {
  it("événements Billing gérés", () => {
    expect([...LIFETIME_BILLING_WEBHOOK_EVENTS]).toEqual([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
    ])
  })
  it("parseLifetimeSessionRefs refuse les metadata incomplètes", () => {
    expect(parseLifetimeSessionRefs({ metadata: { app: "detailflow" } })).toBeNull()
    expect(parseLifetimeSessionRefs(session())).toEqual({ companyId: 7, allocationId: 3 })
  })
  it("page de retour : affichage seul", () => {
    expect(describeLifetimeReturnState({ status: "ACTIVE" }, false)).toBe("active")
    expect(describeLifetimeReturnState({ status: "RESERVED" }, false)).toBe("pending")
    expect(describeLifetimeReturnState({ status: "RELEASED" }, false)).toBe("failed")
    expect(describeLifetimeReturnState(null, true)).toBe("cancelled")
    expect(describeLifetimeReturnState(null, false)).toBe("unknown")
  })
  it("la page de retour n'importe aucune fonction d'activation", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/admin/(dashboard)/abonnement/lifetime/retour/page.tsx"),
      "utf8",
    )
    expect(src).not.toMatch(/activateLifetimeSlot|releaseLifetimeReservation|reserveLifetimeSlot|getStripe/)
  })
  it("le webhook Connect n'est pas utilisé par le Billing et le 2 × 690 n'est jamais lu", () => {
    for (const file of ["lib/billing/lifetime-checkout.ts", "lib/billing/lifetime-webhook.ts", "app/api/billing/webhook/route.ts"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      expect(src).not.toContain("STRIPE_PRICE_LIFETIME_INSTALLMENT")
      expect(src).not.toMatch(/process\.env\.STRIPE_WEBHOOK_SECRET\b/)
    }
  })
})

/* ---------------- Correctif S3A : validation runtime du Price ---------------- */

import { validateLifetimeSinglePrice } from "@/lib/billing/lifetime-checkout-core"

describe("validateLifetimeSinglePrice (Price Stripe réel, Product expandé)", () => {
  const good = (o: Record<string, unknown> = {}, p: Record<string, unknown> = {}) =>
    ({
      id: PRICE,
      object: "price",
      active: true,
      livemode: false,
      currency: "eur",
      unit_amount: 129000,
      type: "one_time",
      recurring: null,
      lookup_key: "detailflow_lifetime_single",
      metadata: { app: "detailflow", billing_type: "lifetime", payment_plan: "single", installment_count: "1" },
      product: {
        id: "prod_x",
        object: "product",
        active: true,
        livemode: false,
        name: "DetailFlow Lifetime",
        metadata: { app: "detailflow", billing_type: "lifetime", offer: "lifetime" },
        ...p,
      },
      ...o,
    }) as unknown as Stripe.Price
  const ok = (price: Stripe.Price, key = "sk_test_x") => {
    try {
      validateLifetimeSinglePrice(price, PRICE, key)
      return true
    } catch {
      return false
    }
  }

  it("Price conforme accepté (TEST et rk_test_)", () => {
    expect(ok(good())).toBe(true)
    expect(ok(good(), "rk_test_x")).toBe(true)
    expect(ok(good({ livemode: true }, { livemode: true }), "sk_live_x")).toBe(true)
  })

  it.each([
    ["mauvais montant", good({ unit_amount: 129001 })],
    ["mauvaise currency", good({ currency: "usd" })],
    ["recurring", good({ type: "recurring", recurring: { interval: "month" } })],
    ["mauvais lookup_key", good({ lookup_key: "other" })],
    ["metadata installment_count", good({ metadata: { app: "detailflow", billing_type: "lifetime", payment_plan: "single", installment_count: "2" } })],
    ["Price inactif", good({ active: false })],
    ["id ≠ env", good({ id: "price_other" })],
    ["Product non expandé", good({ product: "prod_x" })],
    ["Product supprimé", good({ product: { id: "prod_x", object: "product", deleted: true } })],
    ["Product inactif", good({}, { active: false })],
    ["mauvais nom Product", good({}, { name: "DetailFlow" })],
    ["metadata Product", good({}, { metadata: { app: "detailflow", billing_type: "lifetime", offer: "founder" } })],
    ["Price LIVE / clé TEST", good({ livemode: true }, { livemode: true })],
  ])("%s → refusé", (_label, price) => {
    expect(ok(price)).toBe(false)
  })

  it("Price TEST / clé LIVE → refusé ; clé absente ou pk_ → refusé", () => {
    expect(ok(good(), "sk_live_x")).toBe(false)
    expect(ok(good(), "")).toBe(false)
    expect(ok(good(), "pk_test_x")).toBe(false)
  })

  it("service : validation du Price placée AVANT toute lecture/réservation d'allocation", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/billing/lifetime-checkout.ts"), "utf8")
    const body = src.slice(src.indexOf("export async function createLifetimeSingleCheckout"))
    const validate = body.indexOf("assertLifetimeSinglePriceUsable(")
    expect(validate).toBeGreaterThan(0)
    expect(validate).toBeLessThan(body.indexOf("reuseOrCleanExisting("))
    expect(validate).toBeLessThan(body.indexOf("reserveLifetimeSlot("))
  })
})
