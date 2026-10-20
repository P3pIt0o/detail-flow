import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"

/**
 * L19 — migration : additive, idempotente, contraintes actives, isolation par
 * entreprise. Exécutée sur une base PostgreSQL EN MÉMOIRE (PGlite) : aucune
 * connexion réseau, jamais Neon.
 */
const SQL = readFileSync(join(process.cwd(), "scripts/l19-promotions-migration.sql"), "utf8")
const code = SQL.replace(/--.*$/gm, "")

describe("L19 — migration (fichier)", () => {
  it("en-tête commenté, aucune opération destructive ni modification de données", () => {
    expect(SQL.startsWith("--")).toBe(true)
    expect(code).not.toMatch(/\b(DROP|TRUNCATE|RENAME|DELETE\s+FROM|UPDATE\s+\S+\s+SET|GRANT|REVOKE)\b/i)
    expect(code).not.toMatch(/ALTER\s+COLUMN/i)
  })
  it("idempotente : chaque CREATE / ADD COLUMN est protégé", () => {
    expect(code).not.toMatch(/CREATE\s+(TABLE|INDEX)\s+(?!IF NOT EXISTS)/i)
    expect(code).not.toMatch(/ADD\s+COLUMN\s+(?!IF NOT EXISTS)/i)
  })
  it("colonnes ajoutées à bookings : nullables, sans valeur par défaut", () => {
    for (const m of code.matchAll(/ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "[^"]+" ([^;]+);/g)) {
      expect(m[1]).not.toMatch(/NOT NULL|DEFAULT/i)
    }
  })
})

async function freshDb() {
  const db = new PGlite()
  await db.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, name text);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" int REFERENCES companies(id) ON DELETE CASCADE);
    CREATE TABLE bookings (id serial PRIMARY KEY, "companyId" int, "totalCents" int);
    INSERT INTO companies(name) VALUES ('A'), ('B');
    INSERT INTO services("companyId") VALUES (1), (2);
    INSERT INTO bookings("companyId", "totalCents") VALUES (1, 1000);
  `)
  return db
}

const rejects = async (db: PGlite, q: string) => {
  let failed = false
  try {
    await db.exec(q)
  } catch {
    failed = true
  }
  return failed
}

describe("L19 — migration (PostgreSQL en mémoire)", () => {
  it("appliquée deux fois sans erreur ; réservations existantes intactes", async () => {
    const db = await freshDb()
    await db.exec(SQL)
    await db.exec(SQL)
    const b = await db.query<{ totalCents: number; promotionDiscountCents: number | null }>(`SELECT "totalCents", "promotionDiscountCents" FROM bookings`)
    expect(b.rows).toEqual([{ totalCents: 1000, promotionDiscountCents: null }])
  })

  it("offre créée désactivée par défaut ; isolation par entreprise ; duplication bornée", async () => {
    const db = await freshDb()
    await db.exec(SQL)
    await db.exec(`INSERT INTO promotions("companyId", name, kind) VALUES (1, 'A', 'multi_services'), (2, 'B', 'multi_options')`)
    const a = await db.query<{ name: string; active: boolean }>(`SELECT name, active FROM promotions WHERE "companyId" = $1`, [1])
    expect(a.rows).toEqual([{ name: "A", active: false }])
    const upd = await db.query(`UPDATE promotions SET active = true WHERE id = $1 AND "companyId" = $2 RETURNING id`, [2, 1])
    expect(upd.rows).toHaveLength(0)
    const dup = await db.query(
      `INSERT INTO promotions ("companyId","name","kind","active","scope","tiers")
       SELECT "companyId", "name" || ' (copie)', "kind", false, "scope", "tiers" FROM promotions WHERE id = $1 AND "companyId" = $2 RETURNING id`,
      [2, 1],
    )
    expect(dup.rows).toHaveLength(0)
  })

  it("contraintes actives", async () => {
    const db = await freshDb()
    await db.exec(SQL)
    expect(await rejects(db, `INSERT INTO promotions("companyId", name, kind) VALUES (1, 'X', 'autre')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO promotions("companyId", name, kind) VALUES (1, '  ', 'multi_services')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO promotions("companyId", name, kind, tiers) VALUES (1, 'X', 'multi_services', '{}')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO promotions("companyId", name, kind, "startsAt", "endsAt") VALUES (1, 'X', 'multi_services', '2026-11-02', '2026-11-01')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO cart_rules("companyId", "itemA", "itemB", reason) VALUES (1, '{}', '{}', '  ')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO cart_rules("companyId", kind, "itemA", "itemB", reason) VALUES (1, 'incompatibility', '{}', '{}', 'x')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO upsell_suggestions("companyId", "whenServiceId", suggest) VALUES (1, 999, '[]')`)).toBe(true)
    expect(await rejects(db, `INSERT INTO promotions("companyId", name, kind) VALUES (99, 'X', 'multi_services')`)).toBe(true)
  })

  it("suppression d'une entreprise : ses offres, règles et compléments disparaissent, pas ceux des autres", async () => {
    const db = await freshDb()
    await db.exec(SQL)
    await db.exec(`
      INSERT INTO promotions("companyId", name, kind) VALUES (1, 'A', 'multi_services'), (2, 'B', 'multi_services');
      INSERT INTO cart_rules("companyId", "itemA", "itemB", reason) VALUES (2, '{"type":"service","id":1}', '{"type":"option","id":2}', 'r');
      INSERT INTO upsell_suggestions("companyId", "whenServiceId", suggest) VALUES (2, 2, '[{"type":"option","id":1}]');
      DELETE FROM companies WHERE id = 2;
    `)
    const n = await db.query<{ p: number; c: number; u: number }>(
      `SELECT (SELECT count(*)::int FROM promotions) AS p, (SELECT count(*)::int FROM cart_rules) AS c, (SELECT count(*)::int FROM upsell_suggestions) AS u`,
    )
    expect(n.rows[0]).toEqual({ p: 1, c: 0, u: 0 })
  })
})
