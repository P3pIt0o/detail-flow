/**
 * L27 — Test d'intégration OPTIONNEL : vraie race PostgreSQL entre DEUX connexions
 * sur le marquage d'une prestation (verrou FOR UPDATE de l'abonnement).
 *
 * Ne s'exécute QUE si CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL est défini, avec la même
 * garde que customer-subscriptions-concurrency.integration.test.ts (refus prod/main et
 * des hôtes connus du projet). Base jetable, migrations (dont
 * scripts/maintenance-rights-period-migration.sql) appliquées MANUELLEMENT.
 * Lancement : node .claude/hooks/dfguard.mjs test-db tests/l27-consumption-concurrency.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"

const TEST_URL = process.env.CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL
const KNOWN_PROJECT_URL_VARS = ["DATABASE_URL", "NEON_DATABASE_URL", "NEON_DATABASE_URL_UNPOOLED", "NEON_POSTGRES_URL", "NEON_POSTGRES_URL_NON_POOLING", "NEON_POSTGRES_URL_NO_SSL", "NEON_POSTGRES_PRISMA_URL"]
const KNOWN_PROJECT_HOST_VARS = ["NEON_PGHOST", "NEON_PGHOST_UNPOOLED", "NEON_POSTGRES_HOST"]
const normalizeHost = (host: string) => host.toLowerCase().replace("-pooler.", ".")
const hostOf = (url: string) => {
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return null
  }
}

// Copie de la garde du test de concurrence existant (importer ce fichier relancerait ses tests).
function assertSafeTestDatabaseUrl(url: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (!url) throw new Error("CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL absent : test refusé.")
  const host = hostOf(url)
  if (!host) throw new Error("CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL invalide.")
  if (/(^|[^a-z])(prod|production|main)([^a-z]|$)/i.test(url)) throw new Error("URL de test refusée : environnement production/main.")
  const forbidden = new Set<string>()
  for (const name of KNOWN_PROJECT_URL_VARS) {
    const h = env[name] ? hostOf(env[name]!) : null
    if (h) forbidden.add(h)
  }
  for (const name of KNOWN_PROJECT_HOST_VARS) if (env[name]) forbidden.add(normalizeHost(env[name]!))
  if (forbidden.has(host)) throw new Error("URL de test refusée : même hôte qu'une base connue du projet.")
  return url
}

const owner: engine.Actor = { userId: "it-owner", role: "OWNER" }
const NOW = new Date()

describe.skipIf(!TEST_URL)("L27 — marquage simultané d'une prestation (2 connexions réelles)", () => {
  let c1: Client
  let c2: Client
  let db1: engine.Executor
  let db2: engine.Executor

  beforeAll(async () => {
    const url = assertSafeTestDatabaseUrl(TEST_URL)
    c1 = new Client({ connectionString: url })
    c2 = new Client({ connectionString: url })
    await Promise.all([c1.connect(), c2.connect()])
    db1 = drizzle(c1, { schema }) as unknown as engine.Executor
    db2 = drizzle(c2, { schema }) as unknown as engine.Executor
  })

  afterAll(async () => {
    await Promise.allSettled([c1?.end(), c2?.end()])
  })

  /** Abonnement 2 lavages / mois activé, période en cours ouverte. */
  async function seed() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const company = await c1.query<{ id: number }>(
      `INSERT INTO companies (name, slug, "licensePlan", "stripeAccountId", "stripeChargesEnabled", "paymentsEnabled")
       VALUES ($1, $2, 'PRO', $3, true, true) RETURNING id`,
      [`IT L27 ${suffix}`, `it-l27-${suffix}`, `acct_it_${suffix}`],
    )
    const companyId = company.rows[0].id
    const service = await c1.query<{ id: number }>(`INSERT INTO services ("companyId", name, slug) VALUES ($1, 'Lavage IT', $2) RETURNING id`, [companyId, `lavage-it-${suffix}`])
    const { planId } = await engine.createPlan(db1, companyId, owner, {
      name: "Formule IT L27",
      priceCents: 4900,
      currency: "EUR",
      billingIntervalUnit: "month",
      billingIntervalCount: 1,
      includedUsesPerCycle: 2,
      includedServiceId: service.rows[0].id,
      commitmentUnit: "none",
      commitmentCount: 0,
      renewalMode: "open_ended",
      status: "active",
    })
    const { subscriptionId } = await engine.createSubscription(
      db1,
      companyId,
      owner,
      { planId, customer: { name: "Client IT", email: `it-l27-${suffix}@example.test` }, vehicle: { brand: "Peugeot", model: "208" }, paymentMode: "recurring", idempotencyKey: `it-l27-${suffix}` },
      NOW,
    )
    await engine.activateSubscription(db1, companyId, subscriptionId, NOW)
    await engine.createCycleIfMissing(db1, companyId, subscriptionId, new Date(NOW.getTime() + 1000))
    return { companyId, subscriptionId }
  }

  const completedCount = async (companyId: number, subscriptionId: number) =>
    (await db1
      .select({ id: schema.maintenanceUses.id })
      .from(schema.maintenanceUses)
      .where(and(eq(schema.maintenanceUses.companyId, companyId), eq(schema.maintenanceUses.subscriptionId, subscriptionId), eq(schema.maintenanceUses.status, "completed")))).length

  it("1 restante + 2 marquages simultanés : exactement un réussit", async () => {
    const { companyId, subscriptionId } = await seed()
    const at = new Date(NOW.getTime() + 2000)
    await engine.markUseCompleted(db1, companyId, owner, subscriptionId, { expectedRemaining: 2 }, at)

    const results = await Promise.allSettled([
      engine.markUseCompleted(db1, companyId, owner, subscriptionId, { expectedRemaining: 1 }, at),
      engine.markUseCompleted(db2, companyId, owner, subscriptionId, { expectedRemaining: 1 }, at),
    ])
    const ok = results.filter((r): r is PromiseFulfilledResult<engine.MarkUseResult> => r.status === "fulfilled")
    expect(ok.filter((r) => r.value.outcome === "completed")).toHaveLength(1)
    // L'autre est soit « stale » (a vu 0 restante après le verrou), soit refusé : jamais un 2e marquage.
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(CustomerSubscriptionError)
      else if (r.value.outcome !== "completed") expect(r.value.outcome).toBe("stale")
    }
    expect(await completedCount(companyId, subscriptionId)).toBe(2)
  })

  it("double clic simultané (même nombre attendu) à 2 restantes : un seul marquage", async () => {
    const { companyId, subscriptionId } = await seed()
    const at = new Date(NOW.getTime() + 2000)
    const results = await Promise.all([
      engine.markUseCompleted(db1, companyId, owner, subscriptionId, { expectedRemaining: 2 }, at),
      engine.markUseCompleted(db2, companyId, owner, subscriptionId, { expectedRemaining: 2 }, at),
    ])
    expect(results.map((r) => r.outcome).sort()).toEqual(["completed", "stale"])
    expect(await completedCount(companyId, subscriptionId)).toBe(1)
  })
})
