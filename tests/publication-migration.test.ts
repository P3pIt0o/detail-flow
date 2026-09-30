import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeEach, describe, expect, it } from "vitest"

/**
 * Migration de publication exécutée sur un Postgres EN MÉMOIRE (PGlite),
 * état "avant migration" représentatif. Aucun accès à une base distante.
 */

const MIGRATION = readFileSync(join(process.cwd(), "scripts/booking-link-publication-migration.sql"), "utf8")

const PRE_MIGRATION_SCHEMA = `
CREATE TABLE companies (id serial PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'BETA', "customSiteKey" text, "siteContent" jsonb,
  "brandPrimary" text, "updatedAt" timestamp NOT NULL DEFAULT '2026-01-01');
CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL REFERENCES companies(id),
  name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
`

const TENANTS: Array<[slug: string, status: string, customSiteKey: string | null]> = [
  ["spirit-acs", "ACTIVE", "spirit-acs"],
  ["standard", "ACTIVE", null],
  ["cleanyzer", "ACTIVE", "cleanyzer"],
  ["suspended-spirit", "SUSPENDED", "spirit-acs"],
  ["archived-rozan", "ARCHIVED", "rozan"],
  ["rozan", "BETA", " rozan "],
  ["unknown-key", "ACTIVE", "does-not-exist"],
  ["empty-key", "ACTIVE", "  "],
]

let db: PGlite

async function flags() {
  const res = await db.query<{ slug: string; customSitePublished: boolean; bookingLinkEnabled: boolean }>(
    `SELECT slug, "customSitePublished", "bookingLinkEnabled" FROM companies ORDER BY id`,
  )
  return Object.fromEntries(res.rows.map((r) => [r.slug, { site: r.customSitePublished, booking: r.bookingLinkEnabled }]))
}

async function snapshotOtherData() {
  const c = await db.query(
    `SELECT id, name, slug, status, "customSiteKey", "siteContent", "brandPrimary", "updatedAt" FROM companies ORDER BY id`,
  )
  const s = await db.query(`SELECT * FROM services ORDER BY id`)
  return JSON.stringify({ c: c.rows, s: s.rows })
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(PRE_MIGRATION_SCHEMA)
  for (const [slug, status, key] of TENANTS) {
    const r = await db.query<{ id: number }>(
      `INSERT INTO companies (name, slug, status, "customSiteKey", "siteContent", "brandPrimary")
       VALUES ($1, $2, $3, $4, '{"a":1}', '#123') RETURNING id`,
      [slug.toUpperCase(), slug, status, key],
    )
    await db.query(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1, 'Lavage', 4900)`, [r.rows[0].id])
  }
})

describe("publication migration (opt-in + backward compatible)", () => {
  it("Tenant A: a custom site live before migration stays published", async () => {
    await db.exec(MIGRATION)
    const f = await flags()
    expect(f["spirit-acs"]).toEqual({ site: true, booking: false })
    expect(f["rozan"]).toEqual({ site: true, booking: false })
  })

  it("Tenant B: standard tenant (no / unknown / empty key) is not published", async () => {
    await db.exec(MIGRATION)
    const f = await flags()
    expect(f["standard"]).toEqual({ site: false, booking: false })
    expect(f["unknown-key"]).toEqual({ site: false, booking: false })
    expect(f["empty-key"]).toEqual({ site: false, booking: false })
  })

  it("Tenant C: Cleanyzer ends with site OFF and booking OFF", async () => {
    await db.exec(MIGRATION)
    expect((await flags())["cleanyzer"]).toEqual({ site: false, booking: false })
  })

  it("Tenant D: suspended / archived tenants get no automatic publication", async () => {
    await db.exec(MIGRATION)
    const f = await flags()
    expect(f["suspended-spirit"]).toEqual({ site: false, booking: false })
    expect(f["archived-rozan"]).toEqual({ site: false, booking: false })
  })

  it("no booking link is published by the migration", async () => {
    await db.exec(MIGRATION)
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM companies WHERE "bookingLinkEnabled"`)
    expect(res.rows[0].n).toBe(0)
  })

  it("both columns default to false for new tenants", async () => {
    await db.exec(MIGRATION)
    await db.query(`INSERT INTO companies (name, slug, status, "customSiteKey") VALUES ('New', 'new', 'ACTIVE', 'spirit-acs')`)
    expect((await flags())["new"]).toEqual({ site: false, booking: false })
    const defs = await db.query<{ column_name: string; column_default: string; is_nullable: string }>(
      `SELECT column_name, column_default, is_nullable FROM information_schema.columns
       WHERE table_name = 'companies' AND column_name IN ('customSitePublished', 'bookingLinkEnabled')`,
    )
    expect(defs.rows).toHaveLength(2)
    for (const d of defs.rows) {
      expect(d.column_default).toBe("false")
      expect(d.is_nullable).toBe("NO")
    }
  })

  it("does not modify any other column or table", async () => {
    const before = await snapshotOtherData()
    await db.exec(MIGRATION)
    expect(await snapshotOtherData()).toBe(before)
  })

  it("is safe to re-run: never re-publishes a site unpublished from the Super Admin", async () => {
    await db.exec(MIGRATION)
    await db.query(`UPDATE companies SET "customSitePublished" = false WHERE slug = 'spirit-acs'`)
    await db.query(`UPDATE companies SET "bookingLinkEnabled" = true WHERE slug = 'cleanyzer'`)
    const before = await flags()
    const other = await snapshotOtherData()
    await db.exec(MIGRATION)
    expect(await flags()).toEqual(before)
    expect(await snapshotOtherData()).toBe(other)
  })

  it("contains no destructive statement", () => {
    const executable = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    expect(executable).not.toMatch(/\b(DROP|DELETE|TRUNCATE|INSERT)\b/i)
    const updates = executable.match(/\bUPDATE\b/gi) ?? []
    expect(updates).toHaveLength(1)
    expect(executable).toMatch(/UPDATE "companies"\s+SET "customSitePublished" = true/)
  })
})
