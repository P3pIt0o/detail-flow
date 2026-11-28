/**
 * L87 — message « facture électronique impossible » affiché au pro.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import { input } from "./facturx-template-fixture"
import { buildFacturXNotice, describeFacturXErrors } from "@/lib/invoice/facturx-messages"
import type { InvoiceItemRow, InvoiceRow } from "@/lib/invoice/queries"

const invoice = { ...input.invoice, id: 9, companyId: 77 } as unknown as InvoiceRow
const items = input.items.map((it, i) => ({ ...it, id: i + 1, invoiceId: 9 })) as unknown as InvoiceItemRow[]

function pilot() {
  vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
  vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
}

afterEach(() => vi.unstubAllEnvs())

describe("L87 — message Factur-X", () => {
  it("hors pilote : aucun message, même pour une facture incomplète", () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "88")
    const bad = { ...invoice, issuerVatNumber: null } as InvoiceRow
    expect(buildFacturXNotice({ companyId: 77, invoice: bad, items })).toBeNull()
  })

  it("pilote + facture complète : aucun message", () => {
    pilot()
    expect(buildFacturXNotice({ companyId: 77, invoice, items })).toBeNull()
  })

  it("dit quoi manque et où le compléter (paramètres / brouillon)", () => {
    pilot()
    const bad = { ...invoice, issuerVatNumber: null, customerCountry: null } as InvoiceRow
    expect(buildFacturXNotice({ companyId: 77, invoice: bad, items })).toEqual({
      kind: "missing",
      items: [
        { label: "Votre numéro de TVA", where: "settings" },
        { label: "Le pays du client", where: "draft" },
      ],
    })
  })

  it("brouillon ou facture annulée : aucun message", () => {
    pilot()
    expect(buildFacturXNotice({ companyId: 77, invoice: { ...invoice, status: "draft" } as InvoiceRow, items })).toBeNull()
    expect(
      buildFacturXNotice({ companyId: 77, invoice: { ...invoice, status: "cancelled" } as InvoiceRow, items }),
    ).toBeNull()
  })

  it("avoir sans échéance : message dédié (règlement non défini)", () => {
    pilot()
    const credit = {
      ...invoice,
      documentType: "credit_note",
      originalInvoiceId: 8,
      issuerIban: null,
      depositCents: 0,
      paidCents: 0,
      balanceCents: 0,
      dueDate: null,
    } as unknown as InvoiceRow
    expect(
      buildFacturXNotice({
        companyId: 77,
        invoice: credit,
        items,
        originalRef: { number: "FAC-2026-0041", issueDate: "2026-10-01" },
      }),
    ).toEqual({ kind: "credit_note_settlement" })
  })

  it("isolation : une facture d'un autre tenant ne reçoit jamais de message", () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77,88")
    const otherTenant = { ...invoice, companyId: 88, issuerVatNumber: null } as InvoiceRow
    expect(buildFacturXNotice({ companyId: 77, invoice: otherTenant, items })).toBeNull()
  })

  it("montants incohérents : renvoie vers le support, sans doublon", () => {
    const notice = describeFacturXErrors([
      { code: "AMOUNT_MISMATCH", field: "invoice.totalCents", message: "x" },
      { code: "AMOUNT_MISMATCH", field: "invoice.balanceCents", message: "x" },
    ])
    expect(notice).toEqual({
      kind: "missing",
      items: [{ label: "Les montants de la facture sont incohérents", where: "support" }],
    })
  })

  it("aucun message technique (code, règle EN16931) n'est exposé", () => {
    pilot()
    const bad = { ...invoice, issuerVatNumber: null, taxTreatment: null } as InvoiceRow
    const notice = buildFacturXNotice({ companyId: 77, invoice: bad, items })
    const text = JSON.stringify(notice)
    expect(text).not.toMatch(/BR-|BT-|MISSING_FIELD|EN16931/)
    expect(notice).toMatchObject({ kind: "missing" })
  })
})
