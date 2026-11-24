import { describe, expect, it } from "vitest"
import { isValidDayOfWeek, normalizeFixedStarts } from "@/lib/booking/slot-times"

describe("L75 — validation serveur", () => {
  it("vide / absent => option désactivée (null)", () => {
    expect(normalizeFixedStarts([])).toEqual({ ok: true, value: null })
    expect(normalizeFixedStarts(undefined)).toEqual({ ok: true, value: null })
  })
  it("trie et dédoublonne", () => {
    expect(normalizeFixedStarts(["13:00", "08:00", "08:00"])).toEqual({ ok: true, value: "08:00,13:00" })
  })
  it("heure mal formée rejetée", () => {
    for (const bad of ["8:00", "24:00", "12:60", "abc", "", "08:00,13:00"]) {
      expect(normalizeFixedStarts([bad]).ok).toBe(false)
    }
    expect(normalizeFixedStarts([42 as unknown as string]).ok).toBe(false)
  })
  it("plus de 12 heures rejeté, 12 accepté", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`)
    expect(normalizeFixedStarts(mk(12)).ok).toBe(true)
    expect(normalizeFixedStarts(mk(13)).ok).toBe(false)
  })
  it("jour hors 0–6 rejeté", () => {
    expect(isValidDayOfWeek(0)).toBe(true)
    expect(isValidDayOfWeek(6)).toBe(true)
    for (const bad of [-1, 7, 1.5, "1", null, NaN]) expect(isValidDayOfWeek(bad)).toBe(false)
  })
})
