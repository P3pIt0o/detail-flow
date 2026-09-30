import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client, Pool } from "pg"
import {
  attachExternalPaymentId,
  consumePlatformFeeReservation,
  getMonthlyPlatformFeeUsage,
  PlatformFeeLedgerError,
  releasePlatformFeeByExternalId,
  releasePlatformFeeReservation,
  releaseRefundedApplicationFee,
  reservePlatformFee,
} from "@/lib/payments/platform-fee-ledger"

/**
 * Intégration RÉELLE PostgreSQL du registre de commissions plafonnées, dans un
 * SCHÉMA TEMPORAIRE ISOLÉ (jamais `public`), supprimé en fin de test.
 * Aucun appel Stripe. Sans base disponible, le test est ignoré.
 */

const connectionString =
  process.env.NEON_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
const MIGRATION_SQL = readFileSync(resolve(process.cwd(), "scripts/platform-fee-ledger-migration.sql"), "utf8")
const TEST_SCHEMA = `df_fee_ledger_${Date.now().toString(36)}`
const FALLBACK = 300
const OCT = new Date("2026-10-10T10:00:00Z")

describe.skipIf(!connectionString)("platform fee ledger (integration réelle)", () => {
  let admin: Client
  let pool: Pool
  const deps = () => ({ pool })
  let bookingSeq = 0

  async function company(extra: Record<string, unknown> = {}): Promise<number> {
    const slug = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const cols = ["name", "slug", ...Object.keys(extra)]
    const values = [slug, slug, ...Object.values(extra)]
    const { rows } = await admin.query(
      `INSERT INTO "companies" (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING "id"`,
      values,
    )
    return rows[0].id
  }
  async function booking(companyId: number): Promise<number> {
    bookingSeq++
    const { rows } = await admin.query(`INSERT INTO "bookings" ("companyId") VALUES ($1) RETURNING "id"`, [companyId])
    return rows[0].id
  }
  async function counter(companyId: number, monthKey: string): Promise<number | null> {
    const { rows } = await admin.query(
      `SELECT "consumedCents" FROM "platform_fee_monthly_counters" WHERE "companyId" = $1 AND "monthKey" = $2`,
      [companyId, monthKey],
    )
    return rows[0] ? Number(rows[0].consumedCents) : null
  }
  async function seedCounter(companyId: number, monthKey: string, cents: number) {
    await admin.query(
      `INSERT INTO "platform_fee_monthly_counters" ("companyId", "monthKey", "consumedCents") VALUES ($1, $2, $3)`,
      [companyId, monthKey, cents],
    )
  }
  const reserve = (companyId: number, bookingId: number, gross: number, now = OCT) =>
    reservePlatformFee({ companyId, bookingId, type: "full", grossAmountCents: gross, fallbackFeeBps: FALLBACK, now }, deps())

  beforeAll(async () => {
    admin = new Client({ connectionString })
    await admin.connect()
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`)
    await admin.query(`SET search_path TO "${TEST_SCHEMA}"`)
    await admin.query(`
      CREATE TABLE "companies" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "licensePlan" text,
        "billingMode" text NOT NULL DEFAULT 'free',
        "platformFeeBps" integer,
        "timezone" text
      )
    `)
    await admin.query(`
      CREATE TABLE "bookings" (
        "id" serial PRIMARY KEY,
        "companyId" integer NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE
      )
    `)
    await admin.query(MIGRATION_SQL)
    pool = new Pool({ connectionString, max: 10, options: `-c search_path="${TEST_SCHEMA}"` })
  })

  afterAll(async () => {
    await pool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
    await admin?.end()
  })

  beforeEach(() => {
    bookingSeq = 0
  })

  it("PRO sous plafond : 1 % réservé et compté", async () => {
    const c = await company({ licensePlan: "PRO", billingMode: "subscription", timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 10_000)
    expect(r).toMatchObject({ feeBps: 100, feeCents: 100, monthlyCapCents: 500, source: "plan", monthKey: "2026-10", created: true })
    expect(await counter(c, "2026-10")).toBe(100)
  })

  it("PRO proche du plafond : 470 + 120 théorique → 30", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await seedCounter(c, "2026-10", 470)
    const r = await reserve(c, await booking(c), 12_000)
    expect(r.feeCents).toBe(30)
    expect(await counter(c, "2026-10")).toBe(500)
  })

  it("plafond atteint → 0, compteur inchangé", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await seedCounter(c, "2026-10", 500)
    const r = await reserve(c, await booking(c), 50_000)
    expect(r.feeCents).toBe(0)
    expect(await counter(c, "2026-10")).toBe(500)
  })

  it("Lifetime (licensePlan BUSINESS) → 0 %, même avec override", async () => {
    const c = await company({ licensePlan: "BUSINESS", billingMode: "lifetime", platformFeeBps: 400, timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 100_000)
    expect(r).toMatchObject({ feeBps: 0, feeCents: 0, source: "lifetime" })
    expect(await counter(c, "2026-10")).toBe(0)
  })

  it("override tenant : taux override, plafond de l'offre conservé", async () => {
    const c = await company({ licensePlan: "PRO", platformFeeBps: 300, timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 50_000)
    expect(r).toMatchObject({ feeBps: 300, source: "override", monthlyCapCents: 500, feeCents: 500 })
  })

  it("mois civil dans le fuseau du tenant (pas UTC)", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    // 31/10 23:30 UTC = 01/11 00:30 à Paris → novembre.
    const r = await reserve(c, await booking(c), 1_000, new Date("2026-10-31T23:30:00Z"))
    expect(r.monthKey).toBe("2026-11")
    // 31/10 22:30 UTC = 23:30 à Paris → encore octobre.
    const r2 = await reserve(c, await booking(c), 1_000, new Date("2026-10-31T22:30:00Z"))
    expect(r2.monthKey).toBe("2026-10")
  })

  it("session du 31 expirée le 1er : libère le mois ORIGINAL ; rejeu = aucune double libération", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 10_000, new Date("2026-10-31T20:00:00Z"))
    await attachExternalPaymentId({ reservationId: r.reservationId, companyId: c, externalPaymentId: `cs_${c}_a` }, deps())
    await seedCounter(c, "2026-11", 200)
    expect(await counter(c, "2026-10")).toBe(100)

    const first = await releasePlatformFeeByExternalId({ externalPaymentId: `cs_${c}_a`, companyId: c, reason: "checkout_expired" }, deps())
    expect(first).toEqual({ released: true, releasedCents: 100, monthKey: "2026-10" })
    expect(await counter(c, "2026-10")).toBe(0)
    expect(await counter(c, "2026-11")).toBe(200)

    const replay = await releasePlatformFeeByExternalId({ externalPaymentId: `cs_${c}_a`, companyId: c, reason: "checkout_expired" }, deps())
    expect(replay.released).toBe(false)
    expect(await counter(c, "2026-10")).toBe(0)
  })

  it("échec Stripe create → réservation libérée une seule fois", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 10_000)
    expect(await counter(c, "2026-10")).toBe(100)
    const a = await releasePlatformFeeReservation({ reservationId: r.reservationId, companyId: c, reason: "stripe_create_failed" }, deps())
    const b = await releasePlatformFeeReservation({ reservationId: r.reservationId, companyId: c, reason: "stripe_create_failed" }, deps())
    expect(a.released).toBe(true)
    expect(b.released).toBe(false)
    expect(await counter(c, "2026-10")).toBe(0)
    // Réservation libérée : la session ne peut plus y être rattachée.
    await expect(
      attachExternalPaymentId({ reservationId: r.reservationId, companyId: c, externalPaymentId: `cs_${c}_late` }, deps()),
    ).rejects.toBeInstanceOf(PlatformFeeLedgerError)
  })

  it("double clic (même tentative logique) → une seule réservation", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const b = await booking(c)
    const [x, y] = await Promise.all([reserve(c, b, 10_000), reserve(c, b, 10_000)])
    expect(x.reservationId).toBe(y.reservationId)
    expect([x.created, y.created].sort()).toEqual([false, true])
    expect(await counter(c, "2026-10")).toBe(100)
  })

  it("paiement réussi → consommé, aucun second incrément, rejeu idempotent", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 10_000)
    await attachExternalPaymentId({ reservationId: r.reservationId, companyId: c, externalPaymentId: `cs_${c}_p` }, deps())
    expect(await consumePlatformFeeReservation({ externalPaymentId: `cs_${c}_p`, companyId: c }, deps())).toBe("consumed")
    expect(await consumePlatformFeeReservation({ externalPaymentId: `cs_${c}_p`, companyId: c }, deps())).toBe("already_consumed")
    expect(await counter(c, "2026-10")).toBe(100)
    // Une expiration tardive ne libère pas une commission encaissée.
    const late = await releasePlatformFeeByExternalId({ externalPaymentId: `cs_${c}_p`, companyId: c, reason: "checkout_expired" }, deps())
    expect(late.released).toBe(false)
    expect(await counter(c, "2026-10")).toBe(100)
  })

  it("deux paiements concurrents (470/500) : 30 + 0, plafond jamais dépassé", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await seedCounter(c, "2026-10", 470)
    const [b1, b2] = [await booking(c), await booking(c)]
    const res = await Promise.all([reserve(c, b1, 3_000), reserve(c, b2, 3_000)])
    expect(res.map((r) => r.feeCents).sort((a, b) => a - b)).toEqual([0, 30])
    expect(await counter(c, "2026-10")).toBe(500)
  })

  it("rafale de 20 paiements concurrents : total exactement égal au plafond", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const bookings = await Promise.all(Array.from({ length: 20 }, () => booking(c)))
    const res = await Promise.all(bookings.map((b) => reserve(c, b, 4_000)))
    const total = res.reduce((s, r) => s + r.feeCents, 0)
    expect(total).toBe(500)
    expect(await counter(c, "2026-10")).toBe(500)
  })

  it("remboursement : libère la part réellement restituée, jamais deux fois, jamais au-delà", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const r = await reserve(c, await booking(c), 10_000)
    const ext = `cs_${c}_r`
    await attachExternalPaymentId({ reservationId: r.reservationId, companyId: c, externalPaymentId: ext }, deps())
    await consumePlatformFeeReservation({ externalPaymentId: ext, companyId: c }, deps())

    const rel = (total: number) =>
      releaseRefundedApplicationFee({ externalPaymentId: ext, companyId: c, applicationFeeRefundedTotalCents: total }, deps())
    expect(await rel(40)).toEqual({ releasedCents: 40 })
    expect(await rel(40)).toEqual({ releasedCents: 0 })
    expect(await rel(9_999)).toEqual({ releasedCents: 60 })
    expect(await counter(c, "2026-10")).toBe(0)
    await expect(rel(-1)).rejects.toBeInstanceOf(PlatformFeeLedgerError)
  })

  it("consumedCents jamais négatif (contrainte DB + GREATEST)", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await expect(seedCounter(c, "2026-10", -1)).rejects.toThrow()
    const r = await reserve(c, await booking(c), 10_000)
    await admin.query(`UPDATE "platform_fee_monthly_counters" SET "consumedCents" = 10 WHERE "companyId" = $1`, [c])
    await releasePlatformFeeReservation({ reservationId: r.reservationId, companyId: c, reason: "stripe_create_failed" }, deps())
    expect(await counter(c, "2026-10")).toBe(0)
  })

  it("isolation stricte entre companyId", async () => {
    const a = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    const b = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await seedCounter(a, "2026-10", 500)
    const r = await reserve(b, await booking(b), 10_000)
    expect(r.feeCents).toBe(100)
    // Un autre tenant ne peut ni libérer ni consommer la réservation de b.
    const cross = await releasePlatformFeeReservation({ reservationId: r.reservationId, companyId: a, reason: "x" }, deps())
    expect(cross.released).toBe(false)
    expect(await counter(a, "2026-10")).toBe(500)
    expect(await counter(b, "2026-10")).toBe(100)
  })

  it("isolation entre monthKey", async () => {
    const c = await company({ licensePlan: "PRO", timezone: "Europe/Paris" })
    await seedCounter(c, "2026-09", 500)
    const r = await reserve(c, await booking(c), 10_000)
    expect(r.feeCents).toBe(100)
    expect(await counter(c, "2026-09")).toBe(500)
    expect(await getMonthlyPlatformFeeUsage({ companyId: c, timezone: "Europe/Paris", now: OCT }, deps())).toEqual({
      monthKey: "2026-10",
      consumedCents: 100,
    })
  })

  it("fail closed : tenant inconnu / montant invalide", async () => {
    await expect(reserve(999_999, 1, 1_000)).rejects.toMatchObject({ code: "COMPANY_NOT_FOUND" })
    await expect(reserve(1, 1, 0)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(reserve(1, 1, 10.5)).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })
})
