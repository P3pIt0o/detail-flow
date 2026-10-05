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
import { MANAGE_LINK_TTL_SECONDS, signCustomerAccess } from "@/lib/customer-subscriptions/customer-access"
import { customerRequestEarlyCancellation, exchangeManageLink } from "@/lib/customer-subscriptions/customer-service"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const SECRET = "test-secret-decision-0123456789abcdef0123456789"
const NOW = new Date("2026-03-10T10:00:00.000Z")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

function fakePort() {
  const calls: { method: string; id?: string; params?: Record<string, unknown> }[] = []
  const port = {
    async retrieveSubscription(id: string) {
      calls.push({ method: "retrieveSubscription", id })
      return { id, status: "active", metadata: {} }
    },
    async updateSubscription(id: string, params: Record<string, unknown>) {
      calls.push({ method: "updateSubscription", id, params })
      return { id }
    },
    async cancelSubscription(id: string) {
      calls.push({ method: "cancelSubscription", id })
      return { id, status: "canceled" }
    },
  } as unknown as payments.CustomerSubscriptionStripePort
  return { port, calls }
}

async function seedCompany() {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ('BUSINESS',$1,true,true) RETURNING id`,
    [uid("acct_test")],
  )
  const companyId = r.rows[0].id
  await pg.query(`INSERT INTO settings ("companyId", "businessName", "businessEmail") VALUES ($1,'Atelier','pro@example.com')`, [companyId])
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  return { companyId, serviceId: s.rows[0].id }
}

/** Contrat récurrent actif, engagé 12 mois, avec une demande de fin anticipée en attente. */
async function seedPendingRequest(c: { companyId: number; serviceId: number }) {
  const { planId } = await engine.createPlan(db, c.companyId, owner, {
    name: "Entretien Premium",
    priceCents: 3900,
    currency: "EUR",
    billingIntervalUnit: "month",
    billingIntervalCount: 1,
    includedUsesPerCycle: 1,
    includedServiceId: c.serviceId,
    commitmentUnit: "month",
    commitmentCount: 12,
    renewalMode: "open_ended",
    status: "active",
  })
  const { subscriptionId } = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Jean", email: "jean@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") },
    NOW,
  )
  const hash = uid("hash").padEnd(64, "a")
  const ext = uid("sub_test")
  const anchor = new Date("2026-01-12T00:00:00.000Z")
  await pg.query(
    `UPDATE maintenance_subscriptions SET status='active', "billingAnchorAt"=$1, "activatedAt"=$1, "startedAt"=$1, "currentTermStartedAt"=$1, "currentTermEndsAt"=$2,
      provider='stripe', "providerAccountId"=(SELECT "stripeAccountId" FROM companies WHERE id=$3), "externalSubscriptionId"=$4, "manageTokenHash"=$5
     WHERE id=$6`,
    [anchor, new Date("2027-01-12T00:00:00.000Z"), c.companyId, ext, hash, subscriptionId],
  )
  const linkToken = signCustomerAccess(
    { companyId: c.companyId, subscriptionId, purpose: "manage_link", manageTokenHash: hash, ttlSeconds: MANAGE_LINK_TTL_SECONDS },
    NOW,
    SECRET,
  )
  const ex = await exchangeManageLink(db, { companyId: c.companyId, linkToken, now: NOW, secret: SECRET })
  if (!ex.ok) throw new Error("exchange failed")
  const { requestId } = await customerRequestEarlyCancellation(
    db,
    { companyId: c.companyId, sessionToken: ex.sessionToken, now: NOW, secret: SECRET },
    { message: "Je déménage" },
  )
  return { subscriptionId, requestId, ext }
}

const getSub = async (id: number) => (await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, id)))[0]
const getRequest = async (id: number) => (await db.select().from(schema.maintenanceCancellationRequests).where(eq(schema.maintenanceCancellationRequests.id, id)))[0]
const outboxTypes = async (subscriptionId: number) =>
  (await db.select().from(schema.maintenanceSubscriptionEmailOutbox).where(eq(schema.maintenanceSubscriptionEmailOutbox.subscriptionId, subscriptionId))).map((r) => r.type)

let A: { companyId: number; serviceId: number }
let B: { companyId: number; serviceId: number }

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text NOT NULL DEFAULT ('tenant-' || floor(random()*1e9)::text), "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE settings (id serial PRIMARY KEY, "companyId" integer NOT NULL UNIQUE, "businessName" text, "businessEmail" text);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
  `)
  await pg.exec(read("scripts/customer-subscriptions-schema-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-runtime-core-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-stripe-refunds-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-ui-v1-migration.sql"))
  db = drizzle(pg, { schema }) as unknown as engine.Executor
  A = await seedCompany()
  B = await seedCompany()
})

describe("décision admin de fin anticipée", () => {
  it("acceptation : fin à la prochaine échéance, Stripe mis à jour (mock), email client en file, aucun remboursement", async () => {
    const s = await seedPendingRequest(A)
    const { port, calls } = fakePort()
    const r = await payments.decideEarlyCancellationAndSync(db, port, A.companyId, owner, s.requestId, "approved", { customerMessage: "Bonne route", internalNote: "ok tél." }, NOW)
    expect(r.decision).toBe("approved")
    expect(r.cancelAt?.toISOString()).toBe("2026-03-12T00:00:00.000Z")
    expect((await getRequest(s.requestId)).status).toBe("approved")
    expect((await getSub(s.subscriptionId)).cancelAt?.toISOString()).toBe("2026-03-12T00:00:00.000Z")
    expect(calls.some((c) => c.method === "updateSubscription" && c.id === s.ext)).toBe(true)
    expect(calls.some((c) => /refund/i.test(c.method))).toBe(false)
    expect((await outboxTypes(s.subscriptionId)).some((t) => /^early_cancellation_decided$/.test(t))).toBe(true)
  })

  it("refus : contrat inchangé, aucun appel Stripe, email client en file", async () => {
    const s = await seedPendingRequest(A)
    const before = await getSub(s.subscriptionId)
    const { port, calls } = fakePort()
    const r = await payments.decideEarlyCancellationAndSync(db, port, A.companyId, owner, s.requestId, "rejected", {}, NOW)
    expect(r.provider.status).toBe("noop")
    expect(calls).toHaveLength(0)
    const after = await getSub(s.subscriptionId)
    expect(after.status).toBe(before.status)
    expect(after.cancelAt).toEqual(before.cancelAt)
    expect((await getRequest(s.requestId)).status).toBe("rejected")
    expect((await outboxTypes(s.subscriptionId)).some((t) => /^early_cancellation_decided$/.test(t))).toBe(true)
  })

  it("isolation tenant : B ne peut pas décider une demande de A", async () => {
    const s = await seedPendingRequest(A)
    await expect(engine.decideEarlyCancellation(db, B.companyId, owner, s.requestId, "approved", {}, NOW)).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" })
    expect((await getRequest(s.requestId)).status).toBe("pending")
  })

  it("double décision : la seconde décision contraire est refusée", async () => {
    const s = await seedPendingRequest(A)
    await engine.decideEarlyCancellation(db, A.companyId, owner, s.requestId, "rejected", {}, NOW)
    await expect(engine.decideEarlyCancellation(db, A.companyId, owner, s.requestId, "approved", {}, NOW)).rejects.toMatchObject({ code: "REQUEST_NOT_PENDING" })
  })

  it("rôle non autorisé : refus avant tout accès", async () => {
    const s = await seedPendingRequest(A)
    await expect(engine.decideEarlyCancellation(db, A.companyId, { userId: "u-staff", role: "EMPLOYEE" } as engine.Actor, s.requestId, "approved", {}, NOW)).rejects.toThrow()
    expect((await getRequest(s.requestId)).status).toBe("pending")
  })
})
