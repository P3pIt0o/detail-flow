import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import { validatePromotion } from "@/lib/booking/promotions"
import { multiServices } from "./helpers/promotions-fixtures"

/**
 * L20 — correctifs de la revue L19 sur le stockage (A1, A2, A3, A6, A7 et
 * remarques des revues). SQL réel rendu par le dialecte Postgres de Drizzle,
 * base simulée.
 */
vi.mock("server-only", () => ({}))

const executed: { sql: string; params: unknown[] }[] = []
const dialect = new PgDialect()
const state = { mode: "ready" as "ready" | "absent" | "down" | "tables_dropped" }

vi.mock("@/lib/db", () => ({
  db: {
    execute: async (q: SQL) => {
      const r = dialect.sqlToQuery(q)
      executed.push(r)
      const meta = r.sql.includes("information_schema")
      if (state.mode === "down") throw new Error("connection refused")
      if (state.mode === "tables_dropped" && !meta) throw new Error('relation "promotions" does not exist')
      if (r.sql.includes("information_schema.tables"))
        return { rows: state.mode === "ready" ? [{ table_name: "promotions" }, { table_name: "cart_rules" }, { table_name: "upsell_suggestions" }] : [] }
      if (r.sql.includes("information_schema.columns"))
        return { rows: state.mode === "ready" ? [{ column_name: "promotionDiscountCents" }, { column_name: "promotionSnapshot" }] : [] }
      if (/^\s*insert/i.test(r.sql)) return { rows: [{ id: 42 }] }
      return { rows: [] }
    },
  },
}))

const fresh = async () => {
  vi.resetModules()
  return import("@/lib/booking/promotions-store")
}
const data = () => executed.filter((q) => !q.sql.includes("information_schema"))
const row = (scope: unknown, kind = "multi_services") => ({
  id: 7, name: "Offre", kind, active: true, startsAt: null, endsAt: null, priority: 0, stackable: false, stackableWithPromoCode: false,
  scope, tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }],
})

beforeEach(() => {
  executed.length = 0
  state.mode = "ready"
})

describe("A1 / A2 — un périmètre malformé n'est jamais lu comme « tout le catalogue »", () => {
  it("clé absente, texte, objet, liste vide : ligne rejetée (prestations et options)", async () => {
    const { rowToPromotion } = await fresh()
    for (const scope of [{}, { eligibleServiceIds: "158" }, { eligibleServiceIds: { a: 1 } }, { eligibleServiceIds: [] }]) {
      expect(rowToPromotion(row(scope))).toBeNull()
    }
    for (const scope of [{}, { eligibleOptionIds: "98" }, { eligibleOptionIds: [] }]) {
      expect(rowToPromotion(row(scope, "multi_options"))).toBeNull()
    }
  })
  it("liste partiellement invalide : rejetée, jamais réduite en silence", async () => {
    const { rowToPromotion } = await fresh()
    expect(rowToPromotion(row({ eligibleServiceIds: [158, "x", -3] }))).toBeNull()
    expect(rowToPromotion(row({ eligibleServiceIds: [158, 1.5] }))).toBeNull()
  })
  it("seul un null explicite vaut « toutes » ; une liste valide est conservée", async () => {
    const { rowToPromotion } = await fresh()
    expect(rowToPromotion(row({ eligibleServiceIds: null }))).toMatchObject({ eligibleServiceIds: null })
    expect(rowToPromotion(row({ eligibleServiceIds: [158, "143"] }))).toMatchObject({ eligibleServiceIds: [158, 143] })
  })
})

describe("A3 — une erreur de requête réinitialise l'état du schéma", () => {
  it("tables supprimées après détection : refus une fois, puis comportement « avant migration »", async () => {
    const s = await fresh()
    expect(await s.promotionsSchemaState()).toBe("ready")
    state.mode = "tables_dropped"
    expect(await s.loadPromotionData({ id: 11, customSiteKey: null })).toEqual({ ok: false })
    // Sans réinitialisation, l'état « ready » resterait en cache et chaque réservation serait refusée.
    expect(await s.loadPromotionData({ id: 11, customSiteKey: null })).toEqual({ ok: true, promotions: [], equivalences: [], upsells: [] })
  })
  it("liste admin : panne → liste vide « non prête », jamais d'exception", async () => {
    const s = await fresh()
    await s.promotionsSchemaState()
    state.mode = "tables_dropped"
    await expect(s.listForAdmin(11)).resolves.toEqual({ ready: false, promotions: [], equivalences: [], upsells: [] })
  })
})

describe("Écritures : défauts sûrs et objets reconstruits", () => {
  it("équivalence et complément créés DÉSACTIVÉS, sans clé superflue", async () => {
    const s = await fresh()
    const junk = { type: "service" as const, id: 158, extra: "x".repeat(50) }
    await s.insertEquivalence(11, { a: junk, b: { type: "option", id: 98 }, reason: " Même traitement " })
    await s.insertUpsell(11, { whenServiceId: 143, suggest: [{ type: "option", id: 98, extra: 1 } as never], message: null })
    const [eq, up] = data()
    for (const q of [eq, up]) expect(q.sql).toMatch(/"active"\)\s*VALUES[\s\S]*, false\)/i)
    expect(eq.params).toContain(JSON.stringify({ type: "service", id: 158 }))
    expect(up.params).toContain(JSON.stringify([{ type: "option", id: 98 }]))
  })
  it("modification d'une offre : la colonne « active » n'est jamais réécrite", async () => {
    const s = await fresh()
    await s.updatePromotion(11, 5, multiServices({ id: 5, active: true }))
    expect(data()[0].sql).not.toMatch(/"active"/)
    expect(data()[0].sql).toMatch(/"id" = \$\d+ and "companyId" = \$\d+/i)
  })
})

describe("A6 — instantané de réservation", () => {
  const tx = { execute: vi.fn(async (_q: SQL) => ({ rows: [] })) }
  it("avant migration : rien n'est écrit, la réservation n'échoue pas", async () => {
    const s = await fresh()
    state.mode = "absent"
    await expect(s.setBookingPromotionSnapshot(tx as never, 11, 9, 1400, { v: 1 })).resolves.toBeUndefined()
    expect(tx.execute).not.toHaveBeenCalled()
  })
  it("après migration : écrit, borné à la réservation ET au tenant", async () => {
    const s = await fresh()
    tx.execute.mockClear()
    await s.setBookingPromotionSnapshot(tx as never, 11, 9, 1400, { v: 1 })
    const q = dialect.sqlToQuery(tx.execute.mock.calls[0][0])
    expect(q.sql).toMatch(/where "id" = \$\d+ and "companyId" = \$\d+/i)
    expect(q.params).toEqual([1400, JSON.stringify({ v: 1 }), 9, 11])
  })
  it("montant invalide refusé", async () => {
    const s = await fresh()
    await expect(s.setBookingPromotionSnapshot(tx as never, 11, 9, -1, {})).rejects.toThrow()
  })
})

describe("Limites de saisie (moteur)", () => {
  it("nom ≤ 120 caractères, ≤ 10 paliers, entiers sûrs uniquement", () => {
    expect(validatePromotion(multiServices({ name: "x".repeat(120) })).ok).toBe(true)
    expect(validatePromotion(multiServices({ name: "x".repeat(121) })).ok).toBe(false)
    const tiers = Array.from({ length: 11 }, (_, k) => ({ minQuantity: k + 1, value: { type: "percent" as const, bps: 100 * (k + 1) } }))
    expect(validatePromotion(multiServices({ tiers: tiers.slice(0, 10) })).ok).toBe(true)
    expect(validatePromotion(multiServices({ tiers })).ok).toBe(false)
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 2, value: { type: "fixed_total", cents: 1e300 } }] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ eligibleServiceIds: [2 ** 60] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ priority: 2 ** 40 })).ok).toBe(false)
  })
})
