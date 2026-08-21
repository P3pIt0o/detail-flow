import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// LOT 2B.1 — garde structurelle : les rendus de FACTURE ne doivent plus
// formater de montant en EUR hardcodé ; ils passent par formatMoney(cents,
// invoice.currencyCode). On tolère le symbole € présent dans des commentaires,
// donc on cible les motifs de FORMATAGE réels.
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("rendus facture : plus de devise EUR hardcodée", () => {
  it("le PDF facture n'appelle plus formatPrice", () => {
    const src = read("lib/invoice/pdf.tsx")
    expect(src).not.toMatch(/formatPrice\(/)
    expect(src).toMatch(/formatMoney\(/)
  })

  it("la vue facture n'appelle plus formatPrice", () => {
    const src = read("components/admin/invoice-view.tsx")
    expect(src).not.toMatch(/formatPrice\(/)
    expect(src).toMatch(/formatMoney\(/)
  })

  it("l'éditeur facture n'appelle plus formatPrice", () => {
    const src = read("components/admin/invoice-editor.tsx")
    expect(src).not.toMatch(/formatPrice\(/)
    expect(src).toMatch(/formatMoney\(/)
  })

  it("la liste des factures formate chaque ligne avec sa devise", () => {
    const src = read("app/admin/(dashboard)/factures/page.tsx")
    expect(src).not.toMatch(/formatPrice\(/)
    expect(src).toMatch(/formatMoney\(inv\.totalCents, inv\.currencyCode\)/)
    expect(src).toMatch(/formatMoney\(inv\.balanceCents, inv\.currencyCode\)/)
  })

  it("l'email facture utilise la devise de la facture", () => {
    const src = read("lib/email/templates.ts")
    // invoiceEmail passe opts.currencyCode à formatMoney pour Total/Reste.
    expect(src).toMatch(/formatMoney\(opts\.totalCents, opts\.currencyCode\)/)
    expect(src).toMatch(/formatMoney\(opts\.balanceCents, opts\.currencyCode\)/)
  })
})
