import { beforeEach, describe, expect, it, vi } from "vitest"

const calls: { n: number; mode: "ok" | "undef" | "other" } = { n: 0, mode: "ok" }

const baseRows = [
  { id: 1, companyId: 7, dayOfWeek: 6, isOpen: true, openTime: "08:00", closeTime: "18:00" },
]

vi.mock("@/lib/db", () => {
  const chain = (isSecond: boolean) => {
    const q: Record<string, unknown> = {}
    q.from = () => q
    q.where = () => (isSecond ? secondResult() : q)
    q.orderBy = () => Promise.resolve(baseRows)
    return q
  }
  const secondResult = () => {
    if (calls.mode === "undef") return Promise.reject({ message: "wrapped", cause: { code: "42703" } })
    if (calls.mode === "other") return Promise.reject(new Error("connexion perdue"))
    return Promise.resolve([{ dayOfWeek: 6, fixedStartTimes: "08:00,13:00" }])
  }
  return {
    db: {
      select: () => {
        calls.n += 1
        return chain(calls.n % 2 === 0)
      },
    },
  }
})
vi.mock("@/lib/tenant", () => ({ requireCompanyId: async () => 7, getCompanyIdOrNull: async () => 7 }))
vi.mock("@/lib/services/highlight-store", () => ({ attachServiceHighlights: async (x: unknown) => x }))

import { getBusinessHours } from "@/lib/booking/queries"

describe("L75 — lecture tolérante de fixedStartTimes", () => {
  beforeEach(() => {
    calls.n = 0
  })
  it("colonne présente : heures fixes renvoyées", async () => {
    calls.mode = "ok"
    const r = await getBusinessHours(7)
    expect(r[0].fixedStartTimes).toBe("08:00,13:00")
  })
  it("erreur 42703 : horaires renvoyés sans heures fixes", async () => {
    calls.mode = "undef"
    const r = await getBusinessHours(7)
    expect(r).toHaveLength(1)
    expect(r[0].fixedStartTimes).toBeNull()
    expect(r[0].openTime).toBe("08:00")
  })
  it("autre erreur : relancée", async () => {
    calls.mode = "other"
    await expect(getBusinessHours(7)).rejects.toThrow("connexion perdue")
  })
})
