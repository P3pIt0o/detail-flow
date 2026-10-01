/**
 * Test d'intégration OPTIONNEL — vraie race PostgreSQL entre DEUX connexions.
 *
 * Ne s'exécute QUE si CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL est défini
 * (jamais DATABASE_URL). Refuse toute URL dont l'hôte correspond à une base
 * connue du projet (DATABASE_URL / NEON_*) ou qui évoque prod/main.
 *
 * Prérequis : base de test jetable (branche Neon Preview) sur laquelle les
 * migrations ont été appliquées MANUELLEMENT. Ce test n'applique aucune
 * migration et laisse ses fixtures (slugs uniques) sur la branche jetable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"

const TEST_URL = process.env.CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL

const KNOWN_PROJECT_URL_VARS = [
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "NEON_DATABASE_URL_UNPOOLED",
  "NEON_POSTGRES_URL",
  "NEON_POSTGRES_URL_NON_POOLING",
  "NEON_POSTGRES_URL_NO_SSL",
  "NEON_POSTGRES_PRISMA_URL",
]
const KNOWN_PROJECT_HOST_VARS = ["NEON_PGHOST", "NEON_PGHOST_UNPOOLED", "NEON_POSTGRES_HOST"]

const normalizeHost = (host: string) => host.toLowerCase().replace("-pooler.", ".")

function hostOf(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return null
  }
}

export function assertSafeTestDatabaseUrl(url: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (!url) throw new Error("CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL absent : test refusé.")
  const host = hostOf(url)
  if (!host) throw new Error("CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL invalide.")
  if (/(^|[^a-z])(prod|production|main)([^a-z]|$)/i.test(url)) {
    throw new Error("URL de test refusée : elle évoque un environnement production/main.")
  }
  const forbidden = new Set<string>()
  for (const name of KNOWN_PROJECT_URL_VARS) {
    const h = env[name] ? hostOf(env[name]!) : null
    if (h) forbidden.add(h)
  }
  for (const name of KNOWN_PROJECT_HOST_VARS) {
    if (env[name]) forbidden.add(normalizeHost(env[name]!))
  }
  if (forbidden.has(host)) {
    throw new Error("URL de test refusée : même hôte qu'une base connue du projet.")
  }
  return url
}

const owner: engine.Actor = { userId: "it-owner", role: "OWNER" }
const NOW = new Date()

describe.skipIf(!TEST_URL)("concurrence réelle PostgreSQL (2 connexions)", () => {
  let c1: Client
  let c2: Client

  beforeAll(async () => {
    const url = assertSafeTestDatabaseUrl(TEST_URL)
    c1 = new Client({ connectionString: url })
    c2 = new Client({ connectionString: url })
    await Promise.all([c1.connect(), c2.connect()])
  })

  afterAll(async () => {
    await Promise.allSettled([c1?.end(), c2?.end()])
  })

  it("FREE 1/2 + deux créations simultanées : exactement une réussit, l'autre LIMIT_REACHED", async () => {
    const db1 = drizzle(c1, { schema }) as unknown as engine.Executor
    const db2 = drizzle(c2, { schema }) as unknown as engine.Executor
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const company = await c1.query<{ id: number }>(
      `INSERT INTO companies (name, slug, "licensePlan", "stripeAccountId", "stripeChargesEnabled", "paymentsEnabled")
       VALUES ($1, $2, 'FREE', $3, true, true) RETURNING id`,
      [`IT concurrency ${suffix}`, `it-cs-${suffix}`, `acct_it_${suffix}`],
    )
    const companyId = company.rows[0].id
    const service = await c1.query<{ id: number }>(
      `INSERT INTO services ("companyId", name, slug) VALUES ($1, 'Lavage IT', $2) RETURNING id`,
      [companyId, `lavage-it-${suffix}`],
    )
    const { planId } = await engine.createPlan(db1, companyId, owner, {
      name: "Formule IT",
      priceCents: 4900,
      currency: "EUR",
      billingIntervalUnit: "month",
      billingIntervalCount: 1,
      includedUsesPerCycle: 1,
      includedServiceId: service.rows[0].id,
      commitmentUnit: "none",
      commitmentCount: 0,
      renewalMode: "open_ended",
      status: "active",
    })

    const input = (n: number): engine.CreateSubscriptionInput => ({
      planId,
      customer: { name: `Client ${n}`, email: `it-${suffix}-${n}@example.test` },
      vehicle: { brand: "Peugeot", model: "208" },
      paymentMode: "recurring",
      idempotencyKey: `it-concurrency-${suffix}-${n}`,
    })

    await engine.createSubscription(db1, companyId, owner, input(0), NOW)

    const results = await Promise.allSettled([
      engine.createSubscription(db1, companyId, owner, input(1), NOW),
      engine.createSubscription(db2, companyId, owner, input(2), NOW),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(CustomerSubscriptionError)
    expect((rejected[0].reason as CustomerSubscriptionError).code).toBe("LIMIT_REACHED")
    expect((await engine.getCustomerSubscriptionCapacity(db1, companyId)).activeCount).toBe(2)
  })
})

describe("garde-fou URL de test (toujours exécuté, aucune connexion)", () => {
  const env = {
    DATABASE_URL: "postgresql://u:p@ep-prod-abc-pooler.eu-central-1.aws.neon.tech/neondb",
    NEON_PGHOST: "ep-other-xyz.eu-central-1.aws.neon.tech",
  } as unknown as NodeJS.ProcessEnv

  it("refuse URL absente", () => {
    expect(() => assertSafeTestDatabaseUrl(undefined, env)).toThrow()
  })
  it("refuse le même hôte qu'une base connue (pooler ou non)", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@ep-prod-abc.eu-central-1.aws.neon.tech/x", env)).toThrow()
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@ep-other-xyz.eu-central-1.aws.neon.tech/x", env)).toThrow()
  })
  it("refuse une URL évoquant prod/main", () => {
    const empty = {} as NodeJS.ProcessEnv
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@ep-z.neon.tech/main", empty)).toThrow()
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@production-db.example/x", empty)).toThrow()
  })
  it("accepte un hôte de branche Preview distinct", () => {
    expect(assertSafeTestDatabaseUrl("postgresql://u:p@ep-preview-123.eu-central-1.aws.neon.tech/neondb", env)).toContain("ep-preview-123")
  })
})
