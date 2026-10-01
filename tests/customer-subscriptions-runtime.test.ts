import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq, and } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"
import {
  addBillingInterval,
  computeActualTermEnd,
  nextBillingBoundary,
  addMonthsUTC,
} from "@/lib/customer-subscriptions/dates"
import {
  canUseEntitlement,
  computePlatformFeeAmountCents,
  computePrepaidTotalCents,
  evaluateCapacity,
  resolvePlatformFeeBps,
  type SubscriptionTimeline,
} from "@/lib/customer-subscriptions/contract"
import { validatePlanConfig, type PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"
import { applyPlanPreset, buildPlanSummary } from "@/lib/customer-subscriptions/plan-summary"
import { generateManageToken, hashManageToken, verifyManageToken } from "@/lib/customer-subscriptions/manage-token"
import { CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES, CUSTOMER_SUBSCRIPTION_USABLE_STATUSES } from "@/lib/customer-subscriptions/statuses"
import type { LicenseContext } from "@/lib/licensing/resolver"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const baseMigration = read("scripts/customer-subscriptions-schema-migration.sql")
const runtimeMigration = read("scripts/customer-subscriptions-runtime-core-migration.sql")

const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
const employee: engine.Actor = { userId: "u-emp", role: "EMPLOYEE" }
const NOW = new Date("2026-01-15T10:00:00.000Z")

let pg: PGlite
let db: engine.Executor

async function expectCode(p: Promise<unknown> | (() => unknown), code: string) {
  try {
    await (typeof p === "function" ? p() : p)
  } catch (e) {
    expect(e).toBeInstanceOf(CustomerSubscriptionError)
    expect((e as CustomerSubscriptionError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code}`)
}

let keySeq = 0
const key = () => `idem-key-${String(++keySeq).padStart(8, "0")}`

async function seedCompany(plan: string | null, opts: { stripe?: boolean; payments?: boolean } = {}) {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,$2,$3,$4) RETURNING id`,
    [plan, opts.stripe === false ? null : `acct_${Math.random().toString(36).slice(2, 10)}`, opts.stripe !== false, opts.payments !== false],
  )
  const companyId = r.rows[0].id
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900), ($1,'Nettoyage initial',12000) RETURNING id`, [companyId])
  return { companyId, includedServiceId: s.rows[0].id, initialServiceId: s.rows[1].id }
}

function planInput(includedServiceId: number, extra: PlanConfigInput = {}): PlanConfigInput {
  return {
    name: "Entretien Premium",
    priceCents: 8900,
    currency: "EUR",
    billingIntervalUnit: "week",
    billingIntervalCount: 4,
    includedUsesPerCycle: 2,
    includedServiceId,
    commitmentUnit: "month",
    commitmentCount: 6,
    renewalMode: "open_ended",
    status: "active",
    ...extra,
  }
}

async function seedPlan(companyId: number, includedServiceId: number, extra: PlanConfigInput = {}) {
  return (await engine.createPlan(db, companyId, owner, planInput(includedServiceId, extra))).planId
}

function subInput(planId: number, extra: Partial<engine.CreateSubscriptionInput> = {}): engine.CreateSubscriptionInput {
  return {
    planId,
    customer: { name: "Jean Client", email: "jean@example.com", phone: "06 12 34 56 78" },
    vehicle: { brand: "Peugeot", model: "308", plate: "ab 123 cd" },
    paymentMode: "recurring",
    idempotencyKey: key(),
    ...extra,
  }
}

async function bulkInsertSubscriptions(companyId: number, planId: number, n: number, status = "active") {
  await pg.query(
    `INSERT INTO maintenance_subscriptions ("companyId","planId",status,"customerName","customerEmail","planNameSnapshot","priceCentsSnapshot","billingIntervalUnitSnapshot","billingIntervalCountSnapshot","includedUsesPerCycleSnapshot","commitmentUnitSnapshot","commitmentCountSnapshot","renewalModeSnapshot","paymentMode")
     SELECT $1,$2,$3,'X','x@example.com','P',1000,'month',1,1,'none',0,'open_ended','recurring' FROM generate_series(1,$4)`,
    [companyId, planId, status, n],
  )
}

async function setPlan(companyId: number, plan: string | null) {
  await pg.query(`UPDATE companies SET "licensePlan"=$1 WHERE id=$2`, [plan, companyId])
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
  `)
  await pg.exec(baseMigration)
  await pg.exec(runtimeMigration)
  db = drizzle(pg, { schema }) as unknown as engine.Executor
})

beforeEach(() => {
  keySeq += 1000
})

/* ------------------------------ Pures ----------------------------------- */

describe("G/H. dates UTC", () => {
  it("week/4 = exactement 28 jours, jamais 1 mois", () => {
    const start = new Date("2026-01-31T00:00:00Z")
    expect(addBillingInterval(start, { unit: "week", count: 4 }).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(addBillingInterval(new Date("2026-03-01T00:00:00Z"), { unit: "week", count: 4 }).getTime() - Date.parse("2026-03-01T00:00:00Z")).toBe(28 * 86_400_000)
    expect(addMonthsUTC(start, 1).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(addMonthsUTC(start, 2).toISOString()).toBe("2026-03-31T00:00:00.000Z")
  })

  it("6 mois + 4 semaines : fin minimale respectée, terme aligné, 7 échéances (pas 6)", () => {
    const start = new Date("2026-01-01T00:00:00Z")
    const t = computeActualTermEnd(start, { unit: "week", count: 4 }, { unit: "month", count: 6 })!
    expect(t.minimumEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(t.termEnd >= t.minimumEnd).toBe(true)
    expect(t.billingCycles).toBe(7)
    expect(t.termEnd.toISOString()).toBe(new Date(start.getTime() + 7 * 28 * 86_400_000).toISOString())
    expect(nextBillingBoundary(start, { unit: "week", count: 4 }, t.minimumEnd).toISOString()).toBe(t.termEnd.toISOString())
  })

  it("mensuel 12 mois : 12 échéances, sans engagement → null", () => {
    const start = new Date("2026-01-31T00:00:00Z")
    expect(computeActualTermEnd(start, { unit: "month", count: 1 }, { unit: "month", count: 12 })!.billingCycles).toBe(12)
    expect(computeActualTermEnd(start, { unit: "month", count: 1 }, { unit: "none", count: 0 })).toBeNull()
  })
})

describe("validateur de formule (codes stables)", () => {
  it("rejette prix négatif, uses 0, intervalle invalide, same_term sans engagement", () => {
    const bad = validatePlanConfig({ ...planInput(1), priceCents: -1, includedUsesPerCycle: 0, billingIntervalCount: 0, commitmentUnit: "none", commitmentCount: 0, renewalMode: "same_term" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      const codes = bad.issues.map((i) => `${i.field}:${i.code}`)
      expect(codes).toEqual(expect.arrayContaining(["priceCents:INVALID_PLAN", "includedUsesPerCycle:INVALID_PLAN", "billingIntervalCount:INVALID_INTERVAL", "renewalMode:INVALID_RENEWAL"]))
    }
  })
  it("engagement none ⇔ 0 ; month > 0 ; prepaid ⇒ cycles > 0 ; active ⇒ prestation incluse", () => {
    expect(validatePlanConfig({ ...planInput(1), commitmentUnit: "none", commitmentCount: 3 }).ok).toBe(false)
    expect(validatePlanConfig({ ...planInput(1), commitmentUnit: "month", commitmentCount: 0 }).ok).toBe(false)
    expect(validatePlanConfig({ ...planInput(1), allowPrepaidPayment: true, prepaidBillingCycles: null }).ok).toBe(false)
    expect(validatePlanConfig({ ...planInput(1), includedServiceId: null }).ok).toBe(false)
    expect(validatePlanConfig({ ...planInput(1), includedServiceId: null, status: "draft" }).ok).toBe(true)
  })
  it("presets = mêmes données métier que la saisie manuelle", () => {
    const viaPreset = validatePlanConfig(applyPlanPreset("every_4_weeks", { name: "X", priceCents: 1000, includedServiceId: 1 }))
    const manual = validatePlanConfig({ name: "X", priceCents: 1000, includedServiceId: 1, includedUsesPerCycle: 1, billingIntervalUnit: "week", billingIntervalCount: 4, commitmentUnit: "none", commitmentCount: 0, renewalMode: "open_ended", allowRecurringPayment: true, allowPrepaidPayment: false, prepaidBillingCycles: null })
    expect(viaPreset).toEqual(manual)
    for (const k of ["monthly", "every_4_weeks", "pack_6_months", "annual", "prepaid"] as const) {
      expect(validatePlanConfig(applyPlanPreset(k, { name: "X", priceCents: 1000, includedServiceId: 1 })).ok).toBe(true)
    }
  })
  it("résumé structuré : 7 échéances, ~13/an, commission, sans HTML", () => {
    const v = validatePlanConfig(planInput(1))
    if (!v.ok) throw new Error("invalid")
    const s = buildPlanSummary({ plan: v.value, includedServiceName: "Lavage complet", platformFeeBps: 300, referenceStart: new Date("2026-01-01T00:00:00Z") })
    expect(s.commitment.firstTermBillingCycles).toBe(7)
    expect(s.interval.exactDays).toBe(28)
    expect(s.interval.approxBillingsPerYear).toBe(13)
    expect(s.platformFee.bps).toBe(300)
    expect(s.cancellation).toBe("end_of_commitment")
    expect(s.helpCodes).toContain("commitment.billings_may_exceed_months")
    expect(s.appliesToNewSubscriptionsOnly).toBe(true)
  })
})

describe("statuts : capacité ≠ utilisation", () => {
  it("définitions centrales", () => {
    expect([...CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES].sort()).toEqual(["active", "cancel_scheduled", "past_due", "pending_initial_cleaning", "pending_payment", "suspended"])
    expect([...CUSTOMER_SUBSCRIPTION_USABLE_STATUSES].sort()).toEqual(["active", "cancel_scheduled"])
  })
  const base: SubscriptionTimeline = {
    status: "active", paymentMode: "recurring", billingIntervalUnitSnapshot: "month", billingIntervalCountSnapshot: 1,
    renewalModeSnapshot: "open_ended", billingAnchorAt: NOW, currentTermEndsAt: null, prepaidUntil: null, cancelAt: null, renewalOptOutAt: null,
  }
  it("M. past_due bloque un nouveau droit ; suspended aussi ; cancel_scheduled utilisable avant cancelAt", () => {
    expect(canUseEntitlement({ ...base, status: "past_due" }, NOW)).toEqual({ allowed: false, reason: "PAST_DUE" })
    expect(canUseEntitlement({ ...base, status: "suspended" }, NOW).allowed).toBe(false)
    const cancelAt = new Date(NOW.getTime() + 86_400_000)
    expect(canUseEntitlement({ ...base, status: "cancel_scheduled", cancelAt }, NOW).allowed).toBe(true)
    expect(canUseEntitlement({ ...base, status: "cancel_scheduled", cancelAt }, cancelAt).allowed).toBe(false)
  })
})

describe("F. commissions (plan effectif au moment du paiement)", () => {
  it("FREE 700 / ESSENTIAL 700 / PRO 300 / BUSINESS 0 / ENTERPRISE 0 / FOUNDER 0 / legacy 0", () => {
    expect(resolvePlatformFeeBps("FREE")).toBe(700)
    expect(resolvePlatformFeeBps("ESSENTIAL")).toBe(700)
    expect(resolvePlatformFeeBps("PRO")).toBe(300)
    expect(resolvePlatformFeeBps("BUSINESS")).toBe(0)
    expect(resolvePlatformFeeBps("ENTERPRISE")).toBe(0)
    expect(resolvePlatformFeeBps("FOUNDER")).toBe(0)
    expect(resolvePlatformFeeBps(null)).toBe(0)
    expect(computePlatformFeeAmountCents(8900, 300)).toBe(267)
  })
})

describe("N. prépayé", () => {
  it("total = prix × cycles ; overflow refusé", () => {
    expect(computePrepaidTotalCents(8900, 6)).toBe(53400)
    expect(() => computePrepaidTotalCents(2_000_000_000, 2)).toThrow()
    expect(() => computePrepaidTotalCents(100, 0)).toThrow()
  })
})

describe("O. token de gestion", () => {
  it("32 octets CSPRNG, seul le SHA-256 est vérifiable", () => {
    const { token, hash } = generateManageToken()
    expect(Buffer.from(token, "base64url").length).toBe(32)
    expect(hash).toBe(hashManageToken(token))
    expect(hash).not.toContain(token)
    expect(verifyManageToken(token, hash)).toBe(true)
    expect(verifyManageToken(token + "x", hash)).toBe(false)
  })
})

describe("B (pur). capacité via resolver", () => {
  const ctx = (plan: string | null): LicenseContext => ({ plan: plan as LicenseContext["plan"], generation: null, overrides: [] })
  it("FREE 0/2, 1/2 ok ; 2/2 refusé ; PRO 9 ok / 10 refusé ; BUSINESS 1000 ok", () => {
    expect(evaluateCapacity(ctx("FREE"), 0).creationAllowed).toBe(true)
    expect(evaluateCapacity(ctx("FREE"), 1).creationAllowed).toBe(true)
    expect(evaluateCapacity(ctx("FREE"), 2)).toMatchObject({ creationAllowed: false, reason: "LIMIT_REACHED", remaining: 0 })
    expect(evaluateCapacity(ctx("PRO"), 9).creationAllowed).toBe(true)
    expect(evaluateCapacity(ctx("PRO"), 10).creationAllowed).toBe(false)
    expect(evaluateCapacity(ctx("BUSINESS"), 1000)).toMatchObject({ creationAllowed: true, maxActive: null, remaining: null })
    expect(evaluateCapacity(ctx(null), 1000).creationAllowed).toBe(true)
  })
})

/* ----------------------------- Moteur DB --------------------------------- */

describe("moteur transactionnel (PGlite)", () => {
  it("A. isolation : tenant A ne peut utiliser plan/service/client/subscription de B (NOT_FOUND neutre)", async () => {
    const a = await seedCompany("PRO")
    const b = await seedCompany("PRO")
    const planB = await seedPlan(b.companyId, b.includedServiceId)
    const clientB = (await pg.query<{ id: number }>(`INSERT INTO clients ("companyId") VALUES ($1) RETURNING id`, [b.companyId])).rows[0].id
    const planA = await seedPlan(a.companyId, a.includedServiceId)
    const subB = await engine.createSubscription(db, b.companyId, owner, subInput(planB), NOW)

    await expectCode(engine.createSubscription(db, a.companyId, owner, subInput(planB), NOW), "INVALID_PLAN")
    await expectCode(engine.createPlan(db, a.companyId, owner, planInput(b.includedServiceId)), "SERVICE_NOT_FOUND")
    await expectCode(engine.createSubscription(db, a.companyId, owner, subInput(planA, { customerId: clientB }), NOW), "CLIENT_NOT_FOUND")
    await expectCode(engine.changeVehicle(db, a.companyId, owner, subB.subscriptionId, { brand: "X", model: "Y" }), "SUBSCRIPTION_NOT_FOUND")
    await expectCode(engine.forceEndSubscription(db, a.companyId, owner, subB.subscriptionId, "motif test"), "SUBSCRIPTION_NOT_FOUND")
    await expectCode(engine.updatePlan(db, a.companyId, owner, planB, planInput(a.includedServiceId)), "INVALID_PLAN")
  })

  it("rôles : EMPLOYEE ne mute rien", async () => {
    const a = await seedCompany("PRO")
    await expectCode(engine.createPlan(db, a.companyId, employee, planInput(a.includedServiceId)), "FORBIDDEN")
  })

  it("Stripe : non connecté / paiements désactivés bloquent le NEUF ; brouillon autorisé ; online_payments non requis", async () => {
    const noStripe = await seedCompany("FREE", { stripe: false })
    await expectCode(engine.createPlan(db, noStripe.companyId, owner, planInput(noStripe.includedServiceId)), "STRIPE_NOT_CONNECTED")
    await engine.createPlan(db, noStripe.companyId, owner, planInput(noStripe.includedServiceId, { status: "draft" }))

    const off = await seedCompany("FREE")
    const planId = await seedPlan(off.companyId, off.includedServiceId)
    const existing = await engine.createSubscription(db, off.companyId, owner, subInput(planId), NOW)
    await pg.query(`UPDATE companies SET "paymentsEnabled"=false WHERE id=$1`, [off.companyId])
    await expectCode(engine.createSubscription(db, off.companyId, owner, subInput(planId), NOW), "PAYMENTS_DISABLED")
    const [row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, existing.subscriptionId))
    expect(row.status).toBe("pending_payment")
  })

  it("B. capacité DB : FREE 2 places, 3e refusée ; pending_payment compte", async () => {
    const c = await seedCompany("FREE")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    await expectCode(engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW), "LIMIT_REACHED")
    expect(await engine.getCustomerSubscriptionCapacity(db, c.companyId)).toMatchObject({ activeCount: 2, maxActive: 2, remaining: 0, creationAllowed: false })
  })

  it("B. PRO 9/10 ok puis 10/10 refusé ; BUSINESS 1000 ok", async () => {
    const pro = await seedCompany("PRO")
    const planId = await seedPlan(pro.companyId, pro.includedServiceId)
    await bulkInsertSubscriptions(pro.companyId, planId, 9)
    await engine.createSubscription(db, pro.companyId, owner, subInput(planId), NOW)
    await expectCode(engine.createSubscription(db, pro.companyId, owner, subInput(planId), NOW), "LIMIT_REACHED")

    const biz = await seedCompany("BUSINESS")
    const bizPlan = await seedPlan(biz.companyId, biz.includedServiceId)
    await bulkInsertSubscriptions(biz.companyId, bizPlan, 1000)
    expect((await engine.createSubscription(db, biz.companyId, owner, subInput(bizPlan), NOW)).replayed).toBe(false)
  })

  it("C. concurrence : deux créations simultanées au dernier slot → une seule gagne", async () => {
    const c = await seedCompany("FREE")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    const results = await Promise.allSettled([
      engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW),
      engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW),
      engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(rejected.every((r) => (r.reason as CustomerSubscriptionError).code === "LIMIT_REACHED")).toBe(true)
    expect((await engine.getCustomerSubscriptionCapacity(db, c.companyId)).activeCount).toBe(2)
  })

  it("idempotence : même clé rejouée → même contrat, aucun doublon, token non re-émis", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const input = subInput(planId)
    const [r1, r2] = await Promise.all([
      engine.createSubscription(db, c.companyId, owner, input, NOW),
      engine.createSubscription(db, c.companyId, owner, input, NOW),
    ])
    expect(r1.subscriptionId).toBe(r2.subscriptionId)
    expect([r1.replayed, r2.replayed].sort()).toEqual([false, true])
    expect([r1.manageToken, r2.manageToken].filter(Boolean)).toHaveLength(1)
    expect((await engine.getCustomerSubscriptionCapacity(db, c.companyId)).activeCount).toBe(1)
  })

  it("D. downgrade BUSINESS 25 → FREE : 25 restent, création refusée, overLimit exposé", async () => {
    const c = await seedCompany("BUSINESS")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    await bulkInsertSubscriptions(c.companyId, planId, 25)
    await setPlan(c.companyId, "FREE")
    await expectCode(engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW), "LIMIT_REACHED")
    expect(await engine.getCustomerSubscriptionCapacity(db, c.companyId)).toMatchObject({ activeCount: 25, maxActive: 2, overLimit: true, creationAllowed: false, reason: "LIMIT_REACHED" })
    const rows = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.companyId, c.companyId))
    expect(rows.filter((r) => r.status === "active")).toHaveLength(25)
  })

  it("E. upgrade FREE 2/2 → PRO : création immédiatement possible, contrats inchangés", async () => {
    const c = await seedCompany("FREE")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    await bulkInsertSubscriptions(c.companyId, planId, 2)
    await expectCode(engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW), "LIMIT_REACHED")
    await setPlan(c.companyId, "PRO")
    await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    expect(await engine.getCustomerSubscriptionCapacity(db, c.companyId)).toMatchObject({ activeCount: 3, maxActive: 10 })
  })

  it("F. commission résolue au plan courant, paiement historique jamais modifié", async () => {
    const c = await seedCompany("FREE")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    expect((await engine.resolveCurrentCustomerSubscriptionFee(db, c.companyId)).platformFeeBps).toBe(700)
    await pg.query(
      `INSERT INTO maintenance_payments ("companyId","subscriptionId",type,provider,"providerAccountId","externalPaymentId",status,"grossAmountCents","platformFeeBps","platformFeeAmountCents",currency)
       VALUES ($1,$2,'recurring','stripe','acct_x','pi_1','paid',8900,700,623,'EUR')`,
      [c.companyId, sub.subscriptionId],
    )
    await setPlan(c.companyId, "PRO")
    expect((await engine.resolveCurrentCustomerSubscriptionFee(db, c.companyId)).platformFeeBps).toBe(300)
    await setPlan(c.companyId, "BUSINESS")
    expect((await engine.resolveCurrentCustomerSubscriptionFee(db, c.companyId)).platformFeeBps).toBe(0)
    const p = await pg.query<{ platformFeeBps: number; platformFeeAmountCents: number }>(`SELECT "platformFeeBps","platformFeeAmountCents" FROM maintenance_payments WHERE "subscriptionId"=$1`, [sub.subscriptionId])
    expect(p.rows[0]).toEqual({ platformFeeBps: 700, platformFeeAmountCents: 623 })
  })

  it("idempotence facture : même invoice sur le même compte provider refusée", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    const ins = (pi: string) =>
      pg.query(
        `INSERT INTO maintenance_payments ("companyId","subscriptionId",type,provider,"providerAccountId","externalPaymentId","externalInvoiceId",status,"grossAmountCents","platformFeeBps","platformFeeAmountCents",currency)
         VALUES ($1,$2,'recurring','stripe','acct_inv',$3,'in_1','paid',100,0,0,'EUR')`,
        [c.companyId, sub.subscriptionId, pi],
      )
    await ins("pi_a")
    await expect(ins("pi_b")).rejects.toThrow()
  })

  it("I. snapshots figés + compte provider : modifier la formule / le service / Stripe ne change pas le contrat", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId, { initialCleaningRequired: true, initialServiceId: c.initialServiceId })
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId, { termsAcceptedAt: NOW, termsVersion: "v1" }), NOW)
    expect(sub.status).toBe("pending_initial_cleaning")
    const [before] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))

    const res = await engine.updatePlan(db, c.companyId, owner, planId, planInput(c.includedServiceId, { name: "Autre", priceCents: 1, billingIntervalUnit: "month", billingIntervalCount: 1, includedUsesPerCycle: 5, commitmentUnit: "none", commitmentCount: 0 }))
    expect(res.appliesTo).toBe("new_subscriptions_only")
    await pg.query(`UPDATE services SET name='Renommé', "basePriceCents"=1 WHERE "companyId"=$1`, [c.companyId])
    await pg.query(`UPDATE companies SET "stripeAccountId"='acct_new' WHERE id=$1`, [c.companyId])

    const [after] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(after).toEqual(before)
    expect(after).toMatchObject({
      planNameSnapshot: "Entretien Premium", priceCentsSnapshot: 8900, billingIntervalUnitSnapshot: "week", billingIntervalCountSnapshot: 4,
      includedUsesPerCycleSnapshot: 2, includedServiceNameSnapshot: "Lavage complet", initialServiceNameSnapshot: "Nettoyage initial",
      initialServicePriceCentsSnapshot: 12000, termsVersion: "v1",
    })
    expect(after.providerAccountId).not.toBe("acct_new")
    expect(after.billingAnchorAt).toBeNull()
    expect(() => engine.changeSubscriptionPlan()).toThrow("PLAN_CHANGE_NOT_SUPPORTED")
  })

  it("J. véhicule : un seul actif, ancien conservé", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    await expectCode(engine.changeVehicle(db, c.companyId, owner, sub.subscriptionId, { brand: " ", model: "X" }), "INVALID_VEHICLE")
    await engine.changeVehicle(db, c.companyId, owner, sub.subscriptionId, { brand: "Renault", model: "Clio" }, new Date(NOW.getTime() + 1000))
    const rows = await db.select().from(schema.maintenanceSubscriptionVehicles).where(eq(schema.maintenanceSubscriptionVehicles.subscriptionId, sub.subscriptionId))
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.activeUntil === null)).toHaveLength(1)
    const old = rows.find((r) => r.vehicleBrand === "Peugeot")!
    expect(old).toMatchObject({ vehicleModel: "308", vehiclePlate: "AB-123-CD" })
    expect(old.activeUntil).not.toBeNull()
  })

  it("K. cycle : retry → un seul cycle, N droits créés une fois, anciens droits expirés", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    await expectCode(engine.createCycleIfMissing(db, c.companyId, sub.subscriptionId, NOW), "SUBSCRIPTION_NOT_USABLE")
    await engine.activateSubscription(db, c.companyId, sub.subscriptionId, NOW)
    const [r1, r2] = await Promise.all([
      engine.createCycleIfMissing(db, c.companyId, sub.subscriptionId, NOW),
      engine.createCycleIfMissing(db, c.companyId, sub.subscriptionId, new Date(NOW.getTime() + 3600_000)),
    ])
    expect(r1.cycleId).toBe(r2.cycleId)
    expect([r1.created, r2.created].sort()).toEqual([false, true])
    const uses = await db.select().from(schema.maintenanceUses).where(eq(schema.maintenanceUses.subscriptionId, sub.subscriptionId))
    expect(uses).toHaveLength(2)

    const next = await engine.createCycleIfMissing(db, c.companyId, sub.subscriptionId, new Date(NOW.getTime() + 29 * 86_400_000))
    expect(next.cycleStart.toISOString()).toBe(new Date(NOW.getTime() + 28 * 86_400_000).toISOString())
    const all = await db.select().from(schema.maintenanceUses).where(eq(schema.maintenanceUses.subscriptionId, sub.subscriptionId))
    expect(all.filter((u) => u.cycleId === r1.cycleId).every((u) => u.status === "expired")).toBe(true)
    expect(all.filter((u) => u.cycleId === next.cycleId && u.status === "available")).toHaveLength(2)
  })

  it("L. non-renouvellement ≠ annulation ; engagement : cancelAt = fin du terme", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    const act = await engine.activateSubscription(db, c.companyId, sub.subscriptionId, NOW)
    const later = new Date(NOW.getTime() + 10 * 86_400_000)

    const opt = await engine.requestRenewalOptOut(db, c.companyId, owner, sub.subscriptionId, later)
    expect(opt.serviceUntil?.toISOString()).toBe(act.currentTermEndsAt?.toISOString())
    let [row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(row.status).toBe("active")
    expect(row.cancelAt).toBeNull()
    expect(row.cancelledAt).toBeNull()

    const cancel = await engine.scheduleCancellation(db, c.companyId, owner, sub.subscriptionId, {}, later)
    expect(cancel.status).toBe("cancel_scheduled")
    expect(cancel.cancelAt.toISOString()).toBe(act.currentTermEndsAt!.toISOString())
    await expectCode(engine.scheduleCancellation(db, c.companyId, owner, sub.subscriptionId, { requestedCancelAt: later }, later), "SUBSCRIPTION_NOT_MUTABLE")
    ;[row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(row.cancelledAt).toBeNull()
  })

  it("L. sans engagement : annulation à la prochaine frontière ; force-end : motif obligatoire, audit, pas de suppression", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId, { commitmentUnit: "none", commitmentCount: 0, billingIntervalUnit: "month", billingIntervalCount: 1 })
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    await engine.activateSubscription(db, c.companyId, sub.subscriptionId, NOW)
    const cancel = await engine.scheduleCancellation(db, c.companyId, owner, sub.subscriptionId, {}, new Date("2026-02-01T00:00:00Z"))
    expect(cancel.cancelAt.toISOString()).toBe("2026-02-15T10:00:00.000Z")

    await expectCode(engine.forceEndSubscription(db, c.companyId, owner, sub.subscriptionId, ""), "INVALID_REASON")
    await engine.forceEndSubscription(db, c.companyId, owner, sub.subscriptionId, "Fraude constatée")
    const [row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(row.status).toBe("ended")
    const audit = await db.select().from(schema.maintenanceAuditLog).where(and(eq(schema.maintenanceAuditLog.subscriptionId, sub.subscriptionId), eq(schema.maintenanceAuditLog.action, "subscription_force_ended")))
    expect(audit).toHaveLength(1)
    expect(audit[0].meta).toMatchObject({ reason: "Fraude constatée", refund: "none" })
    expect((await engine.getCustomerSubscriptionCapacity(db, c.companyId)).activeCount).toBe(0)
  })

  it("M. past_due consomme une place", async () => {
    const c = await seedCompany("FREE")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    await bulkInsertSubscriptions(c.companyId, planId, 2, "past_due")
    expect(await engine.getCustomerSubscriptionCapacity(db, c.companyId)).toMatchObject({ activeCount: 2, creationAllowed: false })
  })

  it("N. prépayé : renouvellement forcé à none, prepaidUntil = ancre + N cycles", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId, { commitmentUnit: "none", commitmentCount: 0, billingIntervalUnit: "month", billingIntervalCount: 1, allowPrepaidPayment: true, prepaidBillingCycles: 6 })
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId, { paymentMode: "prepaid" }), NOW)
    const act = await engine.activateSubscription(db, c.companyId, sub.subscriptionId, NOW)
    expect(act.prepaidUntil?.toISOString()).toBe("2026-07-15T10:00:00.000Z")
    const [row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(row.renewalModeSnapshot).toBe("none")
    expect(row.prepaidBillingCyclesSnapshot).toBe(6)
    await expectCode(engine.requestRenewalOptOut(db, c.companyId, owner, sub.subscriptionId), "INVALID_RENEWAL")
  })

  it("O. token : seul le hash est stocké, aucun token/email/téléphone dans l'audit", async () => {
    const c = await seedCompany("PRO")
    const planId = await seedPlan(c.companyId, c.includedServiceId)
    const sub = await engine.createSubscription(db, c.companyId, owner, subInput(planId), NOW)
    const [row] = await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, sub.subscriptionId))
    expect(row.manageTokenHash).toBe(hashManageToken(sub.manageToken!))
    expect(JSON.stringify(row)).not.toContain(sub.manageToken!)
    const audit = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.companyId, c.companyId))
    const dump = JSON.stringify(audit)
    expect(dump).not.toContain(sub.manageToken!)
    expect(dump).not.toContain("jean@example.com")
    expect(dump).not.toContain("0612345678")
    expect(engine.sanitizeAuditMeta({ manageToken: "x", customerEmail: "y", phone: "z", planId: 1 })).toEqual({ planId: 1 })
  })
})

/* ------------------------------ Migration -------------------------------- */

describe("P. migration runtime-core", () => {
  const code = runtimeMigration.replace(/--.*$/gm, "")
  it("strictement additive : aucun DROP / RENAME / DELETE / UPDATE / TRUNCATE / CASCADE", () => {
    expect(code).not.toMatch(/\b(DROP|RENAME|TRUNCATE|CASCADE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/i)
    const statements = code.split(";").map((s) => s.trim()).filter(Boolean)
    for (const s of statements) expect(s).toMatch(/^(ALTER TABLE \w+\s+ADD COLUMN IF NOT EXISTS|CREATE (UNIQUE )?INDEX IF NOT EXISTS)/)
  })
  it("rejouable (idempotente)", async () => {
    await pg.exec(runtimeMigration)
  })
  it("schema.ts en phase : colonnes et index présents", async () => {
    const { getTableConfig } = await import("drizzle-orm/pg-core")
    expect(getTableConfig(schema.maintenancePlans).columns.map((c) => c.name)).toContain("includedServiceId")
    const subCols = getTableConfig(schema.maintenanceSubscriptions).columns.map((c) => c.name)
    expect(subCols).toEqual(expect.arrayContaining(["includedServiceId", "includedServiceNameSnapshot", "creationIdempotencyKey"]))
    const idx = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).indexes.map((i) => i.config.name)
    expect(idx(schema.maintenanceSubscriptions)).toContain("maintenance_subscriptions_creation_idempotency_key")
    expect(idx(schema.maintenancePayments)).toContain("maintenance_payments_external_invoice_key")
    const dbIdx = await pg.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE indexname IN ('maintenance_subscriptions_creation_idempotency_key','maintenance_payments_external_invoice_key')`)
    expect(dbIdx.rows).toHaveLength(2)
  })
})
