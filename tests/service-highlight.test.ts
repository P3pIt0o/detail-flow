import { describe, it, expect } from "vitest"
import {
  normalizeHighlight,
  resolveHighlightLabel,
  isHighlightKind,
  HIGHLIGHT_LABEL_MAX,
} from "@/lib/services/highlight"

/**
 * LOT C — badges « Mise en avant » des prestations. Logique PURE, partagée
 * client/serveur. Priorité : rétrocompatibilité (NULL = aucun badge) et
 * absence de badge fantôme.
 */

describe("normalizeHighlight — validation serveur", () => {
  it("kind absent/inconnu => aucun badge (rétrocompatibilité)", () => {
    expect(normalizeHighlight(null, null)).toEqual({ highlightKind: null, highlightLabel: null })
    expect(normalizeHighlight("none", null)).toEqual({ highlightKind: null, highlightLabel: null })
    expect(normalizeHighlight("wat", "x")).toEqual({ highlightKind: null, highlightLabel: null })
  })

  it("preset connu => libellé fixe non stocké (label null)", () => {
    expect(normalizeHighlight("bestseller", "ignoré")).toEqual({
      highlightKind: "bestseller",
      highlightLabel: null,
    })
  })

  it("custom sans texte => aucun badge (jamais de badge vide)", () => {
    expect(normalizeHighlight("custom", "   ")).toEqual({ highlightKind: null, highlightLabel: null })
    expect(normalizeHighlight("custom", "")).toEqual({ highlightKind: null, highlightLabel: null })
  })

  it("custom => libellé rogné et borné à la longueur max", () => {
    const long = "A".repeat(HIGHLIGHT_LABEL_MAX + 20)
    const res = normalizeHighlight("custom", `  ${long}  `)
    expect(res.highlightKind).toBe("custom")
    expect(res.highlightLabel).toHaveLength(HIGHLIGHT_LABEL_MAX)
  })
})

describe("resolveHighlightLabel — rendu défensif", () => {
  it("kind inconnu (donnée héritée/corrompue) => pas de badge", () => {
    expect(resolveHighlightLabel("legacy_kind", "x")).toBeNull()
  })

  it("preset => libellé fixe", () => {
    expect(resolveHighlightLabel("most_booked", null)).toBe("Le plus réservé")
    expect(resolveHighlightLabel("new", null)).toBe("Nouveau")
  })

  it("custom => libellé personnalisé rogné", () => {
    expect(resolveHighlightLabel("custom", "  Offre du moment  ")).toBe("Offre du moment")
  })

  it("custom vide => pas de badge", () => {
    expect(resolveHighlightLabel("custom", "   ")).toBeNull()
  })
})

describe("isHighlightKind", () => {
  it("reconnaît uniquement les clés connues", () => {
    expect(isHighlightKind("recommended")).toBe(true)
    expect(isHighlightKind("none")).toBe(false)
    expect(isHighlightKind(null)).toBe(false)
    expect(isHighlightKind(42)).toBe(false)
  })
})
