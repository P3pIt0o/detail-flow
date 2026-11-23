import { describe, expect, it, vi } from "vitest"
import { findFirstAvailableDate, SEARCH_MAX_DAYS, type DayLike } from "@/lib/booking/first-available"
import { dateWindow, formatNextAvailability, nextOffset, prevOffset, windowOffsetFor } from "@/lib/booking/v2"

const FROM = new Date(2026, 10, 23) // 23/11/2026

/** Pro dont tous les jours avant `freeFrom` (clé de date) sont complets. */
function pro(freeFrom: string) {
  return vi.fn(async (date: string): Promise<DayLike> => {
    const ok = date >= freeFrom
    return { date, available: ok, slots: ok ? ["09:00"] : [] }
  })
}
const keyAt = (n: number) => dateWindow(FROM, n, 1)[0]

describe("L73 — première date disponible", () => {
  it("congés jusqu'à J+50 → J+51", async () => {
    const getDay = pro(keyAt(51))
    expect(await findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay })).toBe(keyAt(51))
  })

  it("dispo aujourd'hui : un seul paquet de 14 jours", async () => {
    const getDay = pro(keyAt(0))
    expect(await findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay })).toBe(keyAt(0))
    expect(getDay).toHaveBeenCalledTimes(14)
  })

  it("arrêt au premier paquet positif", async () => {
    const getDay = pro(keyAt(20))
    await findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay })
    expect(getDay).toHaveBeenCalledTimes(28)
  })

  it("rien sur 180 jours → null, jamais plus de 180 jours examinés", async () => {
    const getDay = pro(keyAt(181))
    expect(await findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay })).toBeNull()
    expect(getDay).toHaveBeenCalledTimes(SEARCH_MAX_DAYS)
    const dates = getDay.mock.calls.map((c) => c[0])
    expect(dates.every((d) => d <= keyAt(179))).toBe(true)
  })

  it("dernier jour du plafond (J+179) trouvé", async () => {
    const getDay = pro(keyAt(179))
    expect(await findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay })).toBe(keyAt(179))
  })

  it("durée ≤ 0 ou véhicules invalides : refusés sans balayage", async () => {
    for (const [d, v] of [[0, 1], [-5, 1], [60, 0], [60, 1.5], [60, Number.NaN], [Number.NaN, 1], [60, 999]]) {
      const getDay = pro(keyAt(0))
      expect(await findFirstAvailableDate({ from: FROM, durationMin: d, vehicleCount: v, getDay })).toBeNull()
      expect(getDay).not.toHaveBeenCalled()
    }
  })

  it("isolation entre pros : appels entrelacés, aucun état partagé", async () => {
    const proA = pro(keyAt(51))
    const proB = pro(keyAt(1))
    const [a, b, a2, b2] = await Promise.all([
      findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay: proA }),
      findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay: proB }),
      findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay: proA }),
      findFirstAvailableDate({ from: FROM, durationMin: 60, vehicleCount: 1, getDay: proB }),
    ])
    expect([a, a2]).toEqual([keyAt(51), keyAt(51)])
    expect([b, b2]).toEqual([keyAt(1), keyAt(1)])
    expect(proB.mock.calls.every((c) => c[0] < keyAt(14))).toBe(true)
  })
})

describe("L73 — fenêtre et flèches", () => {
  it("J+51 → décalage 42", () => {
    expect(windowOffsetFor(FROM, keyAt(51))).toBe(42)
    expect(windowOffsetFor(FROM, keyAt(0))).toBe(0)
    expect(windowOffsetFor(FROM, keyAt(13))).toBe(0)
    expect(windowOffsetFor(FROM, keyAt(14))).toBe(14)
  })

  it("précédent : 42 → 28 → 14 → 0, jamais négatif", () => {
    expect(prevOffset(42)).toBe(28)
    expect(prevOffset(28)).toBe(14)
    expect(prevOffset(14)).toBe(0)
    expect(prevOffset(0)).toBe(0)
  })

  it("suivant plafonné à 180", () => {
    expect(nextOffset(42)).toBe(56)
    expect(nextOffset(180)).toBe(180)
    expect(nextOffset(182)).toBe(182)
  })

  it("libellé français", () => {
    expect(formatNextAvailability("2027-01-16")).toBe("Prochaine disponibilité : samedi 16 janvier")
    expect(formatNextAvailability("2026-01-16")).toBe("Prochaine disponibilité : vendredi 16 janvier")
  })
})
