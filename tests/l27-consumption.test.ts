import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"
import type { PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const ANCHOR = new Date("2026-10-23T09:00:00.000Z")
const day = (n: number) => new Date(ANCHOR.getTime() + n * 86_400_000)

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

async function seedCompany() {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ('PRO',$1,true,true) RETURNING id`,
    [uid("acct_test")],
  )
  const companyId = r.rows[0].id
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  return { companyId, serviceId: s.rows[0].id }
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

/** Abonnement mensuel 6 lavages / 12 mois, activé à ANCHOR, 1re mensualité payée (cycle créé). */
async function seedActiveSub(c: { companyId: number; serviceId: number }, plan: PlanConfigInput = SERENITE) {
  const { planId } = await engine.createPlan(db, c.companyId, owner, { ...plan, includedServiceId: c.serviceId })
  const { subscriptionId } = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Julie", email: "julie@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") },
    day(-1),
  )
  await engine.activateSubscription(db, c.companyId, subscriptionId, ANCHOR)
  await engine.createCycleIfMissing(db, c.companyId, subscriptionId, day(15))
  return subscriptionId
}

const mark = (companyId: number, subId: number, expectedRemaining: number, at = day(10)) =>
  engine.markUseCompleted(db, companyId, owner, subId, { expectedRemaining }, at)
const statuses = async (subId: number) =>
  (await db.select({ status: schema.maintenanceUses.status }).from(schema.maintenanceUses).where(eq(schema.maintenanceUses.subscriptionId, subId))).map((r) => r.status).sort()

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

describe("droits sur 12 mois payés chaque mois", () => {
  it("6 droits sur la période, pas 6 par mensualité", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    // Mensualités suivantes payées : même fenêtre de droits, aucun droit supplémentaire.
    for (const m of [1, 2, 5, 11]) await engine.createCycleIfMissing(db, c.companyId, subId, new Date(Date.UTC(2026, 9 + m, 25, 9)))
    expect(await statuses(subId)).toEqual(Array(6).fill("available"))
    const usage = await engine.getCurrentUsage(db, c.companyId, subId, day(40))
    expect(usage).toMatchObject({ total: 6, remaining: 6, periodEndsAt: new Date("2027-10-23T09:00:00.000Z") })
  })

  it("non utilisés : perdus au début de la période suivante", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    await mark(c.companyId, subId, 6)
    await engine.createCycleIfMissing(db, c.companyId, subId, new Date("2027-10-25T00:00:00.000Z"))
    const all = await statuses(subId)
    expect(all.filter((s) => s === "expired")).toHaveLength(5)
    expect(all.filter((s) => s === "completed")).toHaveLength(1)
    expect(all.filter((s) => s === "available")).toHaveLength(6)
  })
})

describe("marquage manuel par le pro", () => {
  it("2 lavages dès le 1er mois acceptés (consommation libre)", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    const a = await mark(c.companyId, subId, 6, day(2))
    const b = await mark(c.companyId, subId, 5, day(3))
    expect([a.outcome, b.outcome]).toEqual(["completed", "completed"])
    expect(b.usage).toMatchObject({ total: 6, remaining: 4 })
    expect(b.usage?.lastCompleted?.completedAt).toEqual(day(3))
  })

  it("au-delà des droits : refusé côté serveur", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    for (let r = 6; r > 0; r--) await mark(c.companyId, subId, r)
    await expect(mark(c.companyId, subId, 0)).rejects.toThrow(CustomerSubscriptionError)
    expect((await statuses(subId)).filter((s) => s === "completed")).toHaveLength(6)
  })

  it("double clic (même nombre attendu) : une seule prestation", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    const first = await mark(c.companyId, subId, 6)
    const second = await mark(c.companyId, subId, 6)
    expect(first.outcome).toBe("completed")
    expect(second.outcome).toBe("stale")
    expect(second.usage?.remaining).toBe(5)
    expect((await statuses(subId)).filter((s) => s === "completed")).toHaveLength(1)
  })

  it("nombre attendu invalide : refusé", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    for (const bad of [-1, 1.5, Number.NaN, "6" as unknown as number]) {
      await expect(mark(c.companyId, subId, bad)).rejects.toThrow(CustomerSubscriptionError)
    }
  })

  it("annuler le dernier marquage puis re-marquer", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    await mark(c.companyId, subId, 6)
    const last = await mark(c.companyId, subId, 5)
    const undone = await engine.undoUseCompleted(db, c.companyId, owner, subId, last.useId!, day(11))
    expect(undone.usage?.remaining).toBe(5)
    expect((await mark(c.companyId, subId, 5)).outcome).toBe("completed")
  })

  it("annuler un marquage plus ancien que le dernier : refusé", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    const first = await mark(c.companyId, subId, 6, day(2))
    await mark(c.companyId, subId, 5, day(3))
    await expect(engine.undoUseCompleted(db, c.companyId, owner, subId, first.useId!, day(4))).rejects.toThrow(CustomerSubscriptionError)
  })

  it("annuler un marquage d'une période précédente : refusé", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    const m = await mark(c.companyId, subId, 6)
    const next = new Date("2027-10-25T00:00:00.000Z")
    await engine.createCycleIfMissing(db, c.companyId, subId, next)
    await expect(engine.undoUseCompleted(db, c.companyId, owner, subId, m.useId!, next)).rejects.toThrow(CustomerSubscriptionError)
  })

  it("abonnement impayé ou terminé : marquage refusé", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    await pg.query(`UPDATE maintenance_subscriptions SET status='past_due' WHERE id=$1`, [subId])
    await expect(mark(c.companyId, subId, 6)).rejects.toMatchObject({ code: "PAST_DUE" })
    await pg.query(`UPDATE maintenance_subscriptions SET status='ended' WHERE id=$1`, [subId])
    await expect(mark(c.companyId, subId, 6)).rejects.toMatchObject({ code: "ALREADY_CANCELLED" })
  })

  it("employé : lecture seule (aucune mutation)", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c)
    const employee: engine.Actor = { userId: "u-emp", role: "EMPLOYEE" }
    await expect(engine.markUseCompleted(db, c.companyId, employee, subId, { expectedRemaining: 6 }, day(10))).rejects.toThrow(CustomerSubscriptionError)
  })

  it("abonnement V1 (droits = facturation) : même marquage", async () => {
    const c = await seedCompany()
    const subId = await seedActiveSub(c, {
      ...SERENITE,
      priceCents: 4900,
      billingIntervalCount: 1,
      includedUsesPerCycle: 2,
      commitmentUnit: "none",
      commitmentCount: 0,
      renewalMode: "open_ended",
      rightsPeriodMonths: undefined,
      paymentSchedule: undefined,
    })
    const usage = await engine.getCurrentUsage(db, c.companyId, subId, day(10))
    expect(usage).toMatchObject({ total: 2, remaining: 2, periodEndsAt: new Date("2026-11-23T09:00:00.000Z") })
    expect((await mark(c.companyId, subId, 2)).usage?.remaining).toBe(1)
  })
})

describe("isolation tenant A / tenant B", () => {
  it("le tenant B ne peut ni lire, ni marquer, ni annuler un droit du tenant A", async () => {
    const a = await seedCompany()
    const b = await seedCompany()
    const subA = await seedActiveSub(a)
    const m = await mark(a.companyId, subA, 6)
    expect(await engine.getCurrentUsage(db, b.companyId, subA, day(10))).toBeNull()
    await expect(mark(b.companyId, subA, 5)).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_FOUND" })
    await expect(engine.undoUseCompleted(db, b.companyId, owner, subA, m.useId!, day(11))).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_FOUND" })
    // Abonnement de B, droit de A : refusé (droit re-vérifié dans l'abonnement et le tenant).
    const subB = await seedActiveSub(b)
    await mark(b.companyId, subB, 6)
    await expect(engine.undoUseCompleted(db, b.companyId, owner, subB, m.useId!, day(11))).rejects.toThrow(CustomerSubscriptionError)
    expect((await engine.getCurrentUsage(db, a.companyId, subA, day(12)))?.remaining).toBe(5)
  })
})
