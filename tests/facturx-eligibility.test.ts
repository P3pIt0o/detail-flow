import { describe, it, expect } from "vitest"
import { checkFacturXReadiness } from "@/lib/invoice/facturx-eligibility"
import { input } from "./facturx-template-fixture"

describe("Eligibilite Factur-X C4", () => {
  it("accepte une facture valide", () => {
    expect(checkFacturXReadiness(input)).toEqual({
      eligible: true,
    })
  })

  it("refuse un brouillon", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...input.invoice, status: "draft" },
    })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["INVOICE_NOT_ISSUED"]),
    })
  })

  it("refuse les avoirs", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...input.invoice, documentType: "credit_note" },
    })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["UNSUPPORTED_DOCUMENT_TYPE"]),
    })
  })

  it("refuse un pays client manquant", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...input.invoice, customerCountry: null },
    })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["MISSING_FIELD"]),
    })
  })

  it("refuse un total incoherent", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...input.invoice, totalCents: 18001 },
    })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["AMOUNT_MISMATCH"]),
    })
  })

  it("refuse un traitement TVA absent", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...input.invoice, taxTreatment: null },
    })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["TAX_TREATMENT_MISSING"]),
    })
  })
})
