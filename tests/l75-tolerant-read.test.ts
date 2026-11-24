import { describe, expect, it, vi } from "vitest"
import { getTableColumns } from "drizzle-orm"

const state = vi.hoisted(() => ({ mode: "ok" as "ok" | "undef" | "other" }))

const baseRows = [
  { id: 1, companyId: 7, dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00" },
]

vi.mock("@/lib/db", () => {
  // Le résultat dépend de la table interrogée (et non de l'ordre des appels).
  const isFixedTable = (t: Record<string, unknown>) => "fixedStartTimes" in t
  const fixedResult = () => {
    if (state.mode === "undef") return Promise.reject({ message: "wrapped", cause: { code: "42703" } })
    if (state.mode === "other") return Promise.reject(new Error("connexion perdue"))
    return Promise.resolve([{ dayOfWeek: 6, fixedStartTimes: "08:00,13:00" }])
  }
  return {
    db: {
      select: () => {
        const q: Record<string, unknown> = {}
        let fixed = false
        q.from = (t: Record<string, unknown>) => {
          fixed = isFixedTable(t)
          return q
        }
        q.where = () => (fixed ? fixedResult() : q)
        q.orderBy = () => Promise.resolve(baseRows)
        return q
      },
    },
  }
})
vi.mock("@/lib/tenant", () => ({ requireCompanyId: async () => 7, getCompanyIdOrNull: async () => 7 }))
vi.mock("@/lib/services/highlight-store", () => ({ attachServiceHighlights: async (x: unknown) => x }))

import { getBusinessHours } from "@/lib/booking/queries"
import { businessHoursFixedStarts } from "@/lib/booking/slot-times"
import * as schema from "@/lib/db/schema"
const { businessHours } = schema

describe("L75 — lecture tolérante de fixedStartTimes", () => {
  it("colonne présente : heures fixes renvoyées", async () => {
    state.mode = "ok"
    const r = await getBusinessHours(7)
    expect(r[0].fixedStartTimes).toBe("08:00,13:00")
  })
  it("erreur 42703 : horaires renvoyés sans heures fixes", async () => {
    state.mode = "undef"
    const r = await getBusinessHours(7)
    expect(r).toHaveLength(1)
    expect(r[0].fixedStartTimes).toBeNull()
    expect(r[0].openTime).toBe("08:00")
  })
  it("autre erreur : relancée", async () => {
    state.mode = "other"
    await expect(getBusinessHours(7)).rejects.toThrow("connexion perdue")
  })
})

describe("L75 — la table historique ne référence pas la nouvelle colonne", () => {
  it("businessHours (création d'entreprise, export, select complets) n'a pas fixedStartTimes", () => {
    expect(Object.keys(getTableColumns(businessHours))).not.toContain("fixedStartTimes")
  })
  it("businessHoursFixedStarts cible la même table et porte la colonne", () => {
    const cols = getTableColumns(businessHoursFixedStarts)
    expect(Object.keys(cols).sort()).toEqual(["companyId", "dayOfWeek", "fixedStartTimes", "id"])
    expect(cols.fixedStartTimes.name).toBe("fixedStartTimes")
  })
  it("la vue séparée n'est pas exportée par le schéma (aucun doublon de table)", () => {
    expect(Object.values(schema)).not.toContain(businessHoursFixedStarts)
  })
})
