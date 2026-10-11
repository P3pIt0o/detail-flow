import { describe, it, expect } from "vitest"
import { toFacturXInput } from "@/lib/invoice/facturx-adapter"
import { input } from "./facturx-template-fixture"

const invoice = {
  ...input.invoice,
  id: 133,
  companyId: 17,
  internalNote: "SECRET INTERNE",
} as unknown as Parameters<typeof toFacturXInput>[0]

const rows = input.items.map((item, index) => ({
  ...item,
  id: index + 1,
  invoiceId: 133,
})) as unknown as Parameters<typeof toFacturXInput>[1]

describe("Adaptateur Factur-X C4", () => {
  it("conserve le snapshot de facture", () => {
    const result = toFacturXInput(invoice, rows)
    expect(result).toEqual(input)
  })

  it("exclut les informations internes", () => {
    const result = toFacturXInput(invoice, rows)
    expect(result.invoice).not.toHaveProperty("id")
    expect(result.invoice).not.toHaveProperty("companyId")
    expect(result.invoice).not.toHaveProperty("internalNote")
    expect(result.items[0]).not.toHaveProperty("invoiceId")
  })

  it("ne recalcule jamais les montants", () => {
    const modified = {
      ...invoice,
      totalCents: 18001,
    }
    const result = toFacturXInput(modified, rows)
    expect(result.invoice.totalCents).toBe(18001)
  })

  it("conserve quantites et prix unitaires", () => {
    const result = toFacturXInput(invoice, rows)
    expect(result.items).toEqual(input.items)
  })
})
