import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getDisplayCurrencyCode } from "@/lib/format"

// Reproduit exactement la construction des labels côté composants.
const puLabel = (code: string | null) => `P.U. (${getDisplayCurrencyCode(code)})`
const remiseLabel = (code: string | null) => `Remise (${getDisplayCurrencyCode(code)})`
const montantLabel = (code: string | null) => `Montant (${getDisplayCurrencyCode(code)})`

describe("getDisplayCurrencyCode", () => {
  it("null => EUR legacy", () => expect(getDisplayCurrencyCode(null)).toBe("EUR"))
  it("vide => EUR legacy", () => expect(getDisplayCurrencyCode("  ")).toBe("EUR"))
  it("trim + uppercase", () => expect(getDisplayCurrencyCode(" chf ")).toBe("CHF"))
})

describe("labels de saisie facture — CHF", () => {
  it("P.U. (CHF)", () => expect(puLabel("CHF")).toBe("P.U. (CHF)"))
  it("Remise (CHF)", () => expect(remiseLabel("CHF")).toBe("Remise (CHF)"))
  it("Montant (CHF)", () => expect(montantLabel("CHF")).toBe("Montant (CHF)"))
  it("aucun symbole € en CHF", () => {
    for (const l of [puLabel("CHF"), remiseLabel("CHF"), montantLabel("CHF")]) {
      expect(l).not.toContain("€")
    }
  })
})

describe("labels de saisie facture — EUR / legacy", () => {
  it("EUR explicite", () => {
    expect(puLabel("EUR")).toBe("P.U. (EUR)")
    expect(remiseLabel("EUR")).toBe("Remise (EUR)")
    expect(montantLabel("EUR")).toBe("Montant (EUR)")
  })
  it("currencyCode null => labels EUR legacy", () => {
    expect(puLabel(null)).toBe("P.U. (EUR)")
    expect(remiseLabel(null)).toBe("Remise (EUR)")
    expect(montantLabel(null)).toBe("Montant (EUR)")
  })
})

// Garde structurelle : aucun label devise hardcodé ne doit revenir dans les
// composants facture (P.U. €, Remise €, Montant (€)).
describe("garde structurelle — pas de label EUR hardcodé", () => {
  const files = ["components/admin/invoice-editor.tsx", "components/admin/invoice-view.tsx"]
  for (const f of files) {
    it(`${f} ne contient aucun label devise hardcodé`, () => {
      const src = readFileSync(resolve(process.cwd(), f), "utf8")
      expect(src).not.toMatch(/P\.U\.\s*€/)
      expect(src).not.toMatch(/Remise\s*€/)
      expect(src).not.toMatch(/Montant\s*\(€\)/)
    })
  }
})
