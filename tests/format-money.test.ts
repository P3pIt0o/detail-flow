import { describe, it, expect } from "vitest"
import { formatMoney } from "@/lib/format"

// LOT 2B.1 — devise au rendu. formatMoney n'effectue AUCUN calcul ni conversion
// FX : 10000 centimes = 100,00 unités de la devise, quelle que soit la devise.
// NBSP = espace insécable utilisé par Intl fr-FR.

describe("formatMoney — devise de la facture", () => {
  it("10000 + EUR => montant en euros", () => {
    const out = formatMoney(10000, "EUR")
    expect(out).toContain("100,00")
    expect(out).toContain("€")
  })

  it("10000 + CHF => montant en francs suisses", () => {
    const out = formatMoney(10000, "CHF")
    expect(out).toContain("100,00")
    expect(out).toContain("CHF")
  })

  it("10000 + USD => montant en dollars", () => {
    const out = formatMoney(10000, "USD")
    expect(out).toContain("100,00")
    // Intl fr-FR rend l'USD "$US" ; on vérifie juste la présence du symbole $.
    expect(out).toContain("$")
  })

  it("currencyCode NULL => fallback VISUEL EUR (legacy)", () => {
    const out = formatMoney(10000, null)
    expect(out).toContain("100,00")
    expect(out).toContain("€")
  })

  it("currencyCode vide / espaces => fallback VISUEL EUR (legacy)", () => {
    expect(formatMoney(10000, "")).toContain("€")
    expect(formatMoney(10000, "   ")).toContain("€")
  })

  it("code invalide => aucun crash, fallback sûr sans mentir sur la devise", () => {
    const out = formatMoney(12345, "XYZ")
    // Ne se transforme JAMAIS en EUR : le code inconnu est affiché tel quel.
    expect(out).toContain("123,45")
    expect(out).toContain("XYZ")
    expect(out).not.toContain("€")
  })

  it("aucune conversion FX : EUR et CHF donnent la même valeur numérique", () => {
    expect(formatMoney(10000, "EUR")).toContain("100,00")
    expect(formatMoney(10000, "CHF")).toContain("100,00")
  })

  it("immutabilité : une facture EUR reste EUR (la devise vient de l'argument, pas d'un réglage global)", () => {
    // Simule une facture legacy/EUR rendue alors que le tenant passerait à CHF :
    // formatMoney ne lit aucun état global, seule la devise passée compte.
    const invoiceEur = formatMoney(4200, "EUR")
    expect(invoiceEur).toContain("€")
    expect(invoiceEur).not.toContain("CHF")
  })

  it("une liste EUR + CHF formate chaque ligne dans SA devise", () => {
    const rows = [
      { totalCents: 12000, currencyCode: "EUR" as string | null },
      { totalCents: 12000, currencyCode: "CHF" as string | null },
    ]
    const rendered = rows.map((r) => formatMoney(r.totalCents, r.currencyCode))
    expect(rendered[0]).toContain("€")
    expect(rendered[1]).toContain("CHF")
  })

  it("les centimes ne sont pas modifiés : 4299 => 42,99", () => {
    expect(formatMoney(4299, "EUR")).toContain("42,99")
    expect(formatMoney(4299, "CHF")).toContain("42,99")
  })
})
