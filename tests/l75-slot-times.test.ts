import { describe, expect, it } from "vitest"
import { computeSlotStarts, parseFixedStarts, type SlotInput } from "@/lib/booking/slot-times"

const base: SlotInput = {
  open: 8 * 60,
  close: 18 * 60,
  durationMin: 120,
  step: 60,
  buffer: 15,
  minStartFromNotice: 0,
  busy: [],
  blockedRanges: [],
}

describe("L75 — heures de début fixes", () => {
  it("samedi [08:00,13:00] : seulement ces deux départs", () => {
    expect(computeSlotStarts({ ...base, fixedStarts: ["08:00", "13:00"] })).toEqual(["08:00", "13:00"])
  })
  it("dimanche [08:00] : seulement 08:00", () => {
    expect(computeSlotStarts({ ...base, fixedStarts: ["08:00"] })).toEqual(["08:00"])
  })
  it("sans option : pas global inchangé", () => {
    const s = computeSlotStarts(base)
    expect(s[0]).toBe("08:00")
    expect(s).toContain("09:00")
    expect(s[s.length - 1]).toBe("16:00")
    expect(computeSlotStarts({ ...base, fixedStarts: [] })).toEqual(s)
  })
  it("départ occupé (tampon inclus) non proposé", () => {
    // RDV 08:00-10:00 + tampon 15 : 13:00 reste libre, 08:00 non
    const r = computeSlotStarts({ ...base, busy: [{ start: 480, end: 600 }], fixedStarts: ["08:00", "13:00"] })
    expect(r).toEqual(["13:00"])
    // RDV finissant 12:50 : 13:00 < 12:50+15 => non proposé
    const r2 = computeSlotStarts({ ...base, busy: [{ start: 600, end: 770 }], fixedStarts: ["13:00"] })
    expect(r2).toEqual([])
  })
  it("plage bloquée : départ non proposé", () => {
    const r = computeSlotStarts({ ...base, blockedRanges: [{ start: 14 * 60, end: 15 * 60 }], fixedStarts: ["08:00", "13:00"] })
    expect(r).toEqual(["08:00"])
  })
  it("prestation qui dépasse la fermeture ou départ avant ouverture : non proposé", () => {
    expect(computeSlotStarts({ ...base, fixedStarts: ["17:00", "07:00"] })).toEqual([])
    expect(computeSlotStarts({ ...base, fixedStarts: ["16:00"] })).toEqual(["16:00"])
  })
  it("préavis respecté", () => {
    expect(computeSlotStarts({ ...base, minStartFromNotice: 10 * 60, fixedStarts: ["08:00", "13:00"] })).toEqual(["13:00"])
  })
  it("parseFixedStarts ignore les valeurs invalides, trie, dédoublonne", () => {
    expect(parseFixedStarts("13:00, 08:00,xx,8:00,13:00")).toEqual(["08:00", "13:00"])
    expect(parseFixedStarts(null)).toEqual([])
  })
})
