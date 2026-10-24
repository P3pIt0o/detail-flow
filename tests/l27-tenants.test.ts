import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))
vi.mock("@vercel/firewall", () => ({ checkRateLimit: async () => ({ rateLimited: false }) }))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { acceptSubscriptionRequest, createPublicSubscriptionRequest, planSnapshotVersion, type PlanRequestSnapshot } from "@/lib/customer-subscriptions/requests"
import { buildPaymentRecap } from "@/lib/customer-subscriptions/payment-link"
import { DEFAULT_WIZARD_FORM, wizardToPlanConfigInput } from "@/lib/customer-subscriptions/plan-form"
import type { PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const NOW = new Date("2026-10-23T09:00:00.000Z")
let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`
let A: { companyId: number; serviceId: number }
let B: { companyId: number; serviceId: number }

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return "OK"
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

async function company(slug: string) {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies (slug,"licensePlan","customerSubscriptionPublicMode","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,'BUSINESS','request',$2,true,true) RETURNING id`,
    [slug, `acct_${slug}`],
  )
  const companyId = r.rows[0].id
  await pg.query(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,$2,$3)`, [companyId, slug, `pro@${slug}.test`])
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  return { companyId, serviceId: s.rows[0].id }
}

const serenite = (serviceId: number, over: Partial<typeof DEFAULT_WIZARD_FORM> = {}): PlanConfigInput =>
  wizardToPlanConfigInput({ ...DEFAULT_WIZARD_FORM, name: "Formule Sérénité", includedServiceId: serviceId, priceEuros: "359", ...over })

const request = (companyId: number, planId: number, choice?: unknown) =>
  createPublicSubscriptionRequest(
    db,
    companyId,
    { planId, customer: { name: "Julie", email: `${uid("julie")}@example.com` }, vehicle: { brand: "Peugeot", model: "308" }, submissionId: uid("submission-xxxxxxxxxxxx"), paymentScheduleChoice: choice },
    NOW,
  )

beforeAll(async () => {
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
    "scripts/maintenance-rights-period-migration.sql",
  ])
    await pg.exec(read(f))
  db = drizzle(pg, { schema }) as unknown as engine.Executor
  A = await company("acme")
  B = await company("other")
})

describe("isolation tenant A / tenant B — formules L27", () => {
  it("B ne modifie ni n'archive une formule de A ; une prestation de B est refusée dans une formule de A", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId))
    expect(await code(engine.updatePlan(db, B.companyId, owner, planId, serenite(B.serviceId)))).toBe("INVALID_PLAN")
    expect(await code(engine.archivePlan(db, B.companyId, owner, planId))).not.toBe("OK")
    expect(await code(engine.createPlan(db, A.companyId, owner, serenite(B.serviceId)))).toBe("SERVICE_NOT_FOUND")
    const [row] = await db.select().from(schema.maintenancePlans).where(eq(schema.maintenancePlans.id, planId))
    expect([row.companyId, row.status, row.rightsPeriodMonths, row.paymentSchedule]).toEqual([A.companyId, "active", 12, "monthly"])
  })

  it("B ne crée ni demande ni abonnement sur une formule de A", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId))
    expect(await code(request(B.companyId, planId))).toBe("PLAN_NOT_AVAILABLE")
    expect(
      await code(
        engine.createSubscription(db, B.companyId, owner, { planId, customer: { name: "X", email: "x@example.com" }, vehicle: { brand: "Peugeot", model: "208" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") }, NOW),
      ),
    ).toBe("INVALID_PLAN")
  })
})

describe("formule « au choix du client » : choix re-vérifié serveur et figé à la création", () => {
  it("choix absent ou invalide : demande refusée", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId, { paymentSchedule: "customer_choice" }))
    expect(await code(request(A.companyId, planId))).toBe("INVALID_PAYMENT_MODE")
    expect(await code(request(A.companyId, planId, "prepaid"))).toBe("INVALID_PAYMENT_MODE")
  })

  it.each([
    ["monthly", { priceCentsSnapshot: 2992, billingIntervalCountSnapshot: 1, commitmentCountSnapshot: 12, installmentsPerPeriodSnapshot: 12 }],
    ["period", { priceCentsSnapshot: 35_900, billingIntervalCountSnapshot: 12, commitmentUnitSnapshot: "none", installmentsPerPeriodSnapshot: null }],
  ])("choix %s conservé jusqu'au contrat", async (choice, expected) => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId, { paymentSchedule: "customer_choice" }))
    const { requestId } = await request(A.companyId, planId, choice)
    const res = await acceptSubscriptionRequest(db, A.companyId, owner, requestId, {}, NOW)
    const [sub] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, res.subscriptionId))
    expect(sub).toMatchObject({ companyId: A.companyId, includedUsesPerCycleSnapshot: 6, ...expected })
  })

  it("formule non « au choix » : une valeur envoyée par le navigateur est ignorée", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId))
    const { requestId } = await request(A.companyId, planId, "period")
    const [req] = await db.select().from(schema.maintenanceSubscriptionRequests).where(eq(schema.maintenanceSubscriptionRequests.id, requestId))
    expect(req.paymentScheduleChoice).toBeNull()
  })

  it("B ne peut pas accepter une demande de A", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId, { paymentSchedule: "customer_choice" }))
    const { requestId } = await request(A.companyId, planId, "monthly")
    expect(await code(acceptSubscriptionRequest(db, B.companyId, owner, requestId, {}, NOW))).toBe("REQUEST_NOT_FOUND")
  })
})

describe("non-régression des demandes en attente (formules V1)", () => {
  it("version du snapshot inchangée pour une formule V1 (champs L27 nuls exclus)", () => {
    const v1 = { name: "Entretien", planId: 1, priceCents: 4900, includedServiceName: "Lavage", initialServiceName: null } as unknown as PlanRequestSnapshot
    expect(planSnapshotVersion({ ...v1, rightsPeriodMonths: null, paymentSchedule: null })).toBe(planSnapshotVersion(v1))
    expect(planSnapshotVersion({ ...v1, rightsPeriodMonths: 12, paymentSchedule: "monthly" })).not.toBe(planSnapshotVersion(v1))
  })
})

describe("récapitulatif avant paiement", () => {
  it("textes de l'aperçu calculés depuis le contrat figé", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, serenite(A.serviceId))
    const { subscriptionId } = await engine.createSubscription(db, A.companyId, owner, { planId, customer: { name: "J", email: "j@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") }, NOW)
    const [sub] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, subscriptionId))
    const r = JSON.parse(JSON.stringify(buildPaymentRecap(sub, NOW)).replace(/[  ]/g, " "))
    expect(r).toEqual({
      receive: "6 lavages, à utiliser quand vous voulez pendant 12 mois",
      pay: "29,92 € par mois pendant 12 mois (dernier mois : 29,88 €)",
      payTotal: "Soit 359 € au total",
      first: "Aujourd'hui, puis le 23 de chaque mois",
      commitment: "12 mois, jusqu'au 23 octobre 2027",
      after: "Un nouvel engagement de 12 mois démarre, avec 6 nouveaux lavages. Vous pouvez demander l'arrêt avant le 23 octobre 2027 (rappel envoyé avant). Les lavages non utilisés au bout des 12 mois ne sont pas reportés.",
      reminder: "Rappel envoyé 3 jours avant chaque prélèvement.",
      payButton: "Payer 29,92 € et souscrire",
    })
  })
})
