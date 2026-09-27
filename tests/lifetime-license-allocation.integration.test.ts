import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client, Pool } from "pg"
import {
  activateLifetimeSlot,
  getLifetimeAvailability,
  releaseLifetimeReservation,
  reserveLifetimeSlot,
} from "@/lib/billing/lifetime-server"
import { LifetimeError } from "@/lib/billing/lifetime"

/**
 * Test d'intégration RÉEL (LOT S2.5A) : migration + service Lifetime sur
 * PostgreSQL, dans un SCHÉMA TEMPORAIRE ISOLÉ (jamais `public`), supprimé en
 * fin de test. Connexion DIRECTE privilégiée (non poolée) pour que
 * `SET search_path` reste attaché à la session.
 * Sans base disponible, le test est ignoré.
 */

const connectionString =
  process.env.NEON_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
const MIGRATION_SQL = readFileSync(
  resolve(process.cwd(), "scripts/lifetime-license-allocation-migration.sql"),
  "utf8",
)
const TEST_SCHEMA = `df_lifetime_${Date.now().toString(36)}`
const T = `"lifetime_license_allocations"`

async function lifetimeCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    return e instanceof LifetimeError ? e.code : `DB:${(e as Error).message}`
  }
  return "RESOLVED"
}

describe.skipIf(!connectionString)("Lifetime inventory (integration réelle)", () => {
  let admin: Client
  let pool: Pool
  const deps = () => ({ pool })

  async function createCompany(
    slug: string,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const cols = ["name", "slug", ...Object.keys(extra)]
    const values = [`Garage ${slug}`, slug, ...Object.values(extra)]
    const { rows } = await admin.query(
      `INSERT INTO "companies" (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING "id"`,
      values,
    )
    return rows[0].id as number
  }

  /** Remplit le stock via SQL direct (companyId NULL = tenants supprimés). */
  async function seed(status: "ACTIVE" | "RESERVED" | "RESERVED_EXPIRED" | "RELEASED", n: number) {
    if (n === 0) return
    const sets: Record<string, string> = {
      ACTIVE: `'ACTIVE', NULL, now(), NULL`,
      RESERVED: `'RESERVED', now() + interval '30 minutes', NULL, NULL`,
      RESERVED_EXPIRED: `'RESERVED', now() - interval '1 minute', NULL, NULL`,
      RELEASED: `'RELEASED', NULL, NULL, now()`,
    }
    await admin.query(
      `INSERT INTO ${T} ("status", "reservationExpiresAt", "activatedAt", "releasedAt", "paymentPlan")
       SELECT ${sets[status]}, 'single' FROM generate_series(1, $1)`,
      [n],
    )
  }

  async function consumed(): Promise<number> {
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM ${T}
        WHERE "status" = 'ACTIVE' OR ("status" = 'RESERVED' AND "reservationExpiresAt" > now())`,
    )
    return rows[0].n
  }

  beforeAll(async () => {
    admin = new Client({ connectionString })
    await admin.connect()
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`)
    await admin.query(`SET search_path TO "${TEST_SCHEMA}"`)

    // Sous-ensemble fidèle de `companies` (colonnes lues/écrites + témoins Connect).
    await admin.query(`
      CREATE TABLE "companies" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "licensePlan" text,
        "licenseGeneration" text,
        "licenseAssignedAt" timestamp,
        "licenseAssignedByUserId" text,
        "platformFeeBps" integer,
        "stripeAccountId" text,
        "paymentsEnabled" boolean NOT NULL DEFAULT false,
        "phone" text,
        "billingMode" text NOT NULL DEFAULT 'free',
        "stripeCustomerId" text,
        "stripeSubscriptionId" text,
        "subscriptionStatus" text,
        "subscriptionPriceId" text,
        "currentPeriodEnd" timestamp,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await admin.query(`
      CREATE TABLE "license_audit_log" (
        "id" serial PRIMARY KEY,
        "companyId" integer NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
        "actorUserId" text,
        "action" text NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await admin.query(MIGRATION_SQL)

    pool = new Pool({ connectionString, max: 4 })
    pool.on("connect", (client) => {
      void client.query(`SET search_path TO "${TEST_SCHEMA}"`)
    })
  })

  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await admin.end()
    }
  })

  // TRUNCATE ne déclenche pas les triggers ligne : réservé au nettoyage de test.
  beforeEach(async () => {
    await admin.query(`TRUNCATE ${T} RESTART IDENTITY`)
  })

  /* ----------------------------- Migration ------------------------------- */

  it("migration ré-exécutable sans erreur", async () => {
    await expect(admin.query(MIGRATION_SQL)).resolves.toBeDefined()
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM pg_trigger
        WHERE tgname = 'lifetime_license_allocations_guard_trg' AND tgrelid = '${T}'::regclass`,
    )
    expect(rows[0].n).toBe(1)
  })

  it("table, colonnes et index créés", async () => {
    const { rows: cols } = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'lifetime_license_allocations'`,
      [TEST_SCHEMA],
    )
    const names = new Set(cols.map((r) => r.column_name))
    for (const c of [
      "id", "companyId", "companyNameSnapshot", "status", "paymentPlan", "reservedAt",
      "reservationExpiresAt", "activatedAt", "releasedAt", "createdAt", "updatedAt",
    ]) {
      expect(names.has(c), c).toBe(true)
    }
    const { rows: idx } = await admin.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'lifetime_license_allocations'`,
      [TEST_SCHEMA],
    )
    expect(idx.map((r) => r.indexname)).toContain("lifetime_license_allocations_company_open_key")
  })

  it("FK companyId -> companies.id ON DELETE SET NULL", async () => {
    const { rows } = await admin.query(
      `SELECT rc.delete_rule, ccu.table_name AS ref_table, ccu.column_name AS ref_col
         FROM information_schema.referential_constraints rc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = rc.constraint_name AND ccu.constraint_schema = rc.constraint_schema
        WHERE rc.constraint_schema = $1`,
      [TEST_SCHEMA],
    )
    expect(rows).toContainEqual({ delete_rule: "SET NULL", ref_table: "companies", ref_col: "id" })
  })

  it("CHECK status et paymentPlan refusent les valeurs arbitraires", async () => {
    await expect(
      admin.query(`INSERT INTO ${T} ("status", "paymentPlan", "releasedAt") VALUES ('SOLD', 'single', now())`),
    ).rejects.toThrow()
    await expect(
      admin.query(`INSERT INTO ${T} ("status", "paymentPlan", "releasedAt") VALUES ('RELEASED', 'split_3x', now())`),
    ).rejects.toThrow()
    // RESERVED sans expiration : refusé (cohérence état / horodatage).
    await expect(admin.query(`INSERT INTO ${T} ("status", "paymentPlan") VALUES ('RESERVED', 'single')`)).rejects.toThrow()
  })

  /* ----------------------------- Capacité -------------------------------- */

  it("49 consommés => réservation possible ; 50 => refus ; 51e SQL direct => refus DB", async () => {
    await seed("ACTIVE", 40)
    await seed("RESERVED", 9)
    const a = await createCompany("cap-a")
    const b = await createCompany("cap-b")

    const alloc = await reserveLifetimeSlot({ companyId: a, paymentPlan: "single" }, deps())
    expect(alloc.status).toBe("RESERVED")
    expect(await getLifetimeAvailability(deps())).toEqual({
      max: 50, active: 40, reserved: 10, used: 50, remaining: 0, soldOut: true,
    })

    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: b, paymentPlan: "split_2x" }, deps()))).toBe("SOLD_OUT")
    // Même en contournant le service, la DB refuse la 51e.
    await expect(
      admin.query(`INSERT INTO ${T} ("status", "paymentPlan", "activatedAt") VALUES ('ACTIVE', 'single', now())`),
    ).rejects.toThrow(/LIFETIME_CAP_REACHED/)
    expect(await consumed()).toBe(50)
  })

  it("réservations expirées et RELEASED ne comptent plus ; ACTIVE compte toujours", async () => {
    await seed("RESERVED_EXPIRED", 30)
    await seed("RELEASED", 30)
    await seed("ACTIVE", 49)
    expect(await getLifetimeAvailability(deps())).toMatchObject({ active: 49, reserved: 0, remaining: 1 })
    const c = await createCompany("exp-c")
    await expect(reserveLifetimeSlot({ companyId: c, paymentPlan: "single" }, deps())).resolves.toBeDefined()
    expect(await consumed()).toBe(50)
  })

  it("une réservation expirée peut être remplacée ; l'ancienne reste en historique (RELEASED)", async () => {
    const d = await createCompany("exp-d")
    await admin.query(
      `INSERT INTO ${T} ("companyId", "status", "paymentPlan", "reservationExpiresAt")
       VALUES ($1, 'RESERVED', 'single', now() - interval '1 minute')`,
      [d],
    )
    const fresh = await reserveLifetimeSlot({ companyId: d, paymentPlan: "single" }, deps())
    const { rows } = await admin.query(`SELECT "id", "status" FROM ${T} WHERE "companyId" = $1 ORDER BY "id"`, [d])
    expect(rows).toEqual([
      { id: 1, status: "RELEASED" },
      { id: fresh.id, status: "RESERVED" },
    ])
  })

  /* ---------------------------- Concurrence ------------------------------ */

  it("49 consommés + 2 réservations simultanées (service) => une seule réussit, total 50", async () => {
    await seed("ACTIVE", 49)
    const e = await createCompany("race-e")
    const f = await createCompany("race-f")
    const results = await Promise.allSettled([
      reserveLifetimeSlot({ companyId: e, paymentPlan: "single" }, deps()),
      reserveLifetimeSlot({ companyId: f, paymentPlan: "single" }, deps()),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult
    expect((rejected.reason as LifetimeError).code).toBe("SOLD_OUT")
    expect(await consumed()).toBe(50)
  })

  it("49 consommés + 2 INSERT SQL concurrents SANS le service => la garde DB n'en laisse passer qu'un", async () => {
    await seed("ACTIVE", 49)
    const c1 = await pool.connect()
    const c2 = await pool.connect()
    try {
      await c1.query("BEGIN")
      await c2.query("BEGIN")
      const insert = `INSERT INTO ${T} ("status", "paymentPlan", "activatedAt") VALUES ('ACTIVE', 'single', now())`
      // c1 prend le verrou du stock ; c2 attend dans le trigger.
      await c1.query(insert)
      const pending = c2.query(insert).then(
        () => "ok",
        (err: Error) => err.message,
      )
      await new Promise((r) => setTimeout(r, 300))
      await c1.query("COMMIT")
      const outcome = await pending
      await c2.query("ROLLBACK").catch(() => undefined)
      expect(outcome).toMatch(/LIFETIME_CAP_REACHED/)
    } finally {
      c1.release()
      c2.release()
    }
    expect(await consumed()).toBe(50)
  })

  /* -------------------------- Une par entreprise ------------------------- */

  it("une entreprise ne peut pas consommer deux slots (service + DB)", async () => {
    const g = await createCompany("dup-g")
    await reserveLifetimeSlot({ companyId: g, paymentPlan: "single" }, deps())
    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: g, paymentPlan: "single" }, deps()))).toBe(
      "ALREADY_ALLOCATED",
    )
    await expect(
      admin.query(
        `INSERT INTO ${T} ("companyId", "status", "paymentPlan", "reservationExpiresAt")
         VALUES ($1, 'RESERVED', 'single', now() + interval '30 minutes')`,
        [g],
      ),
    ).rejects.toThrow(/company_open_key/)
  })

  it("FOUNDER, abonnement existant, entreprise inconnue, plan inconnu : réservation refusée", async () => {
    const founder = await createCompany("founder", { licensePlan: "FOUNDER" })
    const subbed = await createCompany("subbed", { stripeSubscriptionId: "sub_reserve", subscriptionStatus: "active" })
    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: founder, paymentPlan: "single" }, deps()))).toBe(
      "FOUNDER_NOT_ELIGIBLE",
    )
    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: subbed, paymentPlan: "single" }, deps()))).toBe(
      "SUBSCRIPTION_CONVERSION_UNSUPPORTED",
    )
    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: 999999, paymentPlan: "single" }, deps()))).toBe(
      "COMPANY_NOT_FOUND",
    )
    expect(await lifetimeCode(reserveLifetimeSlot({ companyId: founder, paymentPlan: "3x" }, deps()))).toBe(
      "INVALID_PAYMENT_PLAN",
    )
    expect(await consumed()).toBe(0)
  })

  /* ------------------------------ Activation ----------------------------- */

  it("activation : lifetime + BUSINESS + 0 bps, Connect et données métier intacts, idempotente", async () => {
    const h = await createCompany("act-h", {
      licensePlan: "FREE",
      stripeAccountId: "acct_keep",
      paymentsEnabled: true,
      phone: "0600000000",
      platformFeeBps: 200,
      stripeCustomerId: "cus_keep",
    })
    const bystander = await createCompany("act-bystander", { platformFeeBps: 150 })
    const res = await reserveLifetimeSlot({ companyId: h, paymentPlan: "split_2x" }, deps())
    const out = await activateLifetimeSlot({ companyId: h, allocationId: res.id, actorUserId: "admin_1" }, deps())
    expect(out.alreadyActive).toBe(false)
    expect(out.allocation.status).toBe("ACTIVE")
    expect(out.allocation.activatedAt).toBeInstanceOf(Date)

    const { rows } = await admin.query(`SELECT * FROM "companies" WHERE "id" = $1`, [h])
    const company = rows[0]
    expect(company.billingMode).toBe("lifetime")
    expect(company.licensePlan).toBe("BUSINESS")
    expect(company.platformFeeBps).toBe(0)
    expect(company.licenseAssignedAt).toBeInstanceOf(Date)
    expect(company.licenseAssignedByUserId).toBe("admin_1")
    expect(company.licenseGeneration).toBeNull()
    expect(company.stripeSubscriptionId).toBeNull()
    expect(company.subscriptionStatus).toBeNull()
    expect(company.subscriptionPriceId).toBeNull()
    expect(company.currentPeriodEnd).toBeNull()
    expect(company.cancelAtPeriodEnd).toBe(false)
    // Stripe Connect / données métier inchangés.
    expect(company.stripeAccountId).toBe("acct_keep")
    expect(company.paymentsEnabled).toBe(true)
    expect(company.phone).toBe("0600000000")
    expect(company.name).toBe("Garage act-h")
    expect(company.stripeCustomerId).toBe("cus_keep")

    const { rows: other } = await admin.query(`SELECT "platformFeeBps", "billingMode" FROM "companies" WHERE "id" = $1`, [
      bystander,
    ])
    expect(other[0]).toEqual({ platformFeeBps: 150, billingMode: "free" })

    const { rows: audit } = await admin.query(`SELECT "action", "metadata" FROM "license_audit_log" WHERE "companyId" = $1`, [h])
    expect(audit).toHaveLength(1)
    expect(audit[0].metadata).toMatchObject({ event: "LIFETIME_ACTIVATED", newPlan: "BUSINESS", platformFeeBps: 0 })

    // Deuxième activation : aucun doublon, aucune écriture.
    const again = await activateLifetimeSlot({ companyId: h, allocationId: res.id }, deps())
    expect(again.alreadyActive).toBe(true)
    expect(await consumed()).toBe(1)
    const { rows: audit2 } = await admin.query(`SELECT count(*)::int AS n FROM "license_audit_log" WHERE "companyId" = $1`, [h])
    expect(audit2[0].n).toBe(1)
  })

  it("abonnement existant (sub_test) : activation refusée, aucune modification partielle", async () => {
    const i = await createCompany("sub-i", { stripeSubscriptionId: "sub_test", licensePlan: "PRO", platformFeeBps: 100 })
    const { rows } = await admin.query(
      `INSERT INTO ${T} ("companyId", "status", "paymentPlan", "reservationExpiresAt")
       VALUES ($1, 'RESERVED', 'single', now() + interval '30 minutes') RETURNING "id"`,
      [i],
    )
    const allocationId = rows[0].id
    try {
      await activateLifetimeSlot({ companyId: i, allocationId }, deps())
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as LifetimeError).code).toBe("SUBSCRIPTION_CONVERSION_UNSUPPORTED")
      expect((e as LifetimeError).message).toBe("Conversion abonnement → Lifetime non prise en charge dans ce lot.")
    }
    const { rows: c } = await admin.query(
      `SELECT "billingMode", "licensePlan", "platformFeeBps", "stripeSubscriptionId" FROM "companies" WHERE "id" = $1`,
      [i],
    )
    expect(c[0]).toEqual({ billingMode: "free", licensePlan: "PRO", platformFeeBps: 100, stripeSubscriptionId: "sub_test" })
    const { rows: a } = await admin.query(`SELECT "status" FROM ${T} WHERE "id" = $1`, [allocationId])
    expect(a[0].status).toBe("RESERVED")
  })

  it("activation refusée : réservation expirée, RELEASED, ou autre tenant", async () => {
    const j = await createCompany("act-j")
    const k = await createCompany("act-k")
    const { rows: expired } = await admin.query(
      `INSERT INTO ${T} ("companyId", "status", "paymentPlan", "reservationExpiresAt")
       VALUES ($1, 'RESERVED', 'single', now() - interval '1 minute') RETURNING "id"`,
      [j],
    )
    expect(await lifetimeCode(activateLifetimeSlot({ companyId: j, allocationId: expired[0].id }, deps()))).toBe(
      "RESERVATION_EXPIRED",
    )

    const res = await reserveLifetimeSlot({ companyId: k, paymentPlan: "single" }, deps())
    // Tenant isolation : j ne peut pas activer l'allocation de k.
    expect(await lifetimeCode(activateLifetimeSlot({ companyId: j, allocationId: res.id }, deps()))).toBe(
      "ALLOCATION_NOT_FOUND",
    )
    await releaseLifetimeReservation({ companyId: k, allocationId: res.id }, deps())
    expect(await lifetimeCode(activateLifetimeSlot({ companyId: k, allocationId: res.id }, deps()))).toBe(
      "RESERVATION_RELEASED",
    )
    const { rows } = await admin.query(`SELECT "billingMode" FROM "companies" WHERE "id" IN ($1, $2)`, [j, k])
    expect(rows.every((r) => r.billingMode === "free")).toBe(true)
  })

  /* ------------------------------ Libération ----------------------------- */

  it("release : RESERVED -> RELEASED ; ACTIVE refusée (service et DB) ; DELETE ACTIVE refusé", async () => {
    const l = await createCompany("rel-l")
    const m = await createCompany("rel-m")
    const res = await reserveLifetimeSlot({ companyId: l, paymentPlan: "single" }, deps())
    const released = await releaseLifetimeReservation({ companyId: l, allocationId: res.id }, deps())
    expect(released.status).toBe("RELEASED")
    expect(released.releasedAt).toBeInstanceOf(Date)
    // Idempotent.
    expect((await releaseLifetimeReservation({ companyId: l, allocationId: res.id }, deps())).status).toBe("RELEASED")

    const active = await reserveLifetimeSlot({ companyId: m, paymentPlan: "single" }, deps())
    await activateLifetimeSlot({ companyId: m, allocationId: active.id }, deps())
    expect(await lifetimeCode(releaseLifetimeReservation({ companyId: m, allocationId: active.id }, deps()))).toBe(
      "ACTIVE_NOT_RELEASABLE",
    )
    await expect(
      admin.query(`UPDATE ${T} SET "status" = 'RELEASED', "releasedAt" = now() WHERE "id" = $1`, [active.id]),
    ).rejects.toThrow(/LIFETIME_ACTIVE_IMMUTABLE/)
    await expect(admin.query(`DELETE FROM ${T} WHERE "id" = $1`, [active.id])).rejects.toThrow(/LIFETIME_ACTIVE_IMMUTABLE/)
  })

  it("suppression du tenant : companyId -> NULL, la licence ACTIVE reste comptée", async () => {
    const n = await createCompany("del-n")
    const res = await reserveLifetimeSlot({ companyId: n, paymentPlan: "single" }, deps())
    await activateLifetimeSlot({ companyId: n, allocationId: res.id }, deps())
    await admin.query(`DELETE FROM "companies" WHERE "id" = $1`, [n])
    const { rows } = await admin.query(`SELECT "companyId", "companyNameSnapshot", "status" FROM ${T} WHERE "id" = $1`, [
      res.id,
    ])
    expect(rows[0]).toEqual({ companyId: null, companyNameSnapshot: "Garage del-n", status: "ACTIVE" })
    expect((await getLifetimeAvailability(deps())).active).toBe(1)
  })
})
