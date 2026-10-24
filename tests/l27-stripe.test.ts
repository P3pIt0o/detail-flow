import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import * as payments from "@/lib/customer-subscriptions/payments"
import { computePlatformFeeAmountCents } from "@/lib/customer-subscriptions/contract"
import { addMonthsUTC } from "@/lib/customer-subscriptions/dates"
import type { PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const ANCHOR = new Date("2026-10-23T09:00:00.000Z")
const sec = (d: Date) => Math.floor(d.getTime() / 1000)
const PRO_BPS = 300

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

type Call = { method: string; id?: string; params?: Record<string, unknown>; opts: payments.StripeCallOptions }

function fakePort(init: { failItemOnInvoice?: boolean; invoices?: Record<string, Record<string, unknown>>; missingItems?: boolean; failDelete?: { remaining: number } } = {}) {
  const calls: Call[] = []
  const pis = new Map<string, payments.PaymentIntentLike>()
  const itemsByKey = new Map<string, { id: string }>()
  const port: payments.CustomerSubscriptionStripePort = {
    async createCheckoutSession(params, opts) {
      calls.push({ method: "createCheckoutSession", params, opts })
      return { id: uid("cs"), status: "open" }
    },
    async retrieveCheckoutSession(id, opts) {
      calls.push({ method: "retrieveCheckoutSession", id, opts })
      return { id, status: "complete" }
    },
    async retrieveSubscription(id, opts) {
      calls.push({ method: "retrieveSubscription", id, opts })
      return { id, status: "active", metadata: {} }
    },
    async updateSubscription(id, params, opts) {
      calls.push({ method: "updateSubscription", id, params, opts })
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
      return { id }
    },
    async retrieveInvoice(id, opts) {
      calls.push({ method: "retrieveInvoice", id, opts })
      return (init.invoices?.[id] ?? { id }) as never
    },
    async retrievePaymentIntentWithBalance(id, opts) {
      calls.push({ method: "retrievePaymentIntentWithBalance", id, opts })
      return { id, latest_charge: null }
    },
    async createInvoiceItem(params, opts) {
      calls.push({ method: "createInvoiceItem", params, opts })
      if (init.failItemOnInvoice && params.invoice) throw new Error("invoice_not_editable")
      // Idempotence Stripe simulée : même clé → même objet.
      const key = opts.idempotencyKey ?? uid("nokey")
      if (!itemsByKey.has(key)) itemsByKey.set(key, { id: uid("ii") })
      return itemsByKey.get(key)!
    },
    async deleteInvoiceItem(id, opts) {
      calls.push({ method: "deleteInvoiceItem", id, opts })
      if (init.failDelete && init.failDelete.remaining-- > 0) throw new Error("stripe_unavailable")
      if (init.missingItems) throw Object.assign(new Error("No such invoiceitem"), { code: "resource_missing" })
      return { id, deleted: true }
    },
  }
  return { port, calls, pis }
}

async function seedCompany() {
  const acct = uid("acct_test")
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ('PRO',$1,true,true) RETURNING id`,
    [acct],
  )
  const companyId = r.rows[0].id
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  return { companyId, acct, serviceId: s.rows[0].id }
}

const SERENITE: PlanConfigInput = {
  name: "Formule Sérénité",
  priceCents: 35_900,
  currency: "EUR",
  billingIntervalUnit: "month",
  billingIntervalCount: 12,
  includedUsesPerCycle: 6,
  commitmentUnit: "month",
  commitmentCount: 12,
  renewalMode: "same_term",
  rightsPeriodMonths: 12,
  paymentSchedule: "monthly",
  status: "active",
}

async function seedSub(c: Awaited<ReturnType<typeof seedCompany>>, plan: PlanConfigInput = SERENITE, choice?: string) {
  const { planId } = await engine.createPlan(db, c.companyId, owner, { ...plan, includedServiceId: c.serviceId })
  const { subscriptionId } = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Julie", email: "julie@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", paymentScheduleChoice: choice, idempotencyKey: uid("idem-key-xxxxxxxx") },
    new Date(ANCHOR.getTime() - 60_000),
  )
  return subscriptionId
}

const meta = (companyId: number, subscriptionId: number) => ({ detailflowModule: "customer_subscription", companyId: String(companyId), maintenanceSubscriptionId: String(subscriptionId) })

function invoiceEvent(type: string, account: string | null, inv: Record<string, unknown>, created: Date) {
  const { subscription, metadata, payment_intent, ...rest } = inv
  const object = {
    currency: "eur",
    customer: "cus_test",
    ...rest,
    parent: { subscription_details: { subscription: subscription ?? null, metadata: metadata ?? null } },
    ...(payment_intent ? { payments: { data: [{ payment: { payment_intent } }] } } : {}),
  }
  return { id: uid("evt"), type, account, created: sec(created), data: { object } }
}

const monthStart = (k: number) => addMonthsUTC(ANCHOR, k)
const lines = (k: number, months = 1) => ({ lines: { data: [{ period: { start: sec(monthStart(k)), end: sec(monthStart(k + months)) } }] } })

/** Active l'abonnement : 1re mensualité payée (ancre = début de période Stripe). */
async function activate(f: ReturnType<typeof fakePort>, c: Awaited<ReturnType<typeof seedCompany>>, subId: number, amount: number, months = 1) {
  const ext = uid("sub_test")
  const pi = uid("pi")
  f.pis.set(pi, { id: pi, application_fee_amount: computePlatformFeeAmountCents(amount, PRO_BPS) })
  const inv = { id: uid("in"), subscription: ext, status: "paid", amount_paid: amount, amount_due: amount, payment_intent: pi, metadata: meta(c.companyId, subId), ...lines(0, months) }
  const r = await payments.handleCustomerSubscriptionWebhook(db, f.port, invoiceEvent("invoice.paid", c.acct, inv, ANCHOR))
  expect(r).toMatchObject({ handled: true })
  return ext
}

const draft = (c: Awaited<ReturnType<typeof seedCompany>>, subId: number, ext: string, k: number, amount: number, status = "draft") =>
  invoiceEvent("invoice.created", c.acct, { id: uid("in"), subscription: ext, status, amount_due: amount, total: amount, metadata: meta(c.companyId, subId), ...lines(k) }, monthStart(k))

const itemCalls = (f: ReturnType<typeof fakePort>) => f.calls.filter((x) => x.method === "createInvoiceItem")

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
  await pg.exec(read("scripts/maintenance-rights-period-migration.sql"))
  db = drizzle(pg, { schema }) as unknown as engine.Executor
})

describe("dernière échéance : ligne d'ajustement sur la facture brouillon", () => {
  it("359 € : −4 c uniquement sur la 12e et la 24e mensualité, sur la facture elle-même", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    const adjusted: number[] = []
    for (let k = 1; k < 24; k++) {
      const ev = draft(c, subId, ext, k, 2992)
      const before = itemCalls(f).length
      await payments.handleCustomerSubscriptionWebhook(db, f.port, ev)
      if (itemCalls(f).length > before) adjusted.push(k)
    }
    expect(adjusted).toEqual([11, 23])
    for (const call of itemCalls(f)) {
      expect(call.params).toMatchObject({ amount: -4, currency: "eur", customer: "cus_test" })
      expect(call.params?.invoice).toMatch(/^in_/)
      expect(call.params).not.toHaveProperty("subscription")
      expect(call.params).not.toHaveProperty("discounts")
      expect(call.opts).toMatchObject({ stripeAccount: c.acct, idempotencyKey: `df-sub-last-inst:${call.params!.invoice}` })
    }
  })

  it("commission calculée sur le montant réellement facturé (29,88 €)", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    const ev = draft(c, subId, ext, 11, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, ev)
    const upd = f.calls.find((x) => x.method === "updateInvoice" && x.id === String((ev.data.object as Record<string, unknown>).id))
    expect(upd?.params?.application_fee_amount).toBe(computePlatformFeeAmountCents(2988, PRO_BPS))
    const [p] = await db.select().from(schema.maintenancePayments).where(eq(schema.maintenancePayments.externalInvoiceId, String((ev.data.object as Record<string, unknown>).id)))
    expect(p.grossAmountCents).toBe(2988)
  })

  it("361 € : +4 c (dernière plus haute)", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c, { ...SERENITE, priceCents: 36_100 })
    const f = fakePort()
    const ext = await activate(f, c, subId, 3008)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 3008))
    expect(itemCalls(f).map((x) => x.params?.amount)).toEqual([4])
  })

  it("webhook rejoué : une seule ligne", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    const ev = draft(c, subId, ext, 11, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, ev)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, ev)
    expect(itemCalls(f)).toHaveLength(1)
    const audits = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, subId))
    expect(audits.filter((a) => a.action === "last_installment_adjusted")).toHaveLength(1)
  })

  it("aucun appel : prix divisible, « en une fois », formule V1", async () => {
    const c = await seedCompany()
    const f = fakePort()
    const even = await seedSub(c, { ...SERENITE, priceCents: 36_000 })
    const extEven = await activate(f, c, even, 3000)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, even, extEven, 11, 3000))
    const yearly = await seedSub(c, { ...SERENITE, paymentSchedule: "customer_choice" }, "period")
    const extYearly = await activate(f, c, yearly, 35_900, 12)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, invoiceEvent("invoice.created", c.acct, { id: uid("in"), subscription: extYearly, status: "draft", amount_due: 35_900, metadata: meta(c.companyId, yearly), ...lines(12, 12) }, monthStart(12)))
    const v1 = await seedSub(c, { ...SERENITE, priceCents: 4900, billingIntervalCount: 1, commitmentUnit: "none", commitmentCount: 0, renewalMode: "open_ended", rightsPeriodMonths: undefined, paymentSchedule: undefined })
    const extV1 = await activate(f, c, v1, 4900)
    for (let k = 1; k <= 12; k++) await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, v1, extV1, k, 4900))
    expect(itemCalls(f)).toHaveLength(0)
  })
})

describe("repli : facture déjà finalisée → ligne rattachée à l'abonnement, supprimée à la fin", () => {
  it("facture finalisée : ligne sur l'abonnement (jamais libre sur le Customer)", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 2992, "open"))
    expect(itemCalls(f)).toHaveLength(1)
    expect(itemCalls(f)[0].params).toMatchObject({ amount: -4, subscription: ext, customer: "cus_test" })
    expect(itemCalls(f)[0].params).not.toHaveProperty("invoice")
  })

  it("course (brouillon finalisé pendant l'appel) : repli sur l'abonnement", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f0 = fakePort()
    const ext = await activate(f0, c, subId, 2992)
    const ev = draft(c, subId, ext, 11, 2992)
    const id = String((ev.data.object as Record<string, unknown>).id)
    const f = fakePort({ failItemOnInvoice: true, invoices: { [id]: { id, status: "open", amount_due: 2992 } } })
    await payments.handleCustomerSubscriptionWebhook(db, f.port, ev)
    expect(itemCalls(f).map((x) => (x.params?.invoice ? "invoice" : x.params?.subscription ? "subscription" : "free"))).toEqual(["invoice", "subscription"])
  })

  it("abonnement arrêté avant la dernière échéance : la ligne en attente est supprimée, rejeu sans erreur", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 2992, "open"))
    const itemId = (await f.port.createInvoiceItem!({}, { stripeAccount: c.acct, idempotencyKey: itemCalls(f)[0].opts.idempotencyKey })).id
    const deleted = { id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(monthStart(11)), data: { object: { id: ext, status: "canceled", metadata: meta(c.companyId, subId), canceled_at: sec(monthStart(11)) } } }
    await payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)
    const dels = f.calls.filter((x) => x.method === "deleteInvoiceItem")
    expect(dels.map((d) => d.id)).toEqual([itemId])
    expect(dels[0].opts.stripeAccount).toBe(c.acct)
  })

  it("Stripe indisponible pour la suppression : le contrat est quand même terminé, la suppression est rejouée", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort({ failDelete: { remaining: 1 } })
    const ext = await activate(f, c, subId, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 2992, "open"))
    const deleted = { id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(monthStart(11)), data: { object: { id: ext, status: "canceled", metadata: meta(c.companyId, subId), canceled_at: sec(monthStart(11)) } } }
    await expect(payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)).rejects.toThrow()
    const [after] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, subId))
    expect(["cancelled", "ended", "expired"]).toContain(after.status)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)
    expect(f.calls.filter((x) => x.method === "deleteInvoiceItem")).toHaveLength(2)
    const audits = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, subId))
    expect(audits.filter((a) => a.action === "last_installment_adjustment_deleted")).toHaveLength(1)
  })

  it("ligne déjà absente chez Stripe : suppression considérée faite (pas de boucle de webhook)", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort({ missingItems: true })
    const ext = await activate(f, c, subId, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 2992, "open"))
    const deleted = { id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(monthStart(11)), data: { object: { id: ext, status: "canceled", metadata: meta(c.companyId, subId), canceled_at: sec(monthStart(11)) } } }
    await expect(payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)).resolves.toMatchObject({ handled: true })
    const audits = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, subId))
    expect(audits.filter((a) => a.action === "last_installment_adjustment_deleted")).toHaveLength(1)
  })

  it("ligne posée sur la facture elle-même : rien à supprimer à la fin", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    await payments.handleCustomerSubscriptionWebhook(db, f.port, draft(c, subId, ext, 11, 2992))
    const deleted = { id: uid("evt"), type: "customer.subscription.deleted", account: c.acct, created: sec(monthStart(12)), data: { object: { id: ext, status: "canceled", metadata: meta(c.companyId, subId), canceled_at: sec(monthStart(12)) } } }
    await payments.handleCustomerSubscriptionWebhook(db, f.port, deleted)
    expect(f.calls.filter((x) => x.method === "deleteInvoiceItem")).toHaveLength(0)
  })
})

describe("séparation avec la fidélité SaaS", () => {
  it("un événement plateforme (sans compte connecté) n'ajoute aucune ligne", async () => {
    const c = await seedCompany()
    const subId = await seedSub(c)
    const f = fakePort()
    const ext = await activate(f, c, subId, 2992)
    const platform = draft(c, subId, ext, 11, 2992)
    ;(platform as { account: string | null }).account = null
    ;(platform.data.object as Record<string, unknown>).discounts = ["di_loyalty"]
    await payments.handleCustomerSubscriptionWebhook(db, f.port, platform)
    expect(itemCalls(f)).toHaveLength(0)
  })

  it("le webhook SaaS de fidélité et le module abonnements clients ne se référencent pas", () => {
    const saas = read("lib/billing/subscription-webhook.ts")
    expect(saas).not.toMatch(/customer-subscriptions/)
    const pay = read("lib/customer-subscriptions/payments.ts")
    expect(pay).not.toMatch(/loyalty|discounts/)
    expect(read("app/api/billing/webhook/route.ts")).not.toMatch(/customer-subscriptions/)
  })
})
