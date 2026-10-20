import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

/**
 * L19 — chaque requête du stockage est bornée au tenant (rendu SQL réel par le
 * dialecte Postgres de Drizzle), sans base réelle.
 */
vi.mock("server-only", () => ({}))

const executed: { sql: string; params: unknown[] }[] = []
const dialect = new PgDialect()
const state = { mode: "ready" as "ready" | "absent" | "down" }

vi.mock("@/lib/db", () => ({
  db: {
    execute: async (q: SQL) => {
      const r = dialect.sqlToQuery(q)
      executed.push(r)
      if (state.mode === "down") throw new Error("connection refused")
      if (r.sql.includes("information_schema.tables"))
        return { rows: state.mode === "absent" ? [] : [{ table_name: "promotions" }, { table_name: "cart_rules" }, { table_name: "upsell_suggestions" }] }
      if (r.sql.includes("information_schema.columns"))
        return { rows: state.mode === "absent" ? [] : [{ column_name: "promotionDiscountCents" }, { column_name: "promotionSnapshot" }] }
      if (/^\s*insert/i.test(r.sql)) return { rows: [{ id: 42 }] }
      return { rows: [] }
    },
  },
}))

const fresh = async () => {
  vi.resetModules()
  return import("@/lib/booking/promotions-store")
}
const A = 11
const B = 22
const data = () => executed.filter((q) => !q.sql.includes("information_schema"))
const promo = {
  id: 1, name: "Offre", kind: "multi_services" as const, active: false, priority: 0, stackable: false, stackableWithPromoCode: false,
  startsAt: null, endsAt: null, eligibleServiceIds: null, includeOptions: false,
  tiers: [{ minQuantity: 2, value: { type: "percent" as const, bps: 1000 } }],
}

beforeEach(() => {
  executed.length = 0
  state.mode = "ready"
})

describe("L19 — isolation tenant A / B", () => {
  it("lecture pour la réservation : 3 requêtes, toutes WHERE companyId = A", async () => {
    const s = await fresh()
    await s.loadPromotionData({ id: A, customSiteKey: "cleanyzer" })
    expect(data()).toHaveLength(3)
    for (const q of data()) {
      expect(q.sql).toMatch(/where "companyId" = \$1/i)
      expect(q.params[0]).toBe(A)
      expect(q.params).not.toContain(B)
    }
  })
  it("liste admin bornée au tenant", async () => {
    const s = await fresh()
    await s.listForAdmin(B)
    for (const q of data()) expect(q.params).toEqual([B])
  })
  it("écritures : companyId du tenant dans chaque requête ; mise à jour / suppression : id ET companyId", async () => {
    const s = await fresh()
    await s.insertPromotion(A, promo)
    await s.updatePromotion(A, 5, promo)
    await s.duplicatePromotion(A, 5)
    await s.setActive("promotions", A, 5, true)
    await s.deleteRow("cart_rules", A, 5)
    await s.insertEquivalence(A, { a: { type: "service", id: 158 }, b: { type: "option", id: 98 }, reason: "Même traitement" })
    await s.insertUpsell(A, { whenServiceId: 1, suggest: [{ type: "option", id: 98 }], message: null })
    expect(data()).toHaveLength(7)
    for (const q of data()) {
      expect(q.params).toContain(A)
      expect(q.params).not.toContain(B)
    }
    for (const q of data().filter((x) => /^\s*(update|delete)/i.test(x.sql) || /insert.*select/is.test(x.sql))) {
      expect(q.sql).toMatch(/"id" = \$\d+ and "companyId" = \$\d+/i)
    }
  })
  it("le tenant B ne peut pas modifier une offre de A : la requête porte companyId = B", async () => {
    const s = await fresh()
    expect(await s.updatePromotion(B, 5, promo)).toBe(false)
    expect(data()[0].params).toContain(B)
  })
  it("Spirit ACS et Rozan : aucune requête", async () => {
    const s = await fresh()
    for (const key of ["spirit-acs", "rozan"]) expect(await s.loadPromotionData({ id: A, customSiteKey: key })).toEqual({ ok: true, promotions: [], equivalences: [], upsells: [] })
    expect(executed).toHaveLength(0)
  })
})

describe("L19 — avant migration et panne", () => {
  it("détection limitée au schéma courant", async () => {
    const s = await fresh()
    await s.promotionsSchemaState()
    const schema = executed.filter((q) => q.sql.includes("information_schema"))
    expect(schema).toHaveLength(2)
    for (const q of schema) expect(q.sql).toContain("table_schema = current_schema()")
  })
  it("avant migration : aucune requête sur les nouvelles tables, aucune écriture", async () => {
    const s = await fresh()
    state.mode = "absent"
    expect(await s.loadPromotionData({ id: A, customSiteKey: null })).toEqual({ ok: true, promotions: [], equivalences: [], upsells: [] })
    expect(await s.insertPromotion(A, promo)).toBeNull()
    expect((await s.listForAdmin(A)).ready).toBe(false)
    expect(data()).toHaveLength(0)
  })
  it("base indisponible : lecture stricte refusée, tolérante vide, panne non mise en cache", async () => {
    const s = await fresh()
    state.mode = "down"
    expect(await s.loadPromotionData({ id: A, customSiteKey: null })).toEqual({ ok: false })
    expect(await s.getPromotionData({ id: A, customSiteKey: null })).toEqual({ promotions: [], equivalences: [], upsells: [] })
    state.mode = "ready"
    expect(await s.promotionsSchemaState()).toBe("ready")
  })
})
