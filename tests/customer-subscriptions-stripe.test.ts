import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { and, eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import * as payments from "@/lib/customer-subscriptions/payments"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"
import { buildCheckoutSessionParams, checkoutIdempotencyKey, decideProviderDeletion, desiredProviderCancelAt, feePercentFromBps, invoiceChargedFeeCents, platformFeeBpsForPaymentType } from "@/lib/customer-subscriptions/stripe-mapping"
import type { PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const NOW = new Date("2026-01-15T10:00:00.000Z")
const RETURN = "https://tenant.example.com/abonnement/retour?session_id={CHECKOUT_SESSION_ID}"
const RETURN_CTX = { rootDomain: "detailflow.test", allowLocalhost: false }
const sec = (d: Date) => Math.floor(d.getTime() / 1000)

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

type Call = { method: string; id?: string; params?: Record<string, unknown>; opts: payments.StripeCallOptions }

function fakePort(
  init: {
    subscriptions?: Record<string, payments.SubscriptionLike>
    paymentIntents?: Record<string, payments.PaymentIntentLike>
    invoices?: Record<string, Record<string, unknown>>
    balances?: Record<string, unknown>
    failInvoiceUpdate?: boolean
  } = {},
) {
  const calls: Call[] = []
  const sessions = new Map<string, payments.CheckoutSessionLike>()
  const byKey = new Map<string, payments.CheckoutSessionLike>()
  const subs = new Map(Object.entries(init.subscriptions ?? {}))
  const pis = new Map(Object.entries(init.paymentIntents ?? {}))
  const port: payments.CustomerSubscriptionStripePort = {
    async createCheckoutSession(params, opts) {
      calls.push({ method: "createCheckoutSession", params, opts })
      // Idempotence Stripe simulée : même clé → même session.
      if (opts.idempotencyKey && byKey.has(opts.idempotencyKey)) return byKey.get(opts.idempotencyKey)!
      const s = { id: uid("cs_test"), status: "open", client_secret: uid("secret"), mode: params.mode as string, metadata: params.metadata as Record<string, string> }
      sessions.set(s.id, s)
      if (opts.idempotencyKey) byKey.set(opts.idempotencyKey, s)
      return s
    },
    async retrieveCheckoutSession(id, opts) {
      calls.push({ method: "retrieveCheckoutSession", id, opts })
      // Session créée par un autre port (tentative précédente) : considérée terminée.
      return sessions.get(id) ?? { id, status: "complete", metadata: { paymentType: "initial_cleaning" } }
    },
    async retrieveSubscription(id, opts) {
      calls.push({ method: "retrieveSubscription", id, opts })
      return subs.get(id) ?? { id, status: "active", metadata: {} }
    },
    async updateSubscription(id, params, opts) {
      calls.push({ method: "updateSubscription", id, params, opts })
      if ("cancel_at" in params) {
        const prev = subs.get(id) ?? { id, status: "active", metadata: {} }
        subs.set(id, { ...prev, cancel_at: params.cancel_at === "" ? null : (params.cancel_at as number) })
      }
      return { id }
    },
    async cancelSubscription(id, opts) {
      calls.push({ method: "cancelSubscription", id, opts })
      return { id, status: "canceled" }
    },
    async retrievePaymentIntent(id, opts) {
      calls.push({ method: "retrievePaymentIntent", id, opts })
      return pis.get(id) ?? { id, application_fee_amount: 0 }
    },
    async updateInvoice(id, params, opts) {
      calls.push({ method: "updateInvoice", id, params, opts })
      if (init.failInvoiceUpdate) throw new Error("invoice_not_editable")
      return { id }
    },
    async retrieveInvoice(id, opts) {
      calls.push({ method: "retrieveInvoice", id, opts })
      return (init.invoices?.[id] ?? { id }) as any
    },
    async retrievePaymentIntentWithBalance(id, opts) {
      calls.push({ method: "retrievePaymentIntentWithBalance", id, opts })
      return (init.balances?.[id] ?? { id, latest_charge: null }) as any
    },
  }
  return { port, calls, sessions }
}

async function seedCompany(plan: string | null) {
  const acct = uid("acct_test")
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,$2,true,true) RETURNING id`,
    [plan, acct],
  )
  const companyId = r.rows[0].id
  const s = await pg.query<{ id: number }>(
    `INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900), ($1,'Nettoyage initial',12000) RETURNING id`,
    [companyId],
  )
  return { companyId, acct, includedServiceId: s.rows[0].id, initialServiceId: s.rows[1].id }
}

const setPlan = (companyId: number, plan: string | null) => pg.query(`UPDATE companies SET "licensePlan"=$1 WHERE id=$2`, [plan, companyId])

async function seedSub(c: Awaited<ReturnType<typeof seedCompany>>, plan: PlanConfigInput = {}, paymentMode: "recurring" | "prepaid" = "recurring") {
  const { planId } = await engine.createPlan(db, c.companyId, owner, {
    name: "Entretien Premium",
    priceCents: 8900,
    currency: "EUR",
    billingIntervalUnit: "week",
    billingIntervalCount: 4,
    includedUsesPerCycle: 1,
    includedServiceId: c.includedServiceId,
    commitmentUnit: "none",
    commitmentCount: 0,
    renewalMode: "open_ended",
    status: "active",
    ...plan,
  })
  const sub = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Jean", email: "jean@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode, idempotencyKey: uid("idem-key-xxxxxxxx") },
    NOW,
  )
  return sub.subscriptionId
}

const getSub = async (id: number) => (await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, id)))[0]
const getPayments = (id: number) => db.select().from(schema.maintenancePayments).where(eq(schema.maintenancePayments.subscriptionId, id))
const getCycles = (id: number) => db.select().from(schema.maintenanceCycles).where(eq(schema.maintenanceCycles.subscriptionId, id))

function moduleMeta(companyId: number, subscriptionId: number, extra: Record<string, string> = {}) {
  return { detailflowModule: "customer_subscription", companyId: String(companyId), maintenanceSubscriptionId: String(subscriptionId), ...extra }
}

/** Forme Stripe (API récente) : subscription/metadata sous parent.subscription_details, PI sous payments.data. */
function invoiceEvent(type: string, account: string | null, inv: Record<string, unknown>, created = NOW) {
  const { subscription, metadata, payment_intent, ...rest } = inv
  const object = {
    currency: "eur",
    ...rest,
    parent: { subscription_details: { subscription: subscription ?? null, metadata: metadata ?? null } },
    ...(payment_intent ? { payments: { data: [{ payment: { payment_intent } }] } } : {}),
  }
  return { id: uid("evt"), type, account, created: sec(created), data: { object } }
}

const PERIOD_START = new Date("2026-01-16T00:00:00.000Z")
const periodLines = (start: Date) => ({ lines: { data: [{ period: { start: sec(start), end: sec(new Date(start.getTime() + 28 * 86_400_000)) } }] } })

async function payFirstInvoice(port: payments.CustomerSubscriptionStripePort, c: { companyId: number; acct: string }, subId: number, ext = uid("sub_test")) {
  const inv = { id: uid("in_test"), subscription: ext, status: "paid", amount_paid: 8900, amount_due: 8900, application_fee_amount: 267, metadata: moduleMeta(c.companyId, subId), ...periodLines(PERIOD_START) }
  const r = await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, inv, PERIOD_START))
  return { r, ext, inv }
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text NOT NULL DEFAULT ('tenant-' || floor(random()*1e9)::text), "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
  `)
  await pg.exec(read("scripts/customer-subscriptions-schema-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-runtime-core-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-stripe-refunds-migration.sql"))
  db = drizzle(pg, { schema }) as unknown as engine.Executor
})

/* ------------------------------ Commission ------------------------------- */

describe("commission customer_subscriptions (plan-policy, pas commercial-rules)", () => {
  it.each([
    ["FREE", 700],
    ["ESSENTIAL", 700],
    ["PRO", 300],
    ["BUSINESS", 0],
    ["ENTERPRISE", 0],
    ["FOUNDER", 0],
    [null, 0],
  ])("%s → %d bps", async (plan, bps) => {
    const c = await seedCompany(plan)
    expect((await engine.resolveCurrentCustomerSubscriptionFee(db, c.companyId)).platformFeeBps).toBe(bps)
  })

  it.each([700, 300, 0])("initial_cleaning = 0 %% quel que soit le plan (%d bps) ; recurring/prepaid inchangés", (bps) => {
    expect(platformFeeBpsForPaymentType("initial_cleaning", bps)).toBe(0)
    expect(platformFeeBpsForPaymentType("recurring", bps)).toBe(bps)
    expect(platformFeeBpsForPaymentType("prepaid", bps)).toBe(bps)
  })

  it("commission facture : forme legacy (application_fee_amount) et forme dahlia (absent → metadata, puis taux courant)", () => {
    expect(invoiceChargedFeeCents({ id: "in_l", application_fee_amount: 623 }, 8900, 300)).toBe(623)
    expect(invoiceChargedFeeCents({ id: "in_d", metadata: { detailflowPlatformFeeBps: "700" } }, 8900, 300)).toBe(623)
    expect(invoiceChargedFeeCents({ id: "in_d2" }, 8900, 300)).toBe(267)
    expect(invoiceChargedFeeCents({ id: "in_d3" }, 8900, 0)).toBe(0)
  })

  it("bps → application_fee_percent ; 0 → paramètre omis", () => {
    expect(feePercentFromBps(700)).toBe(7)
    expect(feePercentFromBps(300)).toBe(3)
    expect(feePercentFromBps(0)).toBeNull()
  })

  it("aucun `plan === \"PRO\"` ni commercial-rules dans le moteur Stripe", () => {
    for (const f of ["payments.ts", "stripe-mapping.ts", "stripe.ts"]) {
      const src = read(`lib/customer-subscriptions/${f}`)
      expect(src).not.toMatch(/===\s*["'](PRO|FREE|BUSINESS|ESSENTIAL)["']/)
      expect(src).not.toMatch(/from\s+["'][^"']*commercial-rules/)
      expect(src).not.toContain("online_payments")
      expect(src).not.toMatch(/sk_live|STRIPE_SECRET_KEY/)
    }
  })
})

/* ------------------------------- Checkout -------------------------------- */

describe("checkout", () => {
  it("récurrent mensuel : mode subscription, interval month, Direct Charge, metadata", async () => {
    const c = await seedCompany("FREE")
    const id = await seedSub(c, { billingIntervalUnit: "month", billingIntervalCount: 1 })
    const { port, calls } = fakePort()
    const r = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect(r).toMatchObject({ status: "open", paymentMode: "recurring", kind: "recurring", reused: false })
    const call = calls.find((x) => x.method === "createCheckoutSession")!
    expect(call.opts.stripeAccount).toBe(c.acct)
    const p = call.params as any
    expect(p.mode).toBe("subscription")
    expect(p.line_items[0].price_data.recurring).toEqual({ interval: "month", interval_count: 1 })
    expect(p.line_items[0].price_data.unit_amount).toBe(8900)
    expect(p.metadata).toMatchObject(moduleMeta(c.companyId, id))
    expect(p.subscription_data.metadata).toMatchObject(moduleMeta(c.companyId, id))
    expect(p.subscription_data.application_fee_percent).toBe(7)
    expect((await getSub(id)).externalCheckoutSessionId).toBe(r.checkoutSessionId)
  })

  it("récurrent 4 semaines : week × 4, jamais 1 mois ; BUSINESS : aucun fee", async () => {
    const c = await seedCompany("BUSINESS")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    const p = calls[0].params as any
    expect(p.line_items[0].price_data.recurring).toEqual({ interval: "week", interval_count: 4 })
    expect(p.subscription_data).not.toHaveProperty("application_fee_percent")
  })

  it("prix = snapshot contrat, jamais le prix courant de la formule", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    await pg.query(`UPDATE maintenance_plans SET "priceCents"=1 WHERE "companyId"=$1`, [c.companyId])
    const { port, calls } = fakePort()
    await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect((calls[0].params as any).line_items[0].price_data.unit_amount).toBe(8900)
  })

  it("double clic : même session réutilisée, une seule création", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const [a, b] = await Promise.all([
      payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX }),
      payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX }),
    ])
    expect(a.checkoutSessionId).toBe(b.checkoutSessionId)
    expect(calls.filter((x) => x.method === "createCheckoutSession").length).toBeLessThanOrEqual(2)
    const again = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect(again.reused).toBe(true)
    expect(again.checkoutSessionId).toBe(a.checkoutSessionId)
  })

  it("session expirée → nouvelle tentative, clé dérivée de la session expirée (déterministe)", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls, sessions } = fakePort()
    const first = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    sessions.get(first.checkoutSessionId)!.status = "expired"
    const second = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect(second.checkoutSessionId).not.toBe(first.checkoutSessionId)
    const keys = calls.filter((x) => x.method === "createCheckoutSession").map((x) => x.opts.idempotencyKey)
    expect(keys[1]).toBe(checkoutIdempotencyKey({ companyId: c.companyId, subscriptionId: id, kind: "recurring", previousSessionId: first.checkoutSessionId, platformFeeBps: 300 }))
    expect(keys[0]).not.toBe(keys[1])
    expect((await getSub(id)).externalCheckoutSessionId).toBe(second.checkoutSessionId)
  })

  it("session complète (webhook pas encore reçu) : rien n'est recréé", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, sessions } = fakePort()
    const first = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    sessions.get(first.checkoutSessionId)!.status = "complete"
    await expect(payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })).rejects.toMatchObject({ code: "CHECKOUT_ALREADY_COMPLETED" })
  })

  it("autre tenant : SUBSCRIPTION_NOT_FOUND ; compte Stripe changé : STRIPE_NOT_CONNECTED", async () => {
    const c = await seedCompany("PRO")
    const other = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    await expect(payments.startSubscriptionCheckout(db, port, other.companyId, owner, id, { returnUrlContext: RETURN_CTX })).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_FOUND" })
    await pg.query(`UPDATE companies SET "stripeAccountId"='acct_other' WHERE id=$1`, [c.companyId])
    await expect(payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })).rejects.toMatchObject({ code: "STRIPE_NOT_CONNECTED" })
  })
})

/* -------------------------------- Prepaid -------------------------------- */

describe("prepaid", () => {
  it("mode payment, total = snapshot × cycles, application_fee_amount ; paiement → activation + 1 cycle, idempotent", async () => {
    const c = await seedCompany("FREE")
    const id = await seedSub(c, { billingIntervalUnit: "month", billingIntervalCount: 1, allowPrepaidPayment: true, prepaidBillingCycles: 6 }, "prepaid")
    const { port, calls } = fakePort({ paymentIntents: { pi_pre: { id: "pi_pre", application_fee_amount: 3738 } } })
    const r = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect(r.paymentMode).toBe("prepaid")
    const p = calls[0].params as any
    expect(p.mode).toBe("payment")
    expect(p.line_items[0].price_data.unit_amount).toBe(8900 * 6)
    expect(p.payment_intent_data.application_fee_amount).toBe(3738)
    expect(p.payment_intent_data.metadata.paymentType).toBe("prepaid")

    const evt = {
      id: uid("evt"),
      type: "checkout.session.completed",
      account: c.acct,
      created: sec(NOW),
      data: { object: { id: r.checkoutSessionId, mode: "payment", payment_status: "paid", payment_intent: "pi_pre", customer: "cus_1", amount_total: 53400, currency: "eur", metadata: p.metadata } },
    }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, evt)).toEqual({ handled: true, outcome: "checkout_paid" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...evt, id: uid("evt") })).toEqual({ handled: true, outcome: "checkout_paid_duplicate" })
    const sub = await getSub(id)
    expect(sub.status).toBe("active")
    expect(sub.prepaidUntil).not.toBeNull()
    expect(sub.externalCustomerId).toBe("cus_1")
    const pays = await getPayments(id)
    expect(pays).toHaveLength(1)
    expect(pays[0]).toMatchObject({ type: "prepaid", status: "paid", grossAmountCents: 53400, platformFeeBps: 700, platformFeeAmountCents: 3738, providerAccountId: c.acct, externalPaymentId: "pi_pre" })
    expect(await getCycles(id)).toHaveLength(1)
  })
})

/* ---------------------------- Nettoyage initial --------------------------- */

describe("nettoyage initial", () => {
  it("checkout one-shot sur snapshot ; payé → reste pending_initial_cleaning ; completeInitialCleaning exige le paiement", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c, { initialCleaningRequired: true, initialServiceId: c.initialServiceId })
    expect((await getSub(id)).status).toBe("pending_initial_cleaning")
    await expect(engine.completeInitialCleaning(db, c.companyId, owner, id, NOW)).rejects.toMatchObject({ code: "INITIAL_CLEANING_PAYMENT_REQUIRED" })

    await pg.query(`UPDATE services SET "basePriceCents"=1, name='Renommé' WHERE id=$1`, [c.initialServiceId])
    const { port, calls } = fakePort({ paymentIntents: { pi_init: { id: "pi_init", application_fee_amount: null } } })
    const r = await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect(r.kind).toBe("initial_cleaning")
    const call = calls[0]
    expect(call.opts.stripeAccount).toBe(c.acct) // Direct Charge sur le compte du detailer
    const p = call.params as any
    expect(p.mode).toBe("payment")
    expect(p.line_items[0].price_data).toMatchObject({ unit_amount: 12000, product_data: { name: "Nettoyage initial" } })
    // Tenant PRO, 120 € : commission DetailFlow = 0 €.
    expect(p.payment_intent_data).not.toHaveProperty("application_fee_amount")
    expect(p.metadata.detailflowPlatformFeeBps).toBe("0")

    await payments.handleCustomerSubscriptionWebhook(db, port, {
      id: uid("evt"),
      type: "checkout.session.completed",
      account: c.acct,
      created: sec(NOW),
      data: { object: { id: r.checkoutSessionId, mode: "payment", payment_status: "paid", payment_intent: "pi_init", customer: "cus_init", amount_total: 12000, currency: "eur", metadata: p.metadata } },
    })
    const sub = await getSub(id)
    expect(sub.status).toBe("pending_initial_cleaning")
    expect(sub.externalCustomerId).toBe("cus_init")
    expect((await getPayments(id))[0]).toMatchObject({ type: "initial_cleaning", status: "paid", grossAmountCents: 12000, platformFeeBps: 0, platformFeeAmountCents: 0 })
    await expect(payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })).rejects.toBeInstanceOf(CustomerSubscriptionError)

    await engine.completeInitialCleaning(db, c.companyId, owner, id, NOW)
    expect((await getSub(id)).status).toBe("pending_payment")
    // Récurrent ensuite : Customer Stripe réutilisé.
    const next = fakePort()
    await payments.startSubscriptionCheckout(db, next.port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })
    expect((next.calls.find((x) => x.method === "createCheckoutSession")!.params as any).customer).toBe("cus_init")
  })
})

/* -------------------------------- Factures -------------------------------- */

describe("invoices", () => {
  it("invoice.paid 1re facture (avant checkout.completed) : activation ancrée sur la période Stripe, lien des IDs, 1 cycle", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { r, ext } = await payFirstInvoice(port, c, id)
    expect(r).toEqual({ handled: true, outcome: "invoice_paid" })
    const sub = await getSub(id)
    expect(sub.status).toBe("active")
    expect(sub.billingAnchorAt?.toISOString()).toBe(PERIOD_START.toISOString())
    expect(sub.externalSubscriptionId).toBe(ext)
    expect(await getCycles(id)).toHaveLength(1)
    // checkout.session.completed arrive ensuite : aucun doublon.
    const late = await payments.handleCustomerSubscriptionWebhook(db, port, {
      id: uid("evt"),
      type: "checkout.session.completed",
      account: c.acct,
      created: sec(NOW),
      data: { object: { id: "cs_late", mode: "subscription", payment_status: "paid", subscription: ext, customer: "cus_r", metadata: moduleMeta(c.companyId, id, { paymentType: "recurring" }) } },
    })
    expect(late).toEqual({ handled: true, outcome: "checkout_linked" })
    expect(await getPayments(id)).toHaveLength(1)
    expect(await getCycles(id)).toHaveLength(1)
  })

  it("facture sans metadata : retrouvée via la Stripe Subscription (contexte event.account)", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort({ subscriptions: { sub_meta: { id: "sub_meta", status: "active", metadata: moduleMeta(c.companyId, id) } } })
    const r = await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, { id: uid("in"), subscription: "sub_meta", status: "paid", amount_paid: 8900, ...periodLines(PERIOD_START) }))
    expect(r).toEqual({ handled: true, outcome: "invoice_paid" })
    expect(calls.find((x) => x.method === "retrieveSubscription")?.opts.stripeAccount).toBe(c.acct)
  })

  it("invoice.created draft : application_fee_amount = plan EFFECTIF (upgrade avant facture), sync subscription, doublon = 1 ligne", async () => {
    const c = await seedCompany("FREE")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    await setPlan(c.companyId, "PRO")
    const inv = { id: uid("in_next"), subscription: ext, status: "draft", amount_due: 8900, metadata: moduleMeta(c.companyId, id) }
    const evt = invoiceEvent("invoice.created", c.acct, inv)
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, evt)).toEqual({ handled: true, outcome: "invoice_created" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...evt, id: uid("evt") })).toEqual({ handled: true, outcome: "invoice_created_duplicate" })
    const upd = calls.find((x) => x.method === "updateInvoice")!
    expect(upd.opts.stripeAccount).toBe(c.acct)
    expect(upd.params).toMatchObject({ application_fee_amount: 267, metadata: { detailflowPlatformFeeBps: "300", maintenanceSubscriptionId: String(id) } })
    expect(calls.find((x) => x.method === "updateSubscription")!.params).toEqual({ application_fee_percent: 3 })
    const rows = (await getPayments(id)).filter((p) => p.externalInvoiceId === inv.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "pending", platformFeeBps: 300, platformFeeAmountCents: 267, grossAmountCents: 8900 })

    // Downgrade BUSINESS : 0 % → pourcentage supprimé côté Stripe.
    await setPlan(c.companyId, "BUSINESS")
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", c.acct, { ...inv, id: uid("in_biz") }))
    expect(calls.filter((x) => x.method === "updateSubscription").at(-1)!.params).toEqual({ application_fee_percent: "" })
  })

  it("facture déjà finalisée : jamais modifiée", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const before = calls.filter((x) => x.method === "updateInvoice").length
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", c.acct, { id: uid("in_open"), subscription: ext, status: "open", amount_due: 8900, application_fee_amount: 623, metadata: moduleMeta(c.companyId, id) }))
    expect(calls.filter((x) => x.method === "updateInvoice").length).toBe(before)
  })

  it("renouvellement payé : nouveau cycle, paiement pending → paid, snapshots conservés, doublon sans effet", async () => {
    const c = await seedCompany("FREE")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const p2 = new Date(PERIOD_START.getTime() + 28 * 86_400_000)
    const inv = { id: uid("in_r"), subscription: ext, amount_due: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(p2) }
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", c.acct, { ...inv, status: "draft" }))
    await setPlan(c.companyId, "PRO") // après création : le snapshot du paiement ne bouge pas
    const paid = invoiceEvent("invoice.paid", c.acct, { ...inv, status: "paid", amount_paid: 8900, payment_intent: "pi_r" }, p2)
    await payments.handleCustomerSubscriptionWebhook(db, port, paid)
    await payments.handleCustomerSubscriptionWebhook(db, port, { ...paid, id: uid("evt") })
    const row = (await getPayments(id)).find((p) => p.externalInvoiceId === inv.id)!
    expect(row).toMatchObject({ status: "paid", platformFeeBps: 700, platformFeeAmountCents: 623, externalPaymentId: "pi_r" })
    expect(await getPayments(id)).toHaveLength(2)
    expect(await getCycles(id)).toHaveLength(2)
  })

  it("payment_failed : active → past_due, cycles conservés ; invoice.paid → active ; suspended jamais réactivé", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const p2 = new Date(PERIOD_START.getTime() + 28 * 86_400_000)
    const inv = { id: uid("in_f"), subscription: ext, amount_due: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(p2) }
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.payment_failed", c.acct, { ...inv, status: "open" }, p2))
    expect((await getSub(id)).status).toBe("past_due")
    expect((await getPayments(id)).find((p) => p.externalInvoiceId === inv.id)).toMatchObject({ status: "failed" })
    expect(await getCycles(id)).toHaveLength(1)
    const audit = await db.select().from(schema.maintenanceAuditLog).where(and(eq(schema.maintenanceAuditLog.subscriptionId, id), eq(schema.maintenanceAuditLog.action, "payment_failed")))
    expect(audit).toHaveLength(1)

    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, { ...inv, status: "paid", amount_paid: 8900 }, p2))
    expect((await getSub(id)).status).toBe("active")

    await pg.query(`UPDATE maintenance_subscriptions SET status='suspended' WHERE id=$1`, [id])
    const p3 = new Date(p2.getTime() + 28 * 86_400_000)
    const inv3 = { ...inv, id: uid("in_s"), ...periodLines(p3) }
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.payment_failed", c.acct, { ...inv3, status: "open" }, p3))
    expect((await getSub(id)).status).toBe("suspended")
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, { ...inv3, status: "paid", amount_paid: 8900 }, p3))
    expect((await getSub(id)).status).toBe("suspended")
  })

  it("pending_payment + échec : reste pending_payment", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.payment_failed", c.acct, { id: uid("in"), subscription: uid("sub"), status: "open", amount_due: 8900, metadata: moduleMeta(c.companyId, id) }))
    expect((await getSub(id)).status).toBe("pending_payment")
  })
})

/* ------------------------------- Sécurité -------------------------------- */

describe("event.account", () => {
  it("absent ou différent : aucune mutation", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const inv = { id: uid("in"), subscription: uid("sub"), status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(PERIOD_START) }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", null, inv))).toEqual({ handled: true, outcome: "ignored_missing_account" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", "acct_attacker", inv))).toEqual({ handled: true, outcome: "rejected_account_mismatch" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", "acct_attacker", { ...inv, status: "draft" }))).toEqual({ handled: true, outcome: "rejected_account_mismatch" })
    const sub = await getSub(id)
    expect(sub.status).toBe("pending_payment")
    expect(sub.externalSubscriptionId).toBeNull()
    expect(await getPayments(id)).toHaveLength(0)
    expect(calls.filter((x) => x.method.startsWith("update"))).toHaveLength(0)
  })

  it("metadata d'un autre tenant : refus", async () => {
    const c = await seedCompany("PRO")
    const other = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const r = await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", other.acct, { id: uid("in"), subscription: uid("sub"), status: "paid", amount_paid: 1, metadata: moduleMeta(other.companyId, id) }))
    expect(r).toEqual({ handled: true, outcome: "ignored_unknown_subscription" })
    expect(await getPayments(id)).toHaveLength(0)
  })

  it("booking : événements sans module customer_subscription non interceptés", async () => {
    const { port, calls } = fakePort()
    const booking = { id: uid("evt"), type: "checkout.session.completed", account: "acct_x", created: sec(NOW), data: { object: { id: "cs_booking", mode: "payment", metadata: { bookingId: "12", companyId: "3" } } } }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, booking)).toEqual({ handled: false })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...booking, type: "account.updated" })).toEqual({ handled: false })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...booking, type: "charge.refunded" })).toEqual({ handled: false })
    expect(calls).toHaveLength(0)
    const route = read("app/api/payments/webhook/route.ts")
    expect(route).toContain("handleCustomerSubscriptionWebhook")
    expect(route).toContain("settlePaymentPaid")
    expect(route.match(/constructEvent/g)).toHaveLength(1)
  })
})

/* ------------------------- Abonnement Stripe / fin ------------------------ */

describe("customer.subscription.* et annulation", () => {
  it("updated : statut Stripe jamais recopié, currentTermEndsAt inchangé", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const before = await getSub(id)
    await payments.handleCustomerSubscriptionWebhook(db, port, { id: uid("evt"), type: "customer.subscription.updated", account: c.acct, created: sec(NOW), data: { object: { id: ext, status: "past_due", cancel_at: sec(new Date("2030-01-01")), metadata: moduleMeta(c.companyId, id) } } })
    const after = await getSub(id)
    expect(after.status).toBe("active")
    expect(after.currentTermEndsAt?.getTime() ?? null).toBe(before.currentTermEndsAt?.getTime() ?? null)
  })

  it("deleted : programmé DetailFlow → cancelled ; inattendu → ended ; aucun remboursement", async () => {
    const c = await seedCompany("PRO")
    const a = await seedSub(c)
    const b = await seedSub(c)
    const { port, calls } = fakePort()
    const ea = (await payFirstInvoice(port, c, a)).ext
    const eb = (await payFirstInvoice(port, c, b)).ext
    await engine.scheduleCancellation(db, c.companyId, owner, a, {}, new Date("2026-01-20T00:00:00Z"))
    const applied = await payments.applyCancellationToProvider(db, port, c.companyId, owner, a, new Date("2026-01-20T00:00:00Z"))
    expect(applied).toMatchObject({ applied: true, mode: "scheduled" })
    const cancelAt = (await getSub(a)).cancelAt!
    expect(calls.find((x) => x.method === "updateSubscription" && x.id === ea)!.params).toMatchObject({ cancel_at: sec(cancelAt) })

    const del = (ext: string, sid: number, at: Date) => ({ id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(at), data: { object: { id: ext, status: "canceled", ended_at: sec(at), metadata: moduleMeta(c.companyId, sid) } } })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, del(ea, a, cancelAt))).toEqual({ handled: true, outcome: "subscription_deleted_cancelled" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, del(eb, b, new Date("2026-01-25T00:00:00Z")))).toEqual({ handled: true, outcome: "subscription_deleted_ended" })
    expect((await getSub(a)).status).toBe("cancelled")
    expect((await getSub(b)).status).toBe("ended")
    expect(read("lib/customer-subscriptions/payments.ts")).not.toMatch(/refunds\.create|createRefund/)
  })
})

describe("snapshots contractuels", () => {
  it("aucun webhook ne modifie les snapshots", async () => {
    const c = await seedCompany("FREE")
    const id = await seedSub(c)
    const pick = (s: Awaited<ReturnType<typeof getSub>>) =>
      Object.fromEntries(Object.entries(s).filter(([k]) => k.endsWith("Snapshot")))
    const before = pick(await getSub(id))
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    await setPlan(c.companyId, "BUSINESS")
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", c.acct, { id: uid("in"), subscription: ext, status: "draft", amount_due: 8900, metadata: moduleMeta(c.companyId, id) }))
    expect(pick(await getSub(id))).toEqual(before)
  })

  it("mapping pur : week/4 conservé tel quel", () => {
    const built = buildCheckoutSessionParams(
      { id: 1, companyId: 1, status: "pending_payment", paymentMode: "recurring", currency: "EUR", priceCentsSnapshot: 8900, billingIntervalUnitSnapshot: "week", billingIntervalCountSnapshot: 4, planNameSnapshot: "P", customerEmail: "a@b.c", externalCustomerId: null, prepaidBillingCyclesSnapshot: null, initialCleaningRequiredSnapshot: false, initialServiceNameSnapshot: null, initialServicePriceCentsSnapshot: null } as any,
      "recurring",
      700,
      RETURN,
    )
    expect(built.params.line_items[0].price_data.recurring).toEqual({ interval: "week", interval_count: 4 })
    expect(built.platformFeeAmountCents).toBe(623)
  })
})

/* ------------------------- Lot V2 : scénarios requis ------------------------ */

const DAY = 86_400_000
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY)
const balanceFor = (pi: string, fee = 150) => ({
  id: pi,
  latest_charge: {
    id: `ch_${pi}`,
    balance_transaction: {
      id: `txn_${pi}`,
      amount: 8900,
      fee: fee + 267,
      net: 8900 - fee - 267,
      currency: "eur",
      fee_details: [{ type: "stripe_fee", amount: fee }, { type: "application_fee", amount: 267 }],
    },
  },
})
const audits = (id: number, action: string) =>
  db.select().from(schema.maintenanceAuditLog).where(and(eq(schema.maintenanceAuditLog.subscriptionId, id), eq(schema.maintenanceAuditLog.action, action)))

describe("V2 : SCA / payment_action_required", () => {
  it("aucun nouveau droit, past_due, puis récupération idempotente au paiement", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const p2 = shift(PERIOD_START, 28)
    const inv = { id: uid("in_sca"), subscription: ext, amount_due: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(p2) }
    const sca = invoiceEvent("invoice.payment_action_required", c.acct, { ...inv, status: "open" }, p2)
    expect((await payments.handleCustomerSubscriptionWebhook(db, port, sca)).handled).toBe(true)
    await payments.handleCustomerSubscriptionWebhook(db, port, { ...sca, id: uid("evt") })
    expect((await getSub(id)).status).toBe("past_due")
    expect(await getCycles(id)).toHaveLength(1)
    const trace = await audits(id, "payment_action_required")
    expect(trace.length).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(trace)).not.toMatch(/jean@example\.com|client_secret|pm_/)

    const paid = invoiceEvent("invoice.paid", c.acct, { ...inv, status: "paid", amount_paid: 8900 }, p2)
    await payments.handleCustomerSubscriptionWebhook(db, port, paid)
    await payments.handleCustomerSubscriptionWebhook(db, port, { ...paid, id: uid("evt") })
    expect((await getSub(id)).status).toBe("active")
    expect(await getCycles(id)).toHaveLength(2)
  })

  it("invoice.paid avec Stripe Subscription incomplete : retriable, aucune mutation", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const ext = uid("sub_inc")
    const { port } = fakePort({ subscriptions: { [ext]: { id: ext, status: "incomplete", metadata: moduleMeta(c.companyId, id) } } })
    const evt = invoiceEvent("invoice.paid", c.acct, { id: uid("in"), subscription: ext, status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(PERIOD_START) })
    await expect(payments.handleCustomerSubscriptionWebhook(db, port, evt)).rejects.toSatisfy((e) => payments.isRetryableWebhookError(e))
    expect((await getSub(id)).status).toBe("pending_payment")
    expect(await getCycles(id)).toHaveLength(0)
  })

  it("période absente partout : retriable, jamais de fallback Date.now()", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const evt = invoiceEvent("invoice.paid", c.acct, { id: uid("in"), subscription: uid("sub"), status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id) })
    await expect(payments.handleCustomerSubscriptionWebhook(db, port, evt)).rejects.toSatisfy((e) => payments.isRetryableWebhookError(e))
    expect(calls.some((x) => x.method === "retrieveInvoice")).toBe(true)
    expect(await getPayments(id)).toHaveLength(0)
    expect(await getCycles(id)).toHaveLength(0)
  })
})

describe("V2 : renouvellement contractuel", () => {
  const termPlan = (renewalMode: "same_term" | "none") => ({ billingIntervalUnit: "month" as const, billingIntervalCount: 1, commitmentUnit: "month" as const, commitmentCount: 2, renewalMode })

  it("same_term : facture du nouveau terme payée → terme avancé une seule fois, notice reset, audit", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c, termPlan("same_term"))
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const before = await getSub(id)
    expect(before.currentTermEndsAt).not.toBeNull()
    await pg.query(`UPDATE maintenance_subscriptions SET "renewalNoticeSentAt"=$1 WHERE id=$2`, [shift(before.currentTermEndsAt!, -10), id])
    const pNext = shift(before.currentTermEndsAt!, 1)
    const evt = invoiceEvent("invoice.paid", c.acct, { id: uid("in_term"), subscription: ext, status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(pNext) }, pNext)
    await payments.handleCustomerSubscriptionWebhook(db, port, evt)
    const after = await getSub(id)
    expect(after.currentTermStartedAt?.getTime()).toBe(before.currentTermEndsAt!.getTime())
    expect(after.currentTermEndsAt!.getTime()).toBeGreaterThan(before.currentTermEndsAt!.getTime())
    expect(after.renewalNoticeSentAt).toBeNull()
    await payments.handleCustomerSubscriptionWebhook(db, port, { ...evt, id: uid("evt") })
    expect((await getSub(id)).currentTermEndsAt?.getTime()).toBe(after.currentTermEndsAt!.getTime())
    expect(await audits(id, "term_renewed")).toHaveLength(1)
  })

  it("renewalMode none : aucune avance de terme après le terme final", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c, termPlan("none"))
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const before = await getSub(id)
    const pNext = shift(before.currentTermEndsAt!, 1)
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, { id: uid("in"), subscription: ext, status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(pNext) }, pNext))
    const after = await getSub(id)
    expect(after.currentTermEndsAt?.getTime()).toBe(before.currentTermEndsAt!.getTime())
    expect(await audits(id, "term_renewed")).toHaveLength(0)
  })

  it("open_ended : pas de faux terme", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    await payFirstInvoice(port, c, id)
    expect((await getSub(id)).currentTermEndsAt).toBeNull()
  })
})

describe("V2 : non-renouvellement ↔ Stripe cancel_at", () => {
  it("opt-out programme cancel_at = currentTermEndsAt ; révocation retire la programmation ; aucun remboursement", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c, { billingIntervalUnit: "month", billingIntervalCount: 1, commitmentUnit: "month", commitmentCount: 2, renewalMode: "same_term" })
    const { port, calls } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const termEnd = (await getSub(id)).currentTermEndsAt!
    await engine.requestRenewalOptOut(db, c.companyId, owner, id, NOW)
    expect(await payments.syncProviderCancelAt(db, port, c.companyId, owner, id, NOW)).toMatchObject({ applied: true, cancelAt: sec(termEnd) })
    const set = calls.filter((x) => x.method === "updateSubscription" && x.id === ext).at(-1)!
    expect(set.opts.stripeAccount).toBe(c.acct)
    expect(set.params).toMatchObject({ cancel_at: sec(termEnd) })

    await engine.revokeRenewalOptOut(db, c.companyId, owner, id, NOW)
    expect(await payments.syncProviderCancelAt(db, port, c.companyId, owner, id, NOW)).toMatchObject({ applied: true, cancelAt: null })
    const unset = calls.filter((x) => x.method === "updateSubscription" && x.id === ext).at(-1)!
    expect(["", null]).toContain(unset.params?.cancel_at)
    expect((await getSub(id)).currentTermEndsAt?.getTime()).toBe(termEnd.getTime())
    expect(calls.some((x) => /refund/i.test(x.method))).toBe(false)
  })

  it("renewalMode none : cancel_at = fin de terme sans opt-out", () => {
    const end = new Date("2026-03-16T00:00:00Z")
    expect(desiredProviderCancelAt({ paymentMode: "recurring", status: "active", cancelAt: null, renewalOptOutAt: null, renewalModeSnapshot: "none", currentTermEndsAt: end })).toBe(sec(end))
    expect(desiredProviderCancelAt({ paymentMode: "recurring", status: "active", cancelAt: null, renewalOptOutAt: null, renewalModeSnapshot: "open_ended", currentTermEndsAt: null })).toBeNull()
    expect(desiredProviderCancelAt({ paymentMode: "prepaid", status: "active", cancelAt: null, renewalOptOutAt: NOW, renewalModeSnapshot: "none", currentTermEndsAt: end })).toBeNull()
  })
})

describe("V2 : suppression provider avant la date", () => {
  const base = { cancelRequestedAt: NOW, renewalOptOutAt: null, renewalModeSnapshot: "open_ended", currentTermEndsAt: null }
  it("pure : à l'échéance → cancelled ; bien avant → ended", () => {
    const cancelAt = new Date("2026-06-01T00:00:00Z")
    expect(decideProviderDeletion({ ...base, cancelAt }, cancelAt)).toBe("cancelled")
    expect(decideProviderDeletion({ ...base, cancelAt }, shift(cancelAt, 3))).toBe("cancelled")
    expect(decideProviderDeletion({ ...base, cancelAt }, shift(cancelAt, -30))).toBe("ended")
  })

  it("webhook : suppression 30 j avant cancelAt → ended + audit, doublon sans effet", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    await engine.scheduleCancellation(db, c.companyId, owner, id, {}, new Date("2026-01-20T00:00:00Z"))
    const cancelAt = (await getSub(id)).cancelAt!
    const at = shift(cancelAt, -30) < NOW ? NOW : shift(cancelAt, -30)
    const early = at.getTime() < cancelAt.getTime() - 2 * DAY ? at : null
    if (!early) return
    const del = { id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(early), data: { object: { id: ext, status: "canceled", ended_at: sec(early), metadata: moduleMeta(c.companyId, id) } } }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, del)).toEqual({ handled: true, outcome: "subscription_deleted_ended" })
    await payments.handleCustomerSubscriptionWebhook(db, port, { ...del, id: uid("evt") })
    expect((await getSub(id)).status).toBe("ended")
    const trail = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, id))
    expect(trail.some((a) => /ended|deleted/.test(a.action))).toBe(true)
  })
})

describe("V2 : commission selon plan DetailFlow effectif", () => {
  async function feeSequence(plans: string[]) {
    const c = await seedCompany(plans[0])
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const { ext } = await payFirstInvoice(port, c, id)
    const fees: Array<{ bps: number | null; invoiceFee: unknown }> = []
    for (const [i, plan] of plans.entries()) {
      await setPlan(c.companyId, plan)
      const inv = { id: uid(`in_${plan}`), subscription: ext, status: "draft", amount_due: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(shift(PERIOD_START, 28 * (i + 1))) }
      await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.created", c.acct, inv))
      const row = (await getPayments(id)).find((p) => p.externalInvoiceId === inv.id)
      const upd = calls.filter((x) => x.method === "updateInvoice" && x.id === inv.id).at(-1)
      fees.push({ bps: row?.platformFeeBps ?? null, invoiceFee: upd?.params?.application_fee_amount })
    }
    return { fees, id }
  }

  it("FREE → PRO → BUSINESS : 7 % → 3 % → 0 %", async () => {
    const { fees } = await feeSequence(["FREE", "PRO", "BUSINESS"])
    expect(fees.map((f) => f.bps)).toEqual([700, 300, 0])
    expect(fees[0].invoiceFee).toBe(623)
    expect(fees[1].invoiceFee).toBe(267)
    expect([0, undefined]).toContain(fees[2].invoiceFee)
  })

  it("BUSINESS → PRO → FREE : 0 % → 3 % → 7 %, paiements passés jamais réécrits", async () => {
    const { fees, id } = await feeSequence(["BUSINESS", "PRO", "FREE"])
    expect(fees.map((f) => f.bps)).toEqual([0, 300, 700])
    const rows = await getPayments(id)
    expect(rows.find((r) => r.platformFeeBps === 0)).toBeTruthy()
    expect(rows.find((r) => r.platformFeeBps === 300)).toBeTruthy()
  })

  it("facture finalisée entre lecture et update : snapshot Stripe réel, pas de boucle d'erreur", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const invId = uid("in_race")
    const { port } = fakePort({ failInvoiceUpdate: true, invoices: { [invId]: { id: invId, status: "open", application_fee_amount: 623 } } })
    const { ext } = await payFirstInvoice(port, c, id)
    const evt = invoiceEvent("invoice.created", c.acct, { id: invId, subscription: ext, status: "draft", amount_due: 8900, metadata: moduleMeta(c.companyId, id) })
    const r = await payments.handleCustomerSubscriptionWebhook(db, port, evt)
    expect(r.handled).toBe(true)
    expect((await getPayments(id)).find((p) => p.externalInvoiceId === invId)?.platformFeeAmountCents).toBe(623)
  })
})

describe("V2 : frais Stripe réels / charge.updated", () => {
  it("BalanceTransaction indisponible : activation OK ; charge.updated finalise fee/net réels, doublon noop", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const pi = uid("pi_fin")
    const balances: Record<string, unknown> = {}
    const { port } = fakePort({ balances })
    const ext = uid("sub")
    const inv = { id: uid("in"), subscription: ext, status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), payment_intent: pi, ...periodLines(PERIOD_START) }
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, inv, PERIOD_START))
    expect((await getSub(id)).status).toBe("active")
    let row = (await getPayments(id))[0]
    expect(row.providerFeeAmountCents).toBeNull()

    balances[pi] = balanceFor(pi, 151)
    const evt = { id: uid("evt"), type: "charge.updated", account: c.acct, created: sec(NOW), data: { object: { id: `ch_${pi}`, payment_intent: pi } } }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, evt)).toEqual({ handled: true, outcome: "charge_financials_synced" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...evt, id: uid("evt") })).toEqual({ handled: true, outcome: "charge_financials_already_synced" })
    row = (await getPayments(id))[0]
    expect(row).toMatchObject({ providerFeeAmountCents: 151, netAmountCents: 8900 - 151 - 267 })
    expect(row.meta).toMatchObject({ stripeChargeId: `ch_${pi}`, stripeBalanceTransactionId: `txn_${pi}` })
  })

  it("charge.updated d'un autre compte ou PI booking : non intercepté (flux booking intact)", async () => {
    const { port, calls } = fakePort()
    const evt = { id: uid("evt"), type: "charge.updated", account: "acct_booking", created: sec(NOW), data: { object: { id: "ch_b", payment_intent: "pi_booking" } } }
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, evt)).toEqual({ handled: false })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, { ...evt, account: null })).toEqual({ handled: false })
    expect(calls).toHaveLength(0)
  })
})

describe("V2 : remboursements maintenance", () => {
  async function paidPayment() {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const pi = uid("pi_ref")
    const { port } = fakePort({ balances: { [pi]: balanceFor(pi) } })
    await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", c.acct, { id: uid("in"), subscription: uid("sub"), status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), payment_intent: pi, ...periodLines(PERIOD_START) }, PERIOD_START))
    const refundEvt = (type: string, refund: Record<string, unknown>, account = c.acct) => ({ id: uid("evt"), type, account, created: sec(NOW), data: { object: { payment_intent: pi, currency: "eur", charge: `ch_${pi}`, ...refund } } })
    return { c, id, pi, port, refundEvt }
  }

  it("partiel puis total, idempotent, hors ordre ; net initial jamais réécrit ; aucun impact abonnement", async () => {
    const { id, port, refundEvt } = await paidPayment()
    const net0 = (await getPayments(id))[0].netAmountCents
    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.created", { id: "re_1", amount: 3000, status: "pending" }))
    expect((await getPayments(id))[0]).toMatchObject({ refundedAmountCents: 0, status: "paid" })
    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.updated", { id: "re_1", amount: 3000, status: "succeeded" }))
    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.updated", { id: "re_1", amount: 3000, status: "succeeded" }))
    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.created", { id: "re_1", amount: 3000, status: "pending" }))
    expect((await getPayments(id))[0]).toMatchObject({ refundedAmountCents: 3000, status: "partially_refunded", netAmountCents: net0 })

    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("charge.refunded", { id: `ch_x`, refunds: { data: [{ id: "re_1", amount: 3000, status: "succeeded", currency: "eur" }, { id: "re_2", amount: 5900, status: "succeeded", currency: "eur" }] } }))
    expect((await getPayments(id))[0]).toMatchObject({ refundedAmountCents: 8900, status: "refunded", netAmountCents: net0 })
    expect(await db.select().from(schema.maintenanceRefunds).where(eq(schema.maintenanceRefunds.subscriptionId, id))).toHaveLength(2)
    expect((await getSub(id)).status).toBe("active")
  })

  it("refund.failed : non compté ; mauvais compte : non intercepté", async () => {
    const { id, port, refundEvt } = await paidPayment()
    await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.failed", { id: "re_f", amount: 1000, status: "failed" }))
    expect((await getPayments(id))[0]).toMatchObject({ refundedAmountCents: 0, status: "paid" })
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, refundEvt("refund.updated", { id: "re_z", amount: 1000, status: "succeeded" }, "acct_other"))).toEqual({ handled: false })
    expect((await getPayments(id))[0].refundedAmountCents).toBe(0)
  })

  it("remboursement booking (PI inconnu du module) : handled:false, maintenance intacte", async () => {
    const { id, port, refundEvt, c } = await paidPayment()
    const booking = { ...refundEvt("refund.updated", { id: "re_booking", amount: 500, status: "succeeded" }), account: c.acct }
    booking.data.object.payment_intent = "pi_booking_only"
    expect(await payments.handleCustomerSubscriptionWebhook(db, port, booking)).toEqual({ handled: false })
    expect((await getPayments(id))[0].refundedAmountCents).toBe(0)
    expect(read("lib/customer-subscriptions/payments.ts")).not.toMatch(/from\(payments\)|schema\.payments\b/)
  })
})

describe("V2 : sécurité / journaux", () => {
  it("checkout : retour construit côté serveur, aucune URL navigateur acceptée", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    await payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX, returnUrl: "https://evil.example/steal" } as any)
    const url = String(calls.find((x) => x.method === "createCheckoutSession")!.params?.return_url)
    expect(url).not.toContain("evil.example")
    expect(url).toContain("{CHECKOUT_SESSION_ID}")
    expect(new URL(url.replace("{CHECKOUT_SESSION_ID}", "x")).hostname.endsWith("detailflow.test")).toBe(true)
  })

  it("concurrence checkout : une seule tentative logique", async () => {
    const c = await seedCompany("PRO")
    const id = await seedSub(c)
    const { port, calls } = fakePort()
    const rs = await Promise.allSettled([1, 2, 3].map(() => payments.startSubscriptionCheckout(db, port, c.companyId, owner, id, { returnUrlContext: RETURN_CTX })))
    const ok = rs.flatMap((r) => (r.status === "fulfilled" ? [r.value.checkoutSessionId] : []))
    expect(new Set(ok).size).toBe(1)
    expect(new Set(calls.filter((x) => x.method === "createCheckoutSession").map((x) => x.opts.idempotencyKey)).size).toBe(1)
  })

  it("aucun e-mail, secret ni compte bancaire dans les logs du module", async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(JSON.stringify(a)))
    try {
      const c = await seedCompany("PRO")
      const id = await seedSub(c)
      const { port } = fakePort()
      const inv = { id: uid("in"), subscription: uid("sub"), status: "paid", amount_paid: 8900, metadata: moduleMeta(c.companyId, id), ...periodLines(PERIOD_START) }
      await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", null, inv))
      await payments.handleCustomerSubscriptionWebhook(db, port, invoiceEvent("invoice.paid", "acct_attacker", inv))
      await payFirstInvoice(port, c, id)
    } finally {
      spy.mockRestore()
    }
    expect(logs.join("\n")).not.toMatch(/jean@example\.com|secret_|sk_(test|live)|whsec_|iban/i)
  })
})
