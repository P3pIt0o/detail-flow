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
import { drainCustomerSubscriptionOutbox, type EmailSender } from "@/lib/customer-subscriptions/notifications"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const NOW = new Date("2026-01-15T10:00:00.000Z")
const PERIOD_START = new Date("2026-01-16T00:00:00.000Z")
const DAY = 86_400_000
const sec = (d: Date) => Math.floor(d.getTime() / 1000)

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

function fakePort(): payments.CustomerSubscriptionStripePort {
  return {
    async createCheckoutSession() {
      throw new Error("not used")
    },
    async retrieveCheckoutSession(id: string) {
      return { id, status: "complete", metadata: {} }
    },
    async retrieveSubscription(id: string) {
      return { id, status: "active", metadata: {} }
    },
    async updateSubscription(id: string) {
      return { id }
    },
    async cancelSubscription(id: string) {
      return { id, status: "canceled" }
    },
    async retrievePaymentIntent(id: string) {
      return { id, application_fee_amount: 0 }
    },
    async retrieveInvoice(id: string) {
      return { id } as never
    },
    async retrievePaymentIntentWithBalance(id: string) {
      return { id, latest_charge: null } as never
    },
  } as unknown as payments.CustomerSubscriptionStripePort
}

const moduleMeta = (companyId: number, subscriptionId: number) => ({
  detailflowModule: "customer_subscription",
  companyId: String(companyId),
  maintenanceSubscriptionId: String(subscriptionId),
})

function invoiceEvent(type: string, account: string, inv: Record<string, unknown>, created = NOW) {
  const { subscription, metadata, payment_intent, ...rest } = inv
  return {
    id: uid("evt"),
    type,
    account,
    created: sec(created),
    data: {
      object: {
        currency: "eur",
        ...rest,
        parent: { subscription_details: { subscription: subscription ?? null, metadata: metadata ?? null } },
        ...(payment_intent ? { payments: { data: [{ payment: { payment_intent } }] } } : {}),
      },
    },
  }
}

const periodLines = (start: Date) => ({ lines: { data: [{ period: { start: sec(start), end: sec(new Date(start.getTime() + 28 * DAY)) } }] } })

async function seed() {
  const acct = uid("acct_test")
  const companyId = (
    await pg.query<{ id: number }>(
      `INSERT INTO companies (slug,"licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,'PRO',$2,true,true) RETURNING id`,
      [uid("tenant"), acct],
    )
  ).rows[0].id
  await pg.query(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,'Atelier <b>&amp;</b>','pro@atelier.test')`, [companyId])
  const serviceId = (await pg.query<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])).rows[0].id
  const { planId } = await engine.createPlan(db, companyId, owner, {
    name: "Entretien Premium",
    priceCents: 8900,
    currency: "EUR",
    billingIntervalUnit: "week",
    billingIntervalCount: 4,
    includedUsesPerCycle: 1,
    includedServiceId: serviceId,
    commitmentUnit: "none",
    commitmentCount: 0,
    renewalMode: "open_ended",
    status: "active",
  })
  const { subscriptionId } = await engine.createSubscription(
    db,
    companyId,
    owner,
    { planId, customer: { name: "Jean <script>x</script>", email: "jean@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") },
    NOW,
  )
  return { companyId, acct, planId, id: subscriptionId, port: fakePort(), ext: uid("sub_test") }
}

type Ctx = Awaited<ReturnType<typeof seed>>

async function payInvoice(c: Ctx, start: Date, pi = uid("pi")) {
  const inv = { id: uid("in"), subscription: c.ext, status: "paid", amount_paid: 8900, amount_due: 8900, payment_intent: pi, metadata: moduleMeta(c.companyId, c.id), ...periodLines(start) }
  const evt = invoiceEvent("invoice.paid", c.acct, inv, start)
  const r = await payments.handleCustomerSubscriptionWebhook(db, c.port, evt)
  return { r, evt, pi }
}

const outbox = (subscriptionId: number) =>
  db.select().from(schema.maintenanceSubscriptionEmailOutbox).where(eq(schema.maintenanceSubscriptionEmailOutbox.subscriptionId, subscriptionId))
const types = async (id: number) => (await outbox(id)).map((r) => r.type).sort()
const count = async (id: number, type: string) => (await outbox(id)).filter((r) => r.type === type).length

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "detailflow.test")
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text, status text NOT NULL DEFAULT 'ACTIVE', "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE settings (id serial PRIMARY KEY, "companyId" integer NOT NULL UNIQUE, "businessName" text, "businessEmail" text);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
  `)
  for (const f of [
    "scripts/customer-subscriptions-schema-migration.sql",
    "scripts/customer-subscriptions-runtime-core-migration.sql",
    "scripts/customer-subscriptions-stripe-refunds-migration.sql",
    "scripts/customer-subscriptions-ui-v1-migration.sql",
  ]) {
    await pg.exec(read(f))
  }
  db = drizzle(pg, { schema }) as unknown as engine.Executor
})

describe("webhook → outbox (après état métier persisté)", () => {
  it("1re facture payée : activation client + pro (le 1er paiement est inclus dans l email d activation) ; rejeu (nouvel event id) => aucun doublon", async () => {
    const c = await seed()
    expect(await outbox(c.id)).toHaveLength(0)
    const { r, evt } = await payInvoice(c, PERIOD_START)
    expect(r.handled).toBe(true)
    expect((await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, c.id)))[0].status).toBe("active")
    expect(await types(c.id)).toEqual(["subscription_activated", "subscription_activated_pro"])

    await payments.handleCustomerSubscriptionWebhook(db, c.port, { ...evt, id: uid("evt") })
    await payments.handleCustomerSubscriptionWebhook(db, c.port, evt)
    expect(await outbox(c.id)).toHaveLength(2)
  })

  it("renouvellement payé : un email paiement réussi, aucune nouvelle activation", async () => {
    const c = await seed()
    await payInvoice(c, PERIOD_START)
    const { evt } = await payInvoice(c, new Date(PERIOD_START.getTime() + 28 * DAY))
    await payments.handleCustomerSubscriptionWebhook(db, c.port, { ...evt, id: uid("evt") })
    expect(await count(c.id, "payment_succeeded")).toBe(1)
    expect(await count(c.id, "subscription_activated")).toBe(1)
  })

  it("paiement échoué : client + pro, une fois par tentative ; rejeu => zéro", async () => {
    const c = await seed()
    await payInvoice(c, PERIOD_START)
    const p2 = new Date(PERIOD_START.getTime() + 28 * DAY)
    const inv = { id: uid("in_f"), subscription: c.ext, status: "open", amount_due: 8900, attempt_count: 1, payment_intent: uid("pi_f"), metadata: moduleMeta(c.companyId, c.id), ...periodLines(p2) }
    const failed = invoiceEvent("invoice.payment_failed", c.acct, inv, p2)
    await payments.handleCustomerSubscriptionWebhook(db, c.port, failed)
    await payments.handleCustomerSubscriptionWebhook(db, c.port, { ...failed, id: uid("evt") })
    expect(await count(c.id, "payment_failed")).toBe(1)
    expect(await count(c.id, "payment_failed_pro")).toBe(1)
    expect((await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, c.id)))[0].status).toBe("past_due")
  })

  it("SCA (payment_action_required) : un seul email client, aucun email pro, rejeu sans effet", async () => {
    const c = await seed()
    await payInvoice(c, PERIOD_START)
    const p2 = new Date(PERIOD_START.getTime() + 28 * DAY)
    const inv = { id: uid("in_sca"), subscription: c.ext, status: "open", amount_due: 8900, attempt_count: 1, payment_intent: uid("pi_sca"), metadata: moduleMeta(c.companyId, c.id), ...periodLines(p2) }
    const sca = invoiceEvent("invoice.payment_action_required", c.acct, inv, p2)
    await payments.handleCustomerSubscriptionWebhook(db, c.port, sca)
    await payments.handleCustomerSubscriptionWebhook(db, c.port, { ...sca, id: uid("evt") })
    const rows = (await outbox(c.id)).filter((r) => r.type === "payment_action_required")
    expect(rows).toHaveLength(1)
    expect(rows[0].recipientRole).toBe("client")
    expect(JSON.stringify(rows[0].payload)).not.toMatch(/client_secret|pi_sca|pm_/)
  })

  it("remboursement : pending => rien ; succeeded => un email ; rejeux (refund.updated, charge.refunded) => un seul", async () => {
    const c = await seed()
    const { pi } = await payInvoice(c, PERIOD_START)
    const refundEvt = (type: string, object: Record<string, unknown>) => ({ id: uid("evt"), type, account: c.acct, created: sec(NOW), data: { object: { payment_intent: pi, currency: "eur", charge: `ch_${pi}`, ...object } } })
    await payments.handleCustomerSubscriptionWebhook(db, c.port, refundEvt("refund.created", { id: "re_a", amount: 3000, status: "pending" }))
    expect(await count(c.id, "refund_succeeded")).toBe(0)
    await payments.handleCustomerSubscriptionWebhook(db, c.port, refundEvt("refund.updated", { id: "re_a", amount: 3000, status: "succeeded" }))
    await payments.handleCustomerSubscriptionWebhook(db, c.port, refundEvt("refund.updated", { id: "re_a", amount: 3000, status: "succeeded" }))
    await payments.handleCustomerSubscriptionWebhook(db, c.port, refundEvt("charge.refunded", { id: `ch_${pi}`, refunds: { data: [{ id: "re_a", amount: 3000, status: "succeeded", currency: "eur" }] } }))
    const rows = (await outbox(c.id)).filter((r) => r.type === "refund_succeeded")
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toMatchObject({ amountCents: 3000, full: false })
  })

  it("outbox indisponible : le webhook réussit quand même (activation + paiement persistés)", async () => {
    const c = await seed()
    await pg.exec(`ALTER TABLE maintenance_subscription_email_outbox RENAME TO outbox_offline`)
    try {
      const { r } = await payInvoice(c, PERIOD_START)
      expect(r.handled).toBe(true)
      const sub = (await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, c.id)))[0]
      expect(sub.status).toBe("active")
      const pays = await db.select().from(schema.maintenancePayments).where(eq(schema.maintenancePayments.subscriptionId, c.id))
      expect(pays.some((p) => p.status === "paid")).toBe(true)
    } finally {
      await pg.exec(`ALTER TABLE outbox_offline RENAME TO maintenance_subscription_email_outbox`)
    }
  })

  it("aucun appel Resend direct dans le webhook / les modules métier", () => {
    for (const f of ["lib/customer-subscriptions/payments.ts", "lib/customer-subscriptions/engine.ts", "lib/customer-subscriptions/requests.ts", "lib/customer-subscriptions/email-events.ts"]) {
      const src = read(f)
      expect(src).not.toMatch(/from ["']resend["']|new Resend\(|sendEmail\(/)
    }
  })
})

describe("worker : rendu depuis snapshots, HTML échappé, logs propres", () => {
  it("formule modifiée après souscription : l'email affiche le prix du snapshot ; nom hostile échappé ; aucune donnée sensible loguée", async () => {
    const c = await seed()
    await payInvoice(c, PERIOD_START)
    await pg.query(`UPDATE maintenance_plans SET "priceCents"=12300, name='Nouvelle <img src=x onerror=alert(1)>' WHERE id=$1`, [c.planId])

    const sent: { to: string; subject: string; html: string }[] = []
    const capture: EmailSender = async (m) => {
      sent.push(m)
      return { ok: true, id: uid("msg") }
    }
    const logs: string[] = []
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(JSON.stringify(a))))
    try {
      await drainCustomerSubscriptionOutbox(db, capture, new Date(Date.now() + DAY), { emailsAllowed: true, limit: 200 })
    } finally {
      spies.forEach((s) => s.mockRestore())
    }

    const mine = sent.filter((m) => m.to === "jean@example.com" || m.to === "pro@atelier.test")
    const activation = mine.find((m) => m.to === "jean@example.com" && /89[,.]00/.test(m.html))
    expect(activation).toBeTruthy()
    for (const m of mine) {
      expect(m.html).not.toMatch(/123[,.]00/)
      expect(m.html).not.toContain("<script>")
      expect(m.html).not.toContain("<img src=x")
      expect(m.html).not.toContain("<b>&amp;</b>")
    }
    expect(mine.some((m) => m.to === "pro@atelier.test")).toBe(true)
    const rows = await outbox(c.id)
    expect(rows.every((r) => r.status === "sent")).toBe(true)

    const joined = logs.join("\n")
    expect(joined).not.toMatch(/jean@example\.com|pro@atelier\.test|acct_test|sk_(test|live)_|whsec_|client_secret/)
  })

  it("Resend en échec => failed retentable, puis sent au tick suivant, jamais renvoyé ensuite", async () => {
    const c = await seed()
    await payInvoice(c, PERIOD_START)
    let fail = true
    const calls: string[] = []
    const flaky: EmailSender = async (m) => {
      calls.push(m.to)
      return fail ? { ok: false, error: "resend_down" } : { ok: true, id: uid("msg") }
    }
    const silence = vi.spyOn(console, "error").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await drainCustomerSubscriptionOutbox(db, flaky, new Date(Date.now() + DAY), { emailsAllowed: true, limit: 200 })
      expect((await outbox(c.id)).every((r) => r.status === "failed")).toBe(true)
      fail = false
      await drainCustomerSubscriptionOutbox(db, flaky, new Date(Date.now() + 2 * DAY), { emailsAllowed: true, limit: 200 })
      expect((await outbox(c.id)).every((r) => r.status === "sent")).toBe(true)
      const before = calls.length
      await drainCustomerSubscriptionOutbox(db, flaky, new Date(Date.now() + 3 * DAY), { emailsAllowed: true, limit: 200 })
      expect(calls.length).toBe(before)
    } finally {
      silence.mockRestore()
      warn.mockRestore()
    }
  })
})
