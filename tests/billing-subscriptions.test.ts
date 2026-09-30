import { readFileSync } from "node:fs"
import { join } from "node:path"
import type Stripe from "stripe"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { handleBillingWebhook, type BillingWebhookDeps } from "@/lib/billing/lifetime-webhook"
import {
  LifetimeEnvironmentGuardError,
  assertLifetimePreviewTestEnvironment,
} from "@/lib/billing/lifetime-environment-guard"
import { LOYALTY_COUPONS } from "@/lib/billing/loyalty-coupons"
import { createSubscriptionCheckout, type SubscriptionCheckoutStripeClient } from "@/lib/billing/subscription-checkout"
import {
  PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_TRIAL_DAYS,
  SubscriptionError,
  buildSubscriptionCheckoutParams,
  describeSubscriptionReturnState,
  isPreviewPurchasableSubscriptionPlan,
  type CompanyBillingState,
  type SubscriptionPlan,
  type SubscriptionStatePatch,
  type SubscriptionStore,
} from "@/lib/billing/subscription-core"
import { createSubscriptionPortalSession } from "@/lib/billing/subscription-portal"
import { handleSubscriptionWebhookEvent, type SubscriptionWebhookDeps } from "@/lib/billing/subscription-webhook"
import { PLAN_MATRIX } from "@/lib/licensing/registry"

/* --------------------------------- Fixtures -------------------------------- */

const PRICE_IDS: Record<SubscriptionPlan, string> = {
  PRO: "price_pro_test",
  BUSINESS: "price_business_test",
  ENTERPRISE: "price_enterprise_test",
}
const AMOUNTS: Record<SubscriptionPlan, number> = { PRO: 1990, BUSINESS: 3490, ENTERPRISE: 5990 }
const LOOKUP: Record<SubscriptionPlan, string> = {
  PRO: "detailflow_independant_monthly",
  BUSINESS: "detailflow_performance_monthly",
  ENTERPRISE: "detailflow_equipe_monthly",
}

const ENV: Record<string, string> = {
  STRIPE_PRICE_INDEPENDANT_MONTHLY: PRICE_IDS.PRO,
  STRIPE_PRICE_PERFORMANCE_MONTHLY: PRICE_IDS.BUSINESS,
  STRIPE_PRICE_EQUIPE_MONTHLY: PRICE_IDS.ENTERPRISE,
  ...Object.fromEntries(LOYALTY_COUPONS.map((c) => [c.envName, c.couponId])),
}

function priceFor(plan: SubscriptionPlan, overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  const meta = { app: "detailflow", billing_type: "subscription", license_plan: plan }
  return {
    id: PRICE_IDS[plan],
    object: "price",
    active: true,
    type: "recurring",
    currency: "eur",
    unit_amount: AMOUNTS[plan],
    lookup_key: LOOKUP[plan],
    recurring: { interval: "month", interval_count: 1 },
    metadata: meta,
    product: { id: `prod_${plan}`, object: "product", active: true, metadata: meta },
    ...overrides,
  } as unknown as Stripe.Price
}

function company(overrides: Partial<CompanyBillingState> = {}): CompanyBillingState {
  return {
    id: 7,
    billingMode: "free",
    licensePlan: "FREE",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionPriceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    continuousSubscriptionStartedAt: null,
    subscriptionCanceledAt: null,
    ...overrides,
  }
}

/** Store en mémoire reproduisant les gardes de l'implémentation PostgreSQL. */
function memoryStore(initial: CompanyBillingState[], lifetimeIds: number[] = []) {
  const companies = new Map(initial.map((c) => [c.id, { ...c }]))
  const events = new Set<string>()
  const writes = { apply: 0, seniority: 0 }
  const store: SubscriptionStore = {
    async getCompany(id) {
      const c = companies.get(id)
      return c ? { ...c } : null
    },
    async findCompanyBySubscriptionId(subId) {
      for (const c of companies.values()) if (c.stripeSubscriptionId === subId) return { ...c }
      return null
    },
    async hasLifetimeLicense(id) {
      return lifetimeIds.includes(id)
    },
    async setStripeCustomerIdIfNull(id, customerId) {
      const c = companies.get(id)
      if (!c) return null
      c.stripeCustomerId ??= customerId
      return c.stripeCustomerId
    },
    async applySubscriptionState(id, subId, patch: SubscriptionStatePatch) {
      const c = companies.get(id)
      if (!c || c.billingMode === "lifetime") return false
      if (c.stripeSubscriptionId && c.stripeSubscriptionId !== subId) return false
      writes.apply++
      Object.assign(c, {
        billingMode: patch.billingMode,
        licensePlan: patch.licensePlan,
        stripeSubscriptionId: patch.stripeSubscriptionId,
        subscriptionStatus: patch.subscriptionStatus,
        subscriptionPriceId: patch.subscriptionPriceId,
        currentPeriodEnd: patch.currentPeriodEnd,
        cancelAtPeriodEnd: patch.cancelAtPeriodEnd,
      })
      if (patch.terminal) {
        c.continuousSubscriptionStartedAt = null
        c.subscriptionCanceledAt = patch.endedAt
      }
      return true
    },
    async startContinuousSubscriptionIfNull(id, subId, paidAt) {
      const c = companies.get(id)
      if (!c || c.stripeSubscriptionId !== subId || c.continuousSubscriptionStartedAt) return false
      writes.seniority++
      c.continuousSubscriptionStartedAt = paidAt
      return true
    },
    async isEventProcessed(eventId) {
      return events.has(eventId)
    },
    async markEventProcessed(eventId) {
      events.add(eventId)
    },
  }
  return { store, companies, events, writes }
}

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

function subscription(overrides: Partial<Record<string, unknown>> & { plan?: SubscriptionPlan } = {}): Stripe.Subscription {
  const { plan = "PRO", ...rest } = overrides
  return {
    id: "sub_1",
    object: "subscription",
    status: "trialing",
    customer: "cus_7",
    cancel_at_period_end: false,
    ended_at: null,
    canceled_at: null,
    metadata: { app: "detailflow", billing_type: "subscription", company_id: "7", license_plan: plan },
    items: { data: [{ price: { id: PRICE_IDS[plan] }, current_period_end: unix("2026-11-01T00:00:00Z") }] },
    ...rest,
  } as unknown as Stripe.Subscription
}

function invoice(overrides: Partial<Record<string, unknown>> = {}): Stripe.Invoice {
  return {
    id: "in_1",
    object: "invoice",
    customer: "cus_7",
    status: "draft",
    auto_advance: true,
    amount_paid: 0,
    discounts: [],
    period_end: unix("2026-10-01T00:00:00Z"),
    lines: { data: [{ period: { start: unix("2026-10-01T00:00:00Z") } }] },
    status_transitions: { paid_at: null },
    parent: {
      subscription_details: {
        subscription: "sub_1",
        metadata: { app: "detailflow", billing_type: "subscription", company_id: "7", license_plan: "PRO" },
      },
    },
    ...overrides,
  } as unknown as Stripe.Invoice
}

let seq = 0
function evt(type: string, object: unknown, extra: Record<string, unknown> = {}): Stripe.Event {
  seq++
  return { id: `evt_${seq}`, type, created: unix("2026-10-01T01:00:00Z"), data: { object }, ...extra } as unknown as Stripe.Event
}

function webhookStripe(sub: () => Stripe.Subscription, inv?: () => Stripe.Invoice) {
  const updates: Array<{ id: string; params: Stripe.InvoiceUpdateParams }> = []
  let current = inv
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async () => sub()),
      cancel: vi.fn(async () => sub()),
    },
    invoices: {
      retrieve: vi.fn(async () => current!()),
      update: vi.fn(async (id: string, params: Stripe.InvoiceUpdateParams) => {
        updates.push({ id, params })
        const updated: Record<string, unknown> = { ...current!() }
        if ("auto_advance" in params) updated.auto_advance = params.auto_advance
        if (params.discounts) {
          const couponId = (params.discounts as Array<{ coupon: string }>)[0].coupon
          updated.discounts = [{ id: "di_1", source: { coupon: { id: couponId } } }]
        }
        current = () => updated as unknown as Stripe.Invoice
        return updated as unknown as Stripe.Invoice
      }),
    },
    coupons: {
      retrieve: vi.fn(async (id: string) => {
        const spec = LOYALTY_COUPONS.find((c) => c.couponId === id)!
        return {
          id,
          percent_off: spec.percentOff,
          duration: "forever",
          valid: true,
          metadata: { app: "detailflow", kind: "loyalty", discount_bps: String(spec.discountBps) },
        } as unknown as Stripe.Coupon
      }),
    },
  }
  return { stripe: stripe as unknown as SubscriptionWebhookDeps["stripe"], raw: stripe, updates }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

/* --------------------------------- Checkout -------------------------------- */

function checkoutStripe(price: Stripe.Price) {
  const created: Stripe.Checkout.SessionCreateParams[] = []
  const stripe = {
    prices: { retrieve: vi.fn(async () => price) },
    customers: {
      create: vi.fn(async () => ({ id: "cus_7" })),
      retrieve: vi.fn(async () => ({ id: "cus_7", metadata: { company_id: "7" } })),
    },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        expire: vi.fn(),
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
          created.push(params)
          return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" }
        }),
      },
    },
  }
  return { stripe: stripe as unknown as SubscriptionCheckoutStripeClient, raw: stripe, created }
}

const checkoutInput = (plan: string) => ({
  companyId: 7,
  role: "OWNER",
  plan,
  successUrl: "https://x.test/ok",
  cancelUrl: "https://x.test/ko",
})

describe("Checkout abonnement", () => {
  it.each(["PRO", "BUSINESS"] as const)("%s : Checkout subscription + trial 30 j sans carte", async (plan) => {
    const { store } = memoryStore([company()])
    const { stripe, created } = checkoutStripe(priceFor(plan))
    const result = await createSubscriptionCheckout(checkoutInput(plan), { stripe, store, env: ENV })
    expect(result.url).toContain("checkout.stripe.test")
    expect(created).toHaveLength(1)
    const params = created[0]
    expect(params.mode).toBe("subscription")
    expect(params.line_items).toEqual([{ price: PRICE_IDS[plan], quantity: 1 }])
    expect(PRICE_IDS[plan]).toMatch(/^price_/)
    expect(params.payment_method_collection).toBe("if_required")
    expect(params.allow_promotion_codes).toBe(false)
    expect(params.subscription_data?.trial_period_days).toBe(30)
    expect(params.subscription_data?.trial_settings).toEqual({ end_behavior: { missing_payment_method: "pause" } })
    expect(params.metadata).toEqual({ app: "detailflow", billing_type: "subscription", company_id: "7", license_plan: plan })
  })

  it("aucun paiement immédiat : pas de ligne unique, pas de mode payment, pas de setup forcé", () => {
    const params = buildSubscriptionCheckoutParams({
      companyId: 1, plan: "BUSINESS", customerId: "cus", priceId: "price_x", successUrl: "s", cancelUrl: "c",
    })
    expect(params.mode).toBe("subscription")
    expect(params.payment_method_collection).not.toBe("always")
    expect(params.line_items).toHaveLength(1)
    expect(params.subscription_data?.trial_period_days).toBeGreaterThan(0)
    expect(params.subscription_data?.trial_settings?.end_behavior?.missing_payment_method).not.toBe("cancel")
    expect(params.payment_intent_data).toBeUndefined()
    expect(params.invoice_creation).toBeUndefined()
  })

  it("trial = 30 jours", () => {
    expect(SUBSCRIPTION_TRIAL_DAYS).toBe(30)
    const params = buildSubscriptionCheckoutParams({
      companyId: 1, plan: "PRO", customerId: "cus", priceId: "p", successUrl: "s", cancelUrl: "c",
    })
    expect(params.subscription_data?.trial_period_days).toBe(30)
  })

  it("ENTERPRISE : compatible backend mais bloqué côté page test", () => {
    expect(isPreviewPurchasableSubscriptionPlan("ENTERPRISE")).toBe(false)
    expect(PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS).toEqual(["PRO", "BUSINESS"])
  })

  it("FREE / FOUNDER / LIFETIME ne sont pas des formules d'abonnement", async () => {
    const { store } = memoryStore([company()])
    for (const plan of ["FREE", "FOUNDER", "LIFETIME"]) {
      const { stripe } = checkoutStripe(priceFor("PRO"))
      await expect(createSubscriptionCheckout(checkoutInput(plan), { stripe, store, env: ENV })).rejects.toMatchObject({
        code: "PLAN_NOT_SUBSCRIBABLE",
      })
    }
  })

  it.each([
    ["montant incorrect", { unit_amount: 999 }],
    ["devise incorrecte", { currency: "usd" }],
    ["inactif", { active: false }],
    ["annuel", { recurring: { interval: "year", interval_count: 1 } }],
    ["mauvais plan en métadonnées", { metadata: { app: "detailflow", billing_type: "subscription", license_plan: "BUSINESS" } }],
  ])("Price incorrect (%s) => refus, aucun Checkout", async (_label, overrides) => {
    const { store } = memoryStore([company()])
    const { stripe, raw } = checkoutStripe(priceFor("PRO", overrides as Partial<Stripe.Price>))
    await expect(createSubscriptionCheckout(checkoutInput("PRO"), { stripe, store, env: ENV })).rejects.toMatchObject({
      code: "PRICE_INVALID",
    })
    expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it.each([
    ["double abonnement", company({ stripeSubscriptionId: "sub_x", subscriptionStatus: "active" }), [], "ALREADY_SUBSCRIBED"],
    ["statut past_due", company({ subscriptionStatus: "past_due" }), [], "ALREADY_SUBSCRIBED"],
    ["billingMode lifetime", company({ billingMode: "lifetime", licensePlan: "BUSINESS" }), [], "LIFETIME_TENANT"],
    ["licence Lifetime", company(), [7], "LIFETIME_TENANT"],
    ["Founder", company({ licensePlan: "FOUNDER" }), [], "FOUNDER_TENANT"],
  ])("%s => refus", async (_label, state, lifetime, code) => {
    const { store } = memoryStore([state as CompanyBillingState], lifetime as number[])
    const { stripe, raw } = checkoutStripe(priceFor("PRO"))
    await expect(createSubscriptionCheckout(checkoutInput("PRO"), { stripe, store, env: ENV })).rejects.toMatchObject({ code })
    expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("non-OWNER => refus", async () => {
    const { store } = memoryStore([company()])
    const { stripe } = checkoutStripe(priceFor("PRO"))
    await expect(
      createSubscriptionCheckout({ ...checkoutInput("PRO"), role: "ADMIN" }, { stripe, store, env: ENV }),
    ).rejects.toMatchObject({ code: "NOT_OWNER" })
  })

  it("Customer réutilisé (jamais recréé) et vérifié", async () => {
    const { store } = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const { stripe, raw } = checkoutStripe(priceFor("PRO"))
    await createSubscriptionCheckout(checkoutInput("PRO"), { stripe, store, env: ENV })
    expect(raw.customers.create).not.toHaveBeenCalled()
    expect(raw.customers.retrieve).toHaveBeenCalledWith("cus_7")
  })

  it("Customer d'un autre tenant => refus", async () => {
    const { store } = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const { stripe, raw } = checkoutStripe(priceFor("PRO"))
    raw.customers.retrieve.mockResolvedValueOnce({ id: "cus_7", metadata: { company_id: "99" } })
    await expect(createSubscriptionCheckout(checkoutInput("PRO"), { stripe, store, env: ENV })).rejects.toMatchObject({
      code: "CUSTOMER_MISMATCH",
    })
  })

  it("double clic : session ouverte du même plan réutilisée", async () => {
    const { store } = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const { stripe, raw } = checkoutStripe(priceFor("PRO"))
    raw.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        {
          id: "cs_open",
          url: "https://checkout.stripe.test/open",
          mode: "subscription",
          metadata: { app: "detailflow", billing_type: "subscription", company_id: "7", license_plan: "PRO" },
        },
      ],
    } as never)
    const result = await createSubscriptionCheckout(checkoutInput("PRO"), { stripe, store, env: ENV })
    expect(result).toMatchObject({ reused: true, sessionId: "cs_open" })
    expect(raw.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe("Garde-fous Preview", () => {
  it("clé Stripe LIVE en Preview => refus", () => {
    expect(() => assertLifetimePreviewTestEnvironment({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(
      LifetimeEnvironmentGuardError,
    )
  })

  it("Production => refus", () => {
    expect(() => assertLifetimePreviewTestEnvironment({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_test_x" })).toThrow(
      LifetimeEnvironmentGuardError,
    )
  })

  it("actions : garde-fous A/B/C avant auth et avant tout Checkout ; ENTERPRISE refusé", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/(dashboard)/abonnement/test-subscriptions/actions.ts"), "utf8")
    const body = src.slice(src.indexOf("export async function startSubscriptionPreviewTestCheckout"))
    const guard = body.indexOf("assertPreviewTestGuards()")
    const plan = body.indexOf("isPreviewPurchasableSubscriptionPlan(plan)")
    const auth = body.indexOf("requireCompanyMember")
    const checkout = body.indexOf("createSubscriptionCheckout(")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(plan)
    expect(plan).toBeLessThan(auth)
    expect(auth).toBeLessThan(checkout)
    expect(src).toContain("assertLifetimePreviewDatabaseMarker")
  })
})

/* ------------------------------ Webhook routing ---------------------------- */

describe("Webhook Billing /api/billing/webhook", () => {
  function billingDeps(subDeps: SubscriptionWebhookDeps): BillingWebhookDeps {
    return {
      secret: "whsec_test",
      stripe: {
        webhooks: {
          constructEvent(payload: string, header: string) {
            if (header !== "valid") throw new Error("bad signature")
            return JSON.parse(payload)
          },
        },
      } as unknown as BillingWebhookDeps["stripe"],
      subscriptions: subDeps,
    }
  }

  it("signature invalide => 400", async () => {
    const { store } = memoryStore([company()])
    const res = await handleBillingWebhook(
      { rawBody: "{}", signature: "forged" },
      billingDeps({ stripe: webhookStripe(() => subscription()).stripe, store, env: ENV }),
    )
    expect(res.status).toBe(400)
  })

  it("événement Connect (event.account) => ignoré, aucune mutation", async () => {
    const mem = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const ws = webhookStripe(() => subscription())
    const event = evt("customer.subscription.created", subscription(), { account: "acct_x" })
    const res = await handleBillingWebhook(
      { rawBody: JSON.stringify(event), signature: "valid" },
      billingDeps({ stripe: ws.stripe, store: mem.store, env: ENV }),
    )
    expect(res.body).toMatchObject({ ignored: "connect_account" })
    expect(ws.raw.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(mem.writes.apply).toBe(0)
  })

  it("abonnement routé vers le moteur d'abonnements", async () => {
    const mem = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const ws = webhookStripe(() => subscription())
    const event = evt("customer.subscription.created", subscription())
    const res = await handleBillingWebhook(
      { rawBody: JSON.stringify(event), signature: "valid" },
      billingDeps({ stripe: ws.stripe, store: mem.store, env: ENV }),
    )
    expect(res.status).toBe(200)
    expect(mem.companies.get(7)?.subscriptionStatus).toBe("trialing")
  })

  it("Checkout payment non-Lifetime => toujours ignoré (routage Lifetime inchangé)", async () => {
    const mem = memoryStore([company()])
    const event = evt("checkout.session.completed", { id: "cs_x", mode: "payment", metadata: {} })
    const res = await handleBillingWebhook(
      { rawBody: JSON.stringify(event), signature: "valid" },
      billingDeps({ stripe: webhookStripe(() => subscription()).stripe, store: mem.store, env: ENV }),
    )
    expect(res.body).toMatchObject({ ignored: "not_lifetime" })
  })

  it("événement inconnu => ignoré", async () => {
    const mem = memoryStore([company()])
    const event = evt("customer.updated", {})
    const res = await handleBillingWebhook(
      { rawBody: JSON.stringify(event), signature: "valid" },
      billingDeps({ stripe: webhookStripe(() => subscription()).stripe, store: mem.store, env: ENV }),
    )
    expect(res.body).toMatchObject({ ignored: "customer.updated" })
  })

  it("moteur d'abonnements absent => 500 (retry), jamais silencieux", async () => {
    const event = evt("invoice.paid", invoice())
    const deps = billingDeps({} as SubscriptionWebhookDeps)
    delete deps.subscriptions
    const res = await handleBillingWebhook({ rawBody: JSON.stringify(event), signature: "valid" }, deps)
    expect(res.status).toBe(500)
  })
})

/* --------------------------- Synchronisation licence ----------------------- */

describe("Synchronisation abonnement ↔ licence", () => {
  function setup(state: Partial<CompanyBillingState> = {}) {
    const mem = memoryStore([company({ stripeCustomerId: "cus_7", ...state })])
    let current = subscription()
    const ws = webhookStripe(() => current)
    const deps: SubscriptionWebhookDeps = { stripe: ws.stripe, store: mem.store, env: ENV }
    return {
      ...mem,
      ws,
      set(sub: Stripe.Subscription) {
        current = sub
      },
      send: (type: string, object: unknown = current) => handleSubscriptionWebhookEvent(evt(type, object), deps),
      deps,
    }
  }

  it("subscription.created (trialing) : droits du plan, ancienneté NULL", async () => {
    const t = setup()
    await t.send("customer.subscription.created")
    const c = t.companies.get(7)!
    expect(c).toMatchObject({
      billingMode: "subscription",
      licensePlan: "PRO",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "trialing",
      subscriptionPriceId: PRICE_IDS.PRO,
      cancelAtPeriodEnd: false,
      continuousSubscriptionStartedAt: null,
    })
    expect(c.currentPeriodEnd).toEqual(new Date("2026-11-01T00:00:00Z"))
    expect(describeSubscriptionReturnState(c).title).toBe("Votre mois offert est activé")
  })

  it("checkout.session.completed ne démarre jamais l'ancienneté", async () => {
    const t = setup()
    await t.send("checkout.session.completed", {
      id: "cs_1",
      mode: "subscription",
      subscription: "sub_1",
      metadata: { app: "detailflow", billing_type: "subscription", company_id: "7", license_plan: "PRO" },
    })
    expect(t.companies.get(7)?.licensePlan).toBe("PRO")
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toBeNull()
  })

  it("replay du même événement => aucune double mutation", async () => {
    const t = setup()
    const event = evt("customer.subscription.created", subscription())
    await handleSubscriptionWebhookEvent(event, t.deps)
    const res = await handleSubscriptionWebhookEvent(event, t.deps)
    expect(res.body).toMatchObject({ duplicate: true })
    expect(t.writes.apply).toBe(1)
  })

  it("erreur transitoire => 500 et événement NON marqué traité", async () => {
    const t = setup()
    t.ws.raw.subscriptions.retrieve.mockRejectedValueOnce(new Error("network"))
    const event = evt("customer.subscription.updated", subscription())
    const res = await handleSubscriptionWebhookEvent(event, t.deps)
    expect(res.status).toBe(500)
    expect(t.events.has(event.id)).toBe(false)
  })

  it("Price inconnu => pas de licence inventée", async () => {
    const t = setup()
    t.set(subscription({ items: { data: [{ price: { id: "price_other" }, current_period_end: 1 }] } }))
    await t.send("customer.subscription.updated")
    expect(t.companies.get(7)?.licensePlan).toBe("FREE")
    expect(t.writes.apply).toBe(0)
  })

  it("tenant Lifetime => abonnement jamais appliqué", async () => {
    const t = setup({ billingMode: "lifetime", licensePlan: "BUSINESS" })
    await t.send("customer.subscription.created")
    expect(t.companies.get(7)).toMatchObject({ billingMode: "lifetime", licensePlan: "BUSINESS" })
  })

  it.each([
    ["trialing", "PRO"],
    ["active", "PRO"],
    ["past_due", "PRO"],
    ["unpaid", "FREE"],
    ["paused", "FREE"],
  ])("statut %s => licence %s", async (status, plan) => {
    const t = setup()
    await t.send("customer.subscription.created")
    t.set(subscription({ status }))
    await t.send("customer.subscription.updated")
    expect(t.companies.get(7)).toMatchObject({ licensePlan: plan, subscriptionStatus: status, stripeSubscriptionId: "sub_1" })
  })

  it("past_due / paused conservent l'ancienneté", async () => {
    const started = new Date("2025-01-10T10:00:00Z")
    for (const status of ["past_due", "paused", "unpaid"]) {
      const t = setup({ stripeSubscriptionId: "sub_1", continuousSubscriptionStartedAt: started })
      t.set(subscription({ status }))
      await t.send("customer.subscription.updated")
      expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toEqual(started)
    }
  })

  it("invoice.payment_failed => resynchronise (past_due, accès conservé)", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1" })
    t.set(subscription({ status: "past_due" }))
    const res = await t.send("invoice.payment_failed", invoice({ status: "open" }))
    expect(res.body).toMatchObject({ paymentFailed: true })
    expect(t.companies.get(7)).toMatchObject({ subscriptionStatus: "past_due", licensePlan: "PRO" })
  })

  it("cancelAtPeriodEnd : droits et ancienneté conservés", async () => {
    const started = new Date("2025-01-10T10:00:00Z")
    const t = setup({ stripeSubscriptionId: "sub_1", continuousSubscriptionStartedAt: started })
    t.set(subscription({ status: "active", cancel_at_period_end: true }))
    await t.send("customer.subscription.updated")
    expect(t.companies.get(7)).toMatchObject({ licensePlan: "PRO", cancelAtPeriodEnd: true, continuousSubscriptionStartedAt: started })
  })

  it("upgrade PRO => BUSINESS : plan changé, ancienneté inchangée", async () => {
    const started = new Date("2025-01-10T10:00:00Z")
    const t = setup({ stripeSubscriptionId: "sub_1", continuousSubscriptionStartedAt: started, licensePlan: "PRO" })
    t.set(subscription({ status: "active", plan: "BUSINESS" }))
    await t.send("customer.subscription.updated")
    expect(t.companies.get(7)).toMatchObject({
      licensePlan: "BUSINESS",
      subscriptionPriceId: PRICE_IDS.BUSINESS,
      continuousSubscriptionStartedAt: started,
    })
  })

  it("subscription.deleted : FREE + remise à zéro de l'ancienneté", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1", continuousSubscriptionStartedAt: new Date("2025-01-10"), licensePlan: "PRO" })
    t.set(subscription({ status: "canceled", ended_at: unix("2026-10-05T00:00:00Z") }))
    await t.send("customer.subscription.deleted")
    expect(t.companies.get(7)).toMatchObject({
      billingMode: "free",
      licensePlan: "FREE",
      subscriptionStatus: "canceled",
      stripeSubscriptionId: null,
      subscriptionPriceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      continuousSubscriptionStartedAt: null,
      subscriptionCanceledAt: new Date("2026-10-05T00:00:00Z"),
    })
    expect(describeSubscriptionReturnState(t.companies.get(7)!).title).toBe("Abonnement résilié")
  })

  it("événement tardif d'un ancien abonnement terminé => ignoré", async () => {
    const t = setup({ stripeSubscriptionId: "sub_new", licensePlan: "PRO", subscriptionStatus: "active" })
    t.set(subscription({ status: "canceled" }))
    const res = await t.send("customer.subscription.deleted")
    expect(res.body).toMatchObject({ ignored: "stale_subscription" })
    expect(t.companies.get(7)?.stripeSubscriptionId).toBe("sub_new")
  })

  it("second abonnement actif concurrent => annulé chez Stripe", async () => {
    const t = setup({ stripeSubscriptionId: "sub_other", subscriptionStatus: "active" })
    await t.send("customer.subscription.created")
    expect(t.ws.raw.subscriptions.cancel).toHaveBeenCalledWith("sub_1", undefined, expect.anything())
    expect(t.companies.get(7)?.stripeSubscriptionId).toBe("sub_other")
  })

  /* --------------------------------- Ancienneté ---------------------------- */

  it("invoice 0 € (trial) => ne démarre pas l'ancienneté", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1" })
    const res = await t.send("invoice.paid", invoice({ status: "paid", amount_paid: 0 }))
    expect(res.body).toMatchObject({ ignored: "zero_amount_invoice" })
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toBeNull()
  })

  it("première vraie facture payée => date = paid_at ; deuxième => inchangée", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1" })
    await t.send(
      "invoice.paid",
      invoice({ status: "paid", amount_paid: 1990, status_transitions: { paid_at: unix("2026-10-01T01:05:00Z") } }),
    )
    const first = new Date("2026-10-01T01:05:00Z")
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toEqual(first)
    await t.send(
      "invoice.paid",
      invoice({ id: "in_2", status: "paid", amount_paid: 1990, status_transitions: { paid_at: unix("2026-11-01T01:05:00Z") } }),
    )
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toEqual(first)
  })

  it("résiliation puis nouvelle souscription => nouvelle date", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1", continuousSubscriptionStartedAt: new Date("2025-01-01") })
    t.set(subscription({ status: "canceled" }))
    await t.send("customer.subscription.deleted")
    t.set(subscription({ id: "sub_2", status: "active" }))
    await t.send("customer.subscription.created")
    await t.send(
      "invoice.paid",
      invoice({
        status: "paid",
        amount_paid: 1990,
        status_transitions: { paid_at: unix("2026-12-01T01:00:00Z") },
        parent: { subscription_details: { subscription: "sub_2", metadata: {} } },
      }),
    )
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toEqual(new Date("2026-12-01T01:00:00Z"))
  })

  it("facture d'un Customer étranger => refusée", async () => {
    const t = setup({ stripeSubscriptionId: "sub_1" })
    await t.send("invoice.paid", invoice({ status: "paid", amount_paid: 1990, customer: "cus_other" }))
    expect(t.companies.get(7)?.continuousSubscriptionStartedAt).toBeNull()
  })
})

/* --------------------------------- Fidélité -------------------------------- */

describe("Fidélité automatique (invoice.created)", () => {
  const STARTED = new Date("2024-01-15T10:00:00Z")

  function addMonthsIso(months: number): string {
    const d = new Date(STARTED)
    d.setUTCMonth(d.getUTCMonth() + months)
    d.setUTCHours(9)
    return d.toISOString()
  }

  function setup(months: number, invoiceOverrides: Record<string, unknown> = {}, env: Record<string, string> = ENV) {
    const mem = memoryStore([
      company({ stripeCustomerId: "cus_7", stripeSubscriptionId: "sub_1", licensePlan: "PRO", continuousSubscriptionStartedAt: STARTED }),
    ])
    const periodStart = unix(addMonthsIso(months))
    const inv = invoice({ lines: { data: [{ period: { start: periodStart } }] }, period_end: periodStart, ...invoiceOverrides })
    const ws = webhookStripe(() => subscription(), () => inv)
    const deps: SubscriptionWebhookDeps = { stripe: ws.stripe, store: mem.store, env }
    const current = async () => t0.ws.stripe.invoices.retrieve("in_1")
    const t0 = {
      ws,
      deps,
      inv,
      mem,
      current,
      send: () => handleSubscriptionWebhookEvent(evt("invoice.created", inv), deps),
      sendTracked: async () => {
        const e = evt("invoice.created", inv)
        const res = await handleSubscriptionWebhookEvent(e, deps)
        return { res, processed: await deps.store.isEventProcessed(e.id) }
      },
    }
    return t0
  }

  it("5 mois (0 %) => aucune remise, auto_advance jamais touché", async () => {
    const t = setup(5)
    const res = await t.send()
    expect(res.body).toMatchObject({ loyalty: "none" })
    expect(t.ws.raw.invoices.update).not.toHaveBeenCalled()
    expect(t.ws.raw.invoices.retrieve).not.toHaveBeenCalled()
  })

  it("5 % => hold auto_advance=false AVANT coupon, puis coupon + auto_advance=true", async () => {
    const t = setup(6)
    const res = await t.send()
    expect(res.status).toBe(200)
    expect(t.ws.updates[0].params).toEqual({ auto_advance: false })
    expect(t.ws.raw.invoices.update.mock.invocationCallOrder[0]).toBeLessThan(
      t.ws.raw.coupons.retrieve.mock.invocationCallOrder[0],
    )
    expect(t.ws.updates[1].params).toMatchObject({ discounts: [{ coupon: "detailflow_loyalty_5" }], auto_advance: true })
    expect((await t.current()).auto_advance).toBe(true)
  })

  it("coupon env absent => reste en hold, 500, event non traité", async () => {
    const env = { ...ENV }
    delete env.STRIPE_COUPON_LOYALTY_10
    const t = setup(12, {}, env)
    const { res, processed } = await t.sendTracked()
    expect(res.status).toBe(500)
    expect(processed).toBe(false)
    expect((await t.current()).auto_advance).toBe(false)
    expect(t.ws.updates).toHaveLength(1)
  })

  it("coupon Stripe invalide => reste en hold, 500, event non traité", async () => {
    const t = setup(12)
    t.ws.raw.coupons.retrieve.mockResolvedValueOnce({ id: "detailflow_loyalty_10", percent_off: 50, duration: "once", metadata: {} } as never)
    const { res, processed } = await t.sendTracked()
    expect(res.status).toBe(500)
    expect(processed).toBe(false)
    expect((await t.current()).auto_advance).toBe(false)
    expect(t.ws.updates.some((u) => u.params.discounts)).toBe(false)
  })

  it("remise inconnue => jamais écrasée, reste en hold, 500", async () => {
    const t = setup(12, { discounts: [{ id: "di_x", source: { coupon: { id: "PROMO_NOEL" } } }] })
    const { res, processed } = await t.sendTracked()
    expect(res.status).toBe(500)
    expect(processed).toBe(false)
    const after = await t.current()
    expect(after.auto_advance).toBe(false)
    expect((after.discounts[0] as Stripe.Discount).source?.coupon).toMatchObject({ id: "PROMO_NOEL" })
    expect(t.ws.updates.some((u) => u.params.discounts)).toBe(false)
  })

  it("retry sur facture déjà en hold => pas de 2e hold, coupon appliqué et hold levé", async () => {
    const t = setup(12, { auto_advance: false })
    const res = await t.send()
    expect(res.body).toMatchObject({ loyalty: "applied", couponId: "detailflow_loyalty_10" })
    expect(t.ws.updates).toHaveLength(1)
    expect(t.ws.updates[0].params).toMatchObject({ auto_advance: true })
    expect((await t.current()).auto_advance).toBe(true)
  })

  it("coupon déjà présent + hold (retry) => réactive simplement auto_advance", async () => {
    const t = setup(12, {
      auto_advance: false,
      discounts: [{ id: "di_1", source: { coupon: { id: "detailflow_loyalty_10" } } }],
    })
    const { res, processed } = await t.sendTracked()
    expect(res.body).toMatchObject({ loyalty: "already_applied" })
    expect(processed).toBe(true)
    expect(t.ws.updates).toEqual([{ id: "in_1", params: { auto_advance: true } }])
    expect(t.ws.raw.coupons.retrieve).not.toHaveBeenCalled()
  })

  it("facture déjà finalisée avec remise due => CRITIQUE 500, event non traité, aucune modification", async () => {
    const t = setup(12, { status: "open" })
    const { res, processed } = await t.sendTracked()
    expect(res.status).toBe(500)
    expect(res.body).not.toHaveProperty("rejected")
    expect(processed).toBe(false)
    expect(t.ws.raw.invoices.update).not.toHaveBeenCalled()
  })

  it("facture hors abonnement (Lifetime) => ignorée, aucun appel Stripe", async () => {
    const t = setup(12, { parent: null })
    const res = await t.send()
    expect(res.body).toMatchObject({ ignored: "not_subscription_invoice" })
    expect(t.ws.raw.invoices.retrieve).not.toHaveBeenCalled()
    expect(t.ws.raw.invoices.update).not.toHaveBeenCalled()
  })

  it.each([
    [6, "detailflow_loyalty_5"],
    [12, "detailflow_loyalty_10"],
    [18, "detailflow_loyalty_15"],
    [24, "detailflow_loyalty_17_5"],
    [30, "detailflow_loyalty_20"],
    [60, "detailflow_loyalty_20"],
  ])("%s mois => coupon %s visible sur la facture", async (months, couponId) => {
    const t = setup(months)
    const res = await t.send()
    expect(res.body).toMatchObject({ loyalty: "applied", couponId })
    expect(t.ws.updates[1].params.discounts).toEqual([{ coupon: couponId }])
    const after = await t.ws.stripe.invoices.retrieve("in_1")
    expect((after.discounts[0] as Stripe.Discount).source?.coupon).toMatchObject({ id: couponId })
  })

  it("retry après succès (event non marqué) => already_applied, hold ré-appliqué puis levé", async () => {
    const t = setup(12)
    await t.send()
    const res = await t.send()
    expect(res.body).toMatchObject({ loyalty: "already_applied" })
    expect(t.ws.updates.filter((u) => u.params.discounts)).toHaveLength(1)
    expect((await t.current()).auto_advance).toBe(true)
  })

  it("facture d'un abonnement inconnu (non DetailFlow) => ignorée sans remise", async () => {
    const t = setup(12, { parent: { subscription_details: { subscription: "sub_unknown", metadata: {} } } })
    const res = await t.send()
    expect(res.body).toMatchObject({ ignored: "not_detailflow_invoice" })
  })

  it("facture DetailFlow d'un tenant introuvable => fail closed (500)", async () => {
    const t = setup(12, {
      parent: {
        subscription_details: {
          subscription: "sub_unknown",
          metadata: { app: "detailflow", billing_type: "subscription", company_id: "999", license_plan: "PRO" },
        },
      },
    })
    const res = await t.send()
    expect(res.status).toBe(500)
  })
})

/* --------------------------------- Portal ---------------------------------- */

describe("Customer Portal", () => {
  const portalStripe = () => ({
    customers: { retrieve: vi.fn(async () => ({ id: "cus_7", metadata: { company_id: "7" } })), create: vi.fn() },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.test/p" })) } },
  })

  it("OWNER + Customer du tenant => session", async () => {
    const { store } = memoryStore([company({ stripeCustomerId: "cus_7" })])
    const stripe = portalStripe()
    const res = await createSubscriptionPortalSession(
      { companyId: 7, role: "OWNER", returnUrl: "https://x.test/back" },
      { stripe: stripe as never, store },
    )
    expect(res.url).toContain("billing.stripe.test")
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_7", return_url: "https://x.test/back" })
  })

  it("non-OWNER / sans Customer => refus", async () => {
    const { store } = memoryStore([company()])
    await expect(
      createSubscriptionPortalSession({ companyId: 7, role: "ADMIN", returnUrl: "r" }, { stripe: portalStripe() as never, store }),
    ).rejects.toBeInstanceOf(SubscriptionError)
    await expect(
      createSubscriptionPortalSession({ companyId: 7, role: "OWNER", returnUrl: "r" }, { stripe: portalStripe() as never, store }),
    ).rejects.toMatchObject({ code: "NO_CUSTOMER" })
  })
})

describe("Périmètre", () => {
  it("PLAN_MATRIX.FREE inchangé (pas d'online_payments)", () => {
    expect(PLAN_MATRIX.FREE.features.online_payments).toBe(false)
  })
})
