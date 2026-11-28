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

  const creditNote = {
    ...input.invoice,
    documentType: "credit_note",
    originalInvoiceId: 41,
    creditReason: "Geste commercial",
    issuerIban: null,
    issuerBic: null,
    depositCents: 0,
    paidCents: 0,
    balanceCents: 0,
    dueDate: null,
  }
  const originalInvoice = { number: "FAC-2026-0041", issueDate: "2026-10-01" }

  it("refuse un avoir sans échéance (règlement non défini, rien d'inventé)", () => {
    const result = checkFacturXReadiness({ ...input, invoice: creditNote, originalInvoice })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["CREDIT_NOTE_SETTLEMENT_UNDECIDED"]),
    })
  })

  it("accepte un avoir avec échéance et facture d'origine", () => {
    const result = checkFacturXReadiness({
      ...input,
      invoice: { ...creditNote, dueDate: "2026-11-08" },
      originalInvoice,
    })
    expect(result).toEqual({ eligible: true })
  })

  it("refuse un avoir sans référence de facture d'origine", () => {
    const result = checkFacturXReadiness({ ...input, invoice: { ...creditNote, dueDate: "2026-11-08" } })
    expect(result).toMatchObject({
      eligible: false,
      codes: expect.arrayContaining(["ORIGINAL_INVOICE_REFERENCE_MISSING"]),
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
