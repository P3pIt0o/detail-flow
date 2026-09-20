import { describe, it, expect } from "vitest"
import { formatDuration } from "@/lib/format"

// Helper GLOBAL DetailFlow : conversion d'AFFICHAGE uniquement (les durées
// restent stockées en MINUTES en base). Présentation française « propre » :
// "45 min", "1 h", "1 h 30", "2 h", jamais "90 minutes" ni "1.5 h".
// Bénéficie à tous les tenants (Spirit ACS inclus) sans condition spécifique.

describe("formatDuration — affichage heures/minutes (fr)", () => {
  it("respecte exactement le tableau de correspondance demandé", () => {
    const cases: Array<[number, string]> = [
      [0, "0 min"],
      [15, "15 min"],
      [30, "30 min"],
      [45, "45 min"],
      [60, "1 h"],
      [75, "1 h 15"],
      [90, "1 h 30"],
      [120, "2 h"],
      [135, "2 h 15"],
      [150, "2 h 30"],
      [180, "3 h"],
      [240, "4 h"],
    ]
    for (const [minutes, expected] of cases) {
      expect(formatDuration(minutes)).toBe(expected)
    }
  })

  it("sous 60 min => reste en minutes", () => {
    expect(formatDuration(5)).toBe("5 min")
    expect(formatDuration(59)).toBe("59 min")
  })

  it("heure pleine => pas de minutes affichées", () => {
    expect(formatDuration(60)).toBe("1 h")
    expect(formatDuration(120)).toBe("2 h")
    expect(formatDuration(600)).toBe("10 h")
  })

  it("minutes < 10 => zéro de tête pour un rendu propre (1 h 05)", () => {
    expect(formatDuration(65)).toBe("1 h 05")
    expect(formatDuration(125)).toBe("2 h 05")
  })

  it("ne produit jamais de format décimal ni le mot « minutes »", () => {
    const out = formatDuration(150)
    expect(out).not.toContain("minute")
    expect(out).not.toContain(".")
    expect(out).not.toContain("2.5")
  })
})
