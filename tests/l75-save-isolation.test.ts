import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L75 — saveBusinessHours : test COMPORTEMENTAL (sans BDD) sur une table
 * `business_hours` en mémoire. Les clauses where de Drizzle sont réellement
 * évaluées (eq/and mockés en prédicats) : on vérifie que le tenant B ne peut
 * jamais modifier la ligne du tenant A, même si le client envoie un
 * companyId / id de ligne du tenant A, et que l'écriture reste possible
 * avant la migration (colonne fixedStartTimes absente => 42703).
 */

const TENANT_A = 101
const TENANT_B = 202

type Row = {
  id: number
  companyId: number
  dayOfWeek: number
  isOpen: boolean
  openTime: string
  closeTime: string
  fixedStartTimes: string | null
}
type Where = { op: "eq"; col: string; val: unknown } | { op: "and"; parts: Where[] }

const state = vi.hoisted(() => ({
  tenantId: 0,
  rows: [] as Row[],
  columnMissing: false,
  updateWheres: [] as { fixedTable: boolean; where: unknown }[],
}))

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>()
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }),
    and: (...parts: unknown[]) => ({ op: "and", parts }),
  }
})

function matches(row: Record<string, unknown>, w: Where): boolean {
  if (w.op === "and") return w.parts.every((p) => matches(row, p))
  return row[w.col] === w.val
}

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: vi.fn(async () => ({
    user: { id: "u", email: "x@x.fr", name: "X" },
    tenant: { id: state.tenantId },
    role: "OWNER",
    isSuperAdmin: false,
  })),
}))

vi.mock("@/lib/db", () => {
  const isFixedTable = (t: Record<string, unknown>) => "fixedStartTimes" in t
  return {
    db: {
      select: () => {
        let where: Where | null = null
        const q: Record<string, unknown> = {}
        q.from = () => q
        q.where = (w: Where) => {
          where = w
          return q
        }
        q.limit = () => q
        q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(state.rows.filter((r) => (where ? matches(r, where) : true))).then(res, rej)
        return q
      },
      insert: () => ({
        values: async (v: Omit<Row, "id" | "fixedStartTimes">) => {
          state.rows.push({ id: state.rows.length + 1, fixedStartTimes: null, ...v })
        },
      }),
      update: (table: Record<string, unknown>) => ({
        set: (set: Partial<Row>) => ({
          where: async (w: Where) => {
            const fixedTable = isFixedTable(table)
            state.updateWheres.push({ fixedTable, where: w })
            if (fixedTable && state.columnMissing) {
              throw { message: "wrapped", cause: { code: "42703" } }
            }
            if (!fixedTable && "fixedStartTimes" in set) throw new Error("colonne L75 dans la table historique")
            for (const r of state.rows) if (matches(r, w)) Object.assign(r, set)
          },
        }),
      }),
    },
  }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/booking/travel", () => ({ geocodeAddress: vi.fn(async () => null) }))

import { saveBusinessHours } from "@/app/admin/(dashboard)/parametres/actions"

function rowA(): Row {
  return { id: 1, companyId: TENANT_A, dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00", fixedStartTimes: "08:00,13:00" }
}
function rowB(): Row {
  return { id: 2, companyId: TENANT_B, dayOfWeek: 6, isOpen: true, openTime: "09:00", closeTime: "17:00", fixedStartTimes: null }
}

beforeEach(() => {
  state.rows = [rowA(), rowB()]
  state.columnMissing = false
  state.updateWheres = []
})

describe("L75 — saveBusinessHours : isolation tenant (comportemental)", () => {
  it("le tenant B ne modifie pas la ligne du tenant A, même avec companyId/id de A dans la saisie", async () => {
    state.tenantId = TENANT_B
    const forged = {
      dayOfWeek: 6,
      isOpen: false,
      openTime: "00:00",
      closeTime: "01:00",
      fixedStartTimes: ["10:00"],
      companyId: TENANT_A,
      id: 1,
    }
    const res = await saveBusinessHours([forged])
    expect(res.ok).toBe(true)
    expect(state.rows.find((r) => r.id === 1)).toEqual(rowA())
    const b = state.rows.find((r) => r.id === 2)!
    expect(b).toMatchObject({ companyId: TENANT_B, isOpen: false, openTime: "00:00", fixedStartTimes: "10:00" })
    expect(state.rows).toHaveLength(2)
  })

  it("chaque mise à jour filtre par le companyId de la session", async () => {
    state.tenantId = TENANT_B
    await saveBusinessHours([{ dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00", fixedStartTimes: [] }])
    expect(state.updateWheres.length).toBeGreaterThanOrEqual(2)
    for (const u of state.updateWheres) {
      expect(JSON.stringify(u.where)).toContain(`{"op":"eq","col":"companyId","val":${TENANT_B}}`)
    }
  })

  it("jour hors 0–6 : rejeté, aucune écriture", async () => {
    state.tenantId = TENANT_B
    const res = await saveBusinessHours([{ dayOfWeek: 7, isOpen: true, openTime: "08:00", closeTime: "18:00" }])
    expect(res.ok).toBe(false)
    expect(state.updateWheres).toHaveLength(0)
    expect(state.rows).toEqual([rowA(), rowB()])
  })

  it("nouveau jour pour B : inséré avec le companyId de la session", async () => {
    state.tenantId = TENANT_B
    await saveBusinessHours([{ dayOfWeek: 0, isOpen: true, openTime: "08:00", closeTime: "12:00", fixedStartTimes: ["08:00"] }])
    const inserted = state.rows.find((r) => r.companyId === TENANT_B && r.dayOfWeek === 0)!
    expect(inserted).toMatchObject({ openTime: "08:00", fixedStartTimes: "08:00" })
    expect(state.rows.find((r) => r.id === 1)).toEqual(rowA())
  })
})

describe("L75 — saveBusinessHours avant migration (colonne absente)", () => {
  it("sans heures fixes : horaires enregistrés, succès", async () => {
    state.tenantId = TENANT_B
    state.columnMissing = true
    const res = await saveBusinessHours([{ dayOfWeek: 6, isOpen: true, openTime: "07:00", closeTime: "19:00", fixedStartTimes: [] }])
    expect(res.ok).toBe(true)
    expect(state.rows.find((r) => r.id === 2)).toMatchObject({ openTime: "07:00", closeTime: "19:00" })
  })

  it("avec heures fixes : horaires enregistrés, message clair sur les heures fixes", async () => {
    state.tenantId = TENANT_B
    state.columnMissing = true
    const res = await saveBusinessHours([{ dayOfWeek: 6, isOpen: true, openTime: "07:00", closeTime: "19:00", fixedStartTimes: ["08:00"] }])
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/heures de début fixes/)
    expect(state.rows.find((r) => r.id === 2)).toMatchObject({ openTime: "07:00", fixedStartTimes: null })
  })
})
