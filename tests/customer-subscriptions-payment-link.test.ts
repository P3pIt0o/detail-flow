import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import type * as payments from "@/lib/customer-subscriptions/payments"
import { hashManageToken } from "@/lib/customer-subscriptions/manage-token"
import {
  PaymentLinkInvalidError,
  buildPaymentLinkUrl,
  loadPaymentLinkView,
  sendPaymentLinkEmail,
  startCheckoutForManageToken,
} from "@/lib/customer-subscriptions/payment-link"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const NOW = new Date("2026-03-10T10:00:00.000Z")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

function fakePort() {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = []
  const sessions = new Map<string, Record<string, string>>()
  const port = {
    async createCheckoutSession(params: Record<string, unknown>) {
      calls.push({ method: "createCheckoutSession", params })
      const id = uid("cs_test")
      sessions.set(id, params.metadata as Record<string, string>)
      return { id, status: "open", client_secret: uid("secret"), mode: params.mode as string, metadata: params.metadata as Record<string, string> }
    },
    async retrieveCheckoutSession(id: string) {
      calls.push({ method: "retrieveCheckoutSession" })
      return { id, status: "open", client_secret: "secret_reused", metadata: sessions.get(id) ?? {} }
    },
  } as unknown as payments.CustomerSubscriptionStripePort
  return { port, calls }
}

async function seedCompany(slug: string) {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies (slug,"licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,'BUSINESS',$2,true,true) RETURNING id`,
    [slug, uid("acct_test")],
  )
  const companyId = r.rows[0].id
  await pg.query(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,$2,$3)`, [companyId, `Pro ${slug}`, `pro-${slug}@example.com`])
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage',4900) RETURNING id`, [companyId])
  return { companyId, serviceId: s.rows[0].id }
}

async function seedPending(c: { companyId: number; serviceId: number }) {
  const { planId } = await engine.createPlan(db, c.companyId, owner, {
    name: "Entretien Premium — TEST",
    priceCents: 3900,
    currency: "EUR",
    billingIntervalUnit: "month",
    billingIntervalCount: 1,
    includedUsesPerCycle: 1,
    includedServiceId: c.serviceId,
    commitmentUnit: "none",
    commitmentCount: 0,
    renewalMode: "open_ended",
    status: "active",
  })
  const r = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Jean", email: "jean@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") },
    NOW,
  )
  return { subscriptionId: r.subscriptionId, token: r.manageToken as string }
}

const getSub = async (id: number) => (await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, id)))[0]
const setStatus = (id: number, status: string) => pg.query(`UPDATE maintenance_subscriptions SET status=$1 WHERE id=$2`, [status, id])

let A: { companyId: number; serviceId: number }
let B: { companyId: number; serviceId: number }

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text NOT NULL, "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
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
  A = await seedCompany("atelier-a")
  B = await seedCompany("atelier-b")
})

describe("lien de paiement client", () => {
  it("token valide → payable ; le hash seul est stocké", async () => {
    const s = await seedPending(A)
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const view = await loadPaymentLinkView(db, s.token, A.companyId)
    expect(view.state).toBe("payable")
    const row = await getSub(s.subscriptionId)
    expect(row.manageTokenHash).toBe(hashManageToken(s.token))
    expect(JSON.stringify(row)).not.toContain(s.token)
  })

  it("token invalide / mal formé / subscriptionId → invalid", async () => {
    const s = await seedPending(A)
    expect((await loadPaymentLinkView(db, "x".repeat(43), A.companyId)).state).toBe("invalid")
    expect((await loadPaymentLinkView(db, String(s.subscriptionId), A.companyId)).state).toBe("invalid")
    expect((await loadPaymentLinkView(db, s.token, null)).state).toBe("invalid")
  })

  it("isolation tenant : token de A servi sur l'hôte de B → refusé, aucun Checkout", async () => {
    const s = await seedPending(A)
    expect((await loadPaymentLinkView(db, s.token, B.companyId)).state).toBe("invalid")
    const { port, calls } = fakePort()
    await expect(startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: B.companyId, termsAccepted: true }, undefined, NOW)).rejects.toBeInstanceOf(PaymentLinkInvalidError)
    expect(calls).toHaveLength(0)
  })

  it("Checkout pour le bon contrat, metadata serveur ; double clic → session réutilisée", async () => {
    const s = await seedPending(A)
    const { port, calls } = fakePort()
    const r1 = await startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: A.companyId, termsAccepted: true }, undefined, NOW)
    expect(r1.clientSecret).toBeTruthy()
    const created = calls.filter((c) => c.method === "createCheckoutSession")
    expect(created).toHaveLength(1)
    expect(String((created[0].params?.metadata as Record<string, string>)?.subscriptionId ?? s.subscriptionId)).toBe(String(s.subscriptionId))
    const row = await getSub(s.subscriptionId)
    expect(row.externalCheckoutSessionId).toMatch(/^cs_test/)
    const r2 = await startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: A.companyId, termsAccepted: true }, undefined, NOW)
    expect(calls.filter((c) => c.method === "createCheckoutSession")).toHaveLength(1)
    expect(r2.clientSecret).toBe("secret_reused")
    expect((await getSub(s.subscriptionId)).externalCheckoutSessionId).toBe(row.externalCheckoutSessionId)
  })

  it("conditions non acceptées → aucun Checkout", async () => {
    const s = await seedPending(A)
    const { port, calls } = fakePort()
    await expect(startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: A.companyId, termsAccepted: false }, undefined, NOW)).rejects.toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it("actif → 'active', annulé → 'ended', aucun Checkout dans les deux cas", async () => {
    for (const [status, state] of [["active", "active"], ["cancelled", "ended"]] as const) {
      const s = await seedPending(A)
      await setStatus(s.subscriptionId, status)
      expect((await loadPaymentLinkView(db, s.token, A.companyId)).state).toBe(state)
      const { port, calls } = fakePort()
      await expect(startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: A.companyId, termsAccepted: true }, undefined, NOW)).rejects.toBeTruthy()
      expect(calls.filter((c) => c.method === "createCheckoutSession")).toHaveLength(0)
    }
  })

  it("rotation : ancien token refusé, nouveau accepté", async () => {
    const s = await seedPending(A)
    const { manageToken } = await engine.rotateManageToken(db, A.companyId, owner, s.subscriptionId)
    expect(manageToken).not.toBe(s.token)
    expect((await loadPaymentLinkView(db, s.token, A.companyId)).state).toBe("invalid")
    expect((await loadPaymentLinkView(db, manageToken, A.companyId)).state).toBe("payable")
    const { port } = fakePort()
    await expect(startCheckoutForManageToken(db, port, { token: s.token, resolvedCompanyId: A.companyId, termsAccepted: true }, undefined, NOW)).rejects.toBeInstanceOf(PaymentLinkInvalidError)
  })
})

describe("email de paiement", () => {
  it("envoyé au client, expéditeur/reply-to du tenant, URL avec token", async () => {
    const s = await seedPending(A)
    const send = vi.fn(async () => ({ ok: true as const }))
    const out = await sendPaymentLinkEmail(db, send, { companyId: A.companyId, subscriptionId: s.subscriptionId, manageToken: s.token }, { emailsAllowed: true, rootDomain: "www.detailflow.fr" })
    expect(out).toBe("sent")
    const arg = (send.mock.calls[0] as unknown as [Record<string, string>])[0]
    expect(arg.to).toBe("jean@example.com")
    expect(arg.subject).toBe("Votre abonnement d’entretien est prêt")
    expect(arg.fromName).toBe("Pro atelier-a")
    expect(arg.replyTo).toBe("pro-atelier-a@example.com")
    expect(arg.html).toContain("Finaliser mon abonnement")
    expect(arg.html).toContain(`/abonnement-entretien/${s.token}`)
    expect(arg.html).toContain("39")
  })

  it("échec Resend → 'failed', jamais d'exception, contrat intact, token non journalisé", async () => {
    const s = await seedPending(A)
    const before = JSON.stringify(await getSub(s.subscriptionId))
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")]
    const send = vi.fn(async () => {
      throw new Error("resend down")
    })
    const out = await sendPaymentLinkEmail(db, send, { companyId: A.companyId, subscriptionId: s.subscriptionId, manageToken: s.token }, { emailsAllowed: true })
    expect(out).toBe("failed")
    expect(JSON.stringify(await getSub(s.subscriptionId))).toBe(before)
    for (const l of logs) {
      expect(JSON.stringify(l.mock.calls)).not.toContain(s.token)
      l.mockRestore()
    }
  })

  it("token d'un autre contrat / après rotation → aucun envoi", async () => {
    const s = await seedPending(A)
    const other = await seedPending(B)
    const send = vi.fn(async () => ({ ok: true as const }))
    expect(await sendPaymentLinkEmail(db, send, { companyId: B.companyId, subscriptionId: other.subscriptionId, manageToken: s.token }, { emailsAllowed: true })).toBe("failed")
    await engine.rotateManageToken(db, A.companyId, owner, s.subscriptionId)
    expect(await sendPaymentLinkEmail(db, send, { companyId: A.companyId, subscriptionId: s.subscriptionId, manageToken: s.token }, { emailsAllowed: true })).toBe("failed")
    expect(send).not.toHaveBeenCalled()
  })

  it("URL : domaine racine + ?tenant=slug", () => {
    expect(buildPaymentLinkUrl("detailflow", "TOKEN", "www.detailflow.fr")).toContain("/abonnement-entretien/TOKEN")
    expect(buildPaymentLinkUrl("detailflow", "TOKEN", "www.detailflow.fr")).toContain("detailflow")
  })
})

describe("garde-fous statiques", () => {
  it("la page/action client n'utilisent ni rôle admin ni subscriptionId navigateur ; Booking intact", () => {
    const action = read("app/abonnement-entretien/[token]/actions.ts")
    const page = read("app/abonnement-entretien/[token]/page.tsx")
    for (const src of [action, page]) {
      expect(src).not.toMatch(/role:\s*"(OWNER|ADMIN)"/)
      expect(src).not.toMatch(/startCheckoutForCurrentTenant/)
      expect(src).not.toMatch(/subscriptionId/)
    }
    const lib = read("lib/customer-subscriptions/payment-link.ts")
    expect(lib).not.toMatch(/console\.(log|error|warn)/)
    expect(read("app/api/payments/webhook/route.ts")).not.toMatch(/payment-link/)
  })
})
