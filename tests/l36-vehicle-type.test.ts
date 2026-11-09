import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

vi.mock("server-only", () => ({}))
vi.mock("@vercel/firewall", () => ({ checkRateLimit: async () => ({ rateLimited: false }) }))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { DEFAULT_WIZARD_FORM, wizardFromConfig, wizardToPlanConfigInput, wizardVehicleTypeChange } from "@/lib/customer-subscriptions/plan-form"
import { validatePlanConfig, type PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"
import { loadPublicOffer } from "@/lib/customer-subscriptions/public-offer"
import { groupPublicPlans } from "@/lib/customer-subscriptions/plan-groups"
import { listPlanVehicleTypeOptions, readPlanVehicleTypeId } from "@/lib/customer-subscriptions/plan-vehicle-type"

/** L36 — catégorie de véhicule d'une formule : migration tolérée, contrôle tenant, vue publique. */

const MIGRATION = "scripts/maintenance-plans-vehicle-type-migration.sql"
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }
let pg: PGlite
let db: engine.Executor
type Tenant = { companyId: number; serviceId: number; types: number[] }
let A: Tenant
let B: Tenant

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return "OK"
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

async function company(slug: string): Promise<Tenant> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies (slug,"licensePlan","customerSubscriptionPublicMode","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ($1,'BUSINESS','request',$2,true,true) RETURNING id`,
    [slug, `acct_${slug}`],
  )
  const companyId = r.rows[0].id
  await pg.query(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,$2,$3)`, [companyId, slug, `pro@${slug}.test`])
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  const types: number[] = []
  // Ordre du pro (sortOrder) volontairement différent de l'ordre d'insertion ; « Ancienne » est inactive.
  for (const [name, order, active] of [["SUV", 3, true], ["Citadine", 1, true], ["Berline", 2, true], ["Ancienne", 0, false]] as const) {
    const t = await pg.query<{ id: number }>(`INSERT INTO vehicle_types ("companyId",name,slug,"sortOrder",active) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [companyId, name, name.toLowerCase(), order, active])
    types.push(t.rows[0].id)
  }
  return { companyId, serviceId: s.rows[0].id, types }
}

const formule = (t: Tenant, over: Partial<typeof DEFAULT_WIZARD_FORM> = {}): PlanConfigInput =>
  wizardToPlanConfigInput({ ...DEFAULT_WIZARD_FORM, name: "Confort", includedServiceId: t.serviceId, priceEuros: "359", ...over })

const columnValue = async (planId: number) => (await pg.query<{ v: number | null }>(`SELECT "vehicleTypeId" AS v FROM maintenance_plans WHERE id = $1`, [planId])).rows[0]?.v ?? null

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text, status text NOT NULL DEFAULT 'ACTIVE', "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE settings (id serial PRIMARY KEY, "companyId" integer NOT NULL UNIQUE, "businessName" text, "businessEmail" text);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
    CREATE TABLE vehicle_types (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id), name text NOT NULL, slug text NOT NULL, "sortOrder" integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true);
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

describe("avant migration : rien ne casse, la catégorie est ignorée", () => {
  it("création, modification et page publique fonctionnent sans la colonne", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: "Avant" }), A.types[0])
    expect(await code(engine.updatePlan(db, A.companyId, owner, planId, formule(A, { name: "Avant" }), null))).toBe("OK")
    expect(await readPlanVehicleTypeId(db, A.companyId, planId)).toBeNull()
    expect(await listPlanVehicleTypeOptions(db, A.companyId)).toEqual([])
    const offer = await loadPublicOffer(db, A.companyId)
    expect(offer?.plans.find((p) => p.id === planId)?.vehicleType).toBeNull()
    await pg.query(`UPDATE maintenance_plans SET status = 'archived' WHERE id = $1`, [planId])
  })

  it("une table maintenance_plans d'un AUTRE schéma ne fait pas croire la colonne présente", async () => {
    await pg.exec(`CREATE SCHEMA autre; CREATE TABLE autre.maintenance_plans (id serial PRIMARY KEY, "vehicleTypeId" integer);`)
    const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: "Schéma" }), A.types[1])
    expect(await readPlanVehicleTypeId(db, A.companyId, planId)).toBeNull()
    expect(await listPlanVehicleTypeOptions(db, A.companyId)).toEqual([])
    await pg.exec(`DROP SCHEMA autre CASCADE`)
    await pg.query(`UPDATE maintenance_plans SET status = 'archived' WHERE id = $1`, [planId])
  })
})

describe("migration", () => {
  it("additive, idempotente (rejouée 2 fois), en-tête commenté, jamais destructive", async () => {
    const sqlText = read(MIGRATION)
    expect(sqlText.startsWith("-- ")).toBe(true)
    expect(sqlText).toMatch(/ADD COLUMN IF NOT EXISTS "vehicleTypeId" integer REFERENCES "vehicle_types"\("id"\) ON DELETE SET NULL/)
    expect(sqlText.replace(/^--.*$/gm, "").replace(/ON DELETE SET NULL/g, "")).not.toMatch(/\b(DROP|RENAME|ALTER COLUMN|TYPE|UPDATE|DELETE)\b/i)
    await pg.exec(sqlText)
    await pg.exec(sqlText)
    const cols = await pg.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'maintenance_plans' AND column_name = 'vehicleTypeId'`)
    expect(cols.rows).toHaveLength(1)
  })
})

describe("après migration : enregistrement et sémantique undefined / null", () => {
  it("options = catégories ACTIVES du tenant, ordre du pro", async () => {
    expect((await listPlanVehicleTypeOptions(db, A.companyId)).map((t) => t.name)).toEqual(["Citadine", "Berline", "SUV"])
  })

  it("création avec catégorie, undefined = inchangé (ancien formulaire), null = effacement", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A), A.types[2])
    expect(await columnValue(planId)).toBe(A.types[2])
    await engine.updatePlan(db, A.companyId, owner, planId, formule(A))
    expect(await columnValue(planId)).toBe(A.types[2])
    await engine.updatePlan(db, A.companyId, owner, planId, formule(A), A.types[1])
    expect(await readPlanVehicleTypeId(db, A.companyId, planId)).toBe(A.types[1])
    await engine.updatePlan(db, A.companyId, owner, planId, formule(A), null)
    expect(await columnValue(planId)).toBeNull()
  })

  it("catégorie devenue inactive : enregistrer depuis le wizard sans toucher au champ la conserve", async () => {
    const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: "Gardée" }), A.types[1])
    await pg.query(`UPDATE vehicle_types SET active = false WHERE id = $1`, [A.types[1]])
    const initial = { ...DEFAULT_WIZARD_FORM, vehicleTypeId: await readPlanVehicleTypeId(db, A.companyId, planId) }
    const edited = { ...initial, name: "Gardée v2" }
    const sent = wizardVehicleTypeChange(initial, edited)
    expect(sent).toBeUndefined()
    await engine.updatePlan(db, A.companyId, owner, planId, formule(A, { name: "Gardée v2" }), sent)
    expect(await columnValue(planId)).toBe(A.types[1])
    // Changement explicite vers « Toutes les catégories » : effacement voulu.
    await engine.updatePlan(db, A.companyId, owner, planId, formule(A, { name: "Gardée v2" }), wizardVehicleTypeChange(initial, { vehicleTypeId: null }))
    expect(await columnValue(planId)).toBeNull()
    await pg.query(`UPDATE vehicle_types SET active = true WHERE id = $1`, [A.types[1]])
    await pg.query(`UPDATE maintenance_plans SET status = 'archived' WHERE id = $1`, [planId])
  })

  it("valeurs invalides ou catégorie inactive : INVALID_PLAN, rien n'est écrit", async () => {
    const before = (await pg.query(`SELECT count(*)::int AS n FROM maintenance_plans`)).rows[0]
    for (const bad of ["1", 0, -3, 1.5, 2 ** 40, A.types[3], 999_999]) {
      expect(await code(engine.createPlan(db, A.companyId, owner, formule(A, { name: "Refusée" }), bad))).toBe("INVALID_PLAN")
    }
    expect((await pg.query(`SELECT count(*)::int AS n FROM maintenance_plans`)).rows[0]).toEqual(before)
  })
})

describe("isolation tenant A / tenant B — catégorie de véhicule", () => {
  it("B ne peut pas rattacher une formule (création ou modification) à une catégorie de A : rien n'est écrit", async () => {
    const before = (await pg.query(`SELECT count(*)::int AS n FROM maintenance_plans WHERE "companyId" = $1`, [B.companyId])).rows[0]
    expect(await code(engine.createPlan(db, B.companyId, owner, formule(B, { name: "Intrus" }), A.types[1]))).toBe("INVALID_PLAN")
    expect((await pg.query(`SELECT count(*)::int AS n FROM maintenance_plans WHERE "companyId" = $1`, [B.companyId])).rows[0]).toEqual(before)

    const { planId } = await engine.createPlan(db, B.companyId, owner, formule(B, { name: "Formule B" }), B.types[1])
    expect(await code(engine.updatePlan(db, B.companyId, owner, planId, formule(B, { name: "Renommée" }), A.types[0]))).toBe("INVALID_PLAN")
    expect(await columnValue(planId)).toBe(B.types[1])
    const [row] = (await pg.query<{ name: string }>(`SELECT name FROM maintenance_plans WHERE id = $1`, [planId])).rows
    expect(row.name).toBe("Formule B")
  })

  it("B ne voit pas les catégories de A, ni la catégorie d'une formule de A", async () => {
    const ids = (await listPlanVehicleTypeOptions(db, B.companyId)).map((t) => t.id)
    expect(ids.some((id) => A.types.includes(id))).toBe(false)
    const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: "Secrète" }), A.types[0])
    expect(await readPlanVehicleTypeId(db, B.companyId, planId)).toBeNull()
    expect(await code(engine.updatePlan(db, B.companyId, owner, planId, formule(B), B.types[0]))).toBe("INVALID_PLAN")
    expect(await columnValue(planId)).toBe(A.types[0])
  })
})

describe("vue publique regroupable", () => {
  it("3 noms × 3 catégories → 3 cartes, options dans l'ordre du pro ; libellé et rang seulement", async () => {
    await pg.query(`UPDATE maintenance_plans SET status = 'archived' WHERE "companyId" = $1`, [A.companyId])
    const ids: Record<string, number> = {}
    for (const [name, price] of [["Essentiel", 29], ["Confort", 45], ["Premium", 69]] as const)
      for (const [i, t] of A.types.slice(0, 3).entries()) {
        const { planId } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: i === 1 ? ` ${name.toUpperCase()}  ` : name, priceEuros: String(price + i * 5) }), t)
        ids[`${name}-${i}`] = planId
      }
    const { planId: solo } = await engine.createPlan(db, A.companyId, owner, formule(A, { name: "Sans catégorie", priceEuros: "10" }), null)
    const offer = await loadPublicOffer(db, A.companyId)
    expect(offer).not.toBeNull()
    expect(JSON.stringify(offer)).not.toContain('"vehicleTypeId"')
    const cards = groupPublicPlans(offer!.plans)
    expect(cards).toHaveLength(4)
    expect(cards[0]).toMatchObject({ kind: "single", plan: { id: solo, vehicleType: null } })
    const groups = cards.filter((c) => c.kind === "group")
    expect(groups).toHaveLength(3)
    for (const g of groups) {
      if (g.kind !== "group") continue
      expect(g.options.map((o) => o.label)).toEqual(["Citadine", "Berline", "SUV"])
    }
    const essentiel = groups[0]
    expect(essentiel.kind === "group" && essentiel.options.map((o) => o.plan.id)).toEqual([ids["Essentiel-1"], ids["Essentiel-2"], ids["Essentiel-0"]])
  })

  it("catégorie désactivée : la formule redevient une carte simple", async () => {
    await pg.query(`UPDATE vehicle_types SET active = false WHERE id = $1`, [A.types[0]])
    const offer = await loadPublicOffer(db, A.companyId)
    const suvPlans = offer!.plans.filter((p) => p.vehicleType == null && p.name !== "Sans catégorie")
    expect(suvPlans).toHaveLength(3)
    await pg.query(`UPDATE vehicle_types SET active = true WHERE id = $1`, [A.types[0]])
  })
})

describe("wizard : description aller-retour", () => {
  it("wizardToPlanConfigInput → validation → wizardFromConfig conserve la description ; la catégorie reste hors configuration", () => {
    const input = wizardToPlanConfigInput({ ...DEFAULT_WIZARD_FORM, name: "Confort", includedServiceId: 1, priceEuros: "359", description: "Lavage complet et aspiration.", vehicleTypeId: 7 })
    expect(input).not.toHaveProperty("vehicleTypeId")
    const v = validatePlanConfig(input)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value).not.toHaveProperty("vehicleTypeId")
    expect(wizardFromConfig(v.value)).toMatchObject({ description: "Lavage complet et aspiration.", vehicleTypeId: null })
    expect(wizardToPlanConfigInput({ ...DEFAULT_WIZARD_FORM, description: "   " }).description).toBeNull()
  })
})
