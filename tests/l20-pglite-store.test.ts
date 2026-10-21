import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import { multiServices } from "./helpers/promotions-fixtures"

/**
 * L20 — le stockage des promotions exécuté sur une VRAIE base PostgreSQL en
 * mémoire (PGlite), migration L19 appliquée : le tenant B ne lit, ne modifie,
 * n'active, ne duplique ni ne supprime jamais les données du tenant A.
 * Aucune connexion réseau, jamais Neon.
 */
vi.mock("server-only", () => ({}))
const { holder } = vi.hoisted(() => ({ holder: { pg: null as null | { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> } } }))
vi.mock("@/lib/db", () => {
  const dialect = new PgDialect()
  return {
    db: {
      execute: async (q: SQL) => {
        const r = dialect.sqlToQuery(q)
        return holder.pg!.query(r.sql, r.params as unknown[])
      },
    },
  }
})

import * as store from "@/lib/booking/promotions-store"

const A = 1
const B = 2
let pg: PGlite

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, name text);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" int REFERENCES companies(id) ON DELETE CASCADE);
    CREATE TABLE bookings (id serial PRIMARY KEY, "companyId" int, "totalCents" int);
    INSERT INTO companies(name) VALUES ('A'), ('B');
    INSERT INTO services("companyId") VALUES (1), (2);
    INSERT INTO bookings("companyId", "totalCents") VALUES (1, 1000);
  `)
  await pg.exec(readFileSync(join(process.cwd(), "scripts/l19-promotions-migration.sql"), "utf8"))
  holder.pg = pg as never
})

const count = async (table: string, where = "true") => Number(((await pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, [])).rows[0] as { n: number }).n)

describe("L20 — stockage sur base réelle (PGlite)", () => {
  it("création : équivalence et complément naissent désactivés (offre : état fourni par l'action) ; relus pour le seul tenant", async () => {
    const p = await store.insertPromotion(A, multiServices({ eligibleServiceIds: [1], active: false })) // état fixé par l'action (création désactivée)
    const e = await store.insertEquivalence(A, { a: { type: "service", id: 1 }, b: { type: "option", id: 98 }, reason: "Même traitement" })
    const u = await store.insertUpsell(A, { whenServiceId: 1, suggest: [{ type: "option", id: 98 }], message: null })
    expect(p && e && u).toBeTruthy()
    expect(await count(`promotions`, `active`)).toBe(0)
    expect(await count(`cart_rules`, `active`)).toBe(0)
    expect(await count(`upsell_suggestions`, `active`)).toBe(0)
    expect((await store.listForAdmin(A)).promotions).toHaveLength(1)
    expect((await store.listForAdmin(B)).promotions).toHaveLength(0)
  })

  it("activation, modification, duplication, suppression par le tenant B : sans effet sur A", async () => {
    const id = (await store.listForAdmin(A)).promotions[0].id
    expect(await store.setActive("promotions", B, id, true)).toBe(false)
    expect(await store.updatePromotion(B, id, multiServices({ id, name: "Piratée" }))).toBe(false)
    expect(await store.duplicatePromotion(B, id)).toBeNull()
    expect(await store.deleteRow("promotions", B, id)).toBe(false)
    const [cr] = (await pg.query(`SELECT id FROM cart_rules`, [])).rows as { id: number }[]
    expect(await store.setActive("cart_rules", B, cr.id, true)).toBe(false)
    expect(await store.deleteRow("cart_rules", B, cr.id)).toBe(false)
    expect(await count(`promotions`, `"companyId" = 1 AND name = 'Plusieurs prestations' AND NOT active`)).toBe(1)
    expect(await count(`promotions`)).toBe(1)
    expect(await count(`cart_rules`, `NOT active`)).toBe(1)
    expect((await store.loadPromotionData({ id: A, customSiteKey: null })).ok).toBe(true)
  })

  it("le tenant A active son offre ; la modification ne la désactive pas ; B n'en voit rien", async () => {
    const id = (await store.listForAdmin(A)).promotions[0].id
    expect(await store.setActive("promotions", A, id, true)).toBe(true)
    expect(await store.updatePromotion(A, id, multiServices({ id, name: "Renommée", active: false }))).toBe(true)
    const a = await store.loadPromotionData({ id: A, customSiteKey: null })
    const b = await store.loadPromotionData({ id: B, customSiteKey: null })
    expect(a.ok && a.promotions.map((p) => p.name)).toEqual(["Renommée"])
    expect(b.ok && b.promotions).toEqual([])
  })

  it("duplication par A : copie DÉSACTIVÉE ; suppression par A effective", async () => {
    const id = (await store.listForAdmin(A)).promotions[0].id
    const copy = await store.duplicatePromotion(A, id)
    expect(copy).toBeTruthy()
    expect(await count(`promotions`, `id = ${copy} AND NOT active AND name LIKE '% (copie)'`)).toBe(1)
    expect(await store.deleteRow("promotions", A, copy as number)).toBe(true)
    expect(await count(`promotions`)).toBe(1)
  })

  it("instantané de réservation : écrit pour la réservation du tenant, jamais pour celle d'un autre", async () => {
    const tx = { execute: (q: SQL) => holder.pg!.query(new PgDialect().sqlToQuery(q).sql, new PgDialect().sqlToQuery(q).params as unknown[]) }
    await store.setBookingPromotionSnapshot(tx as never, B, 1, 500, { v: 1 })
    expect(await count(`bookings`, `"promotionDiscountCents" IS NULL`)).toBe(1)
    await store.setBookingPromotionSnapshot(tx as never, A, 1, 500, { v: 1 })
    expect(await count(`bookings`, `"promotionDiscountCents" = 500`)).toBe(1)
  })
})
