/**
 * L87 — Factur-X raccordé aux vraies factures : moteur réel (sans 3e verrou),
 * référence d'origine des avoirs, repli et journal sans donnée client.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { input } from "./facturx-template-fixture"
import type { InvoicePdfData } from "@/lib/invoice/pdf"

const renderInvoicePdf = vi.fn(async (_d: InvoicePdfData) => Buffer.from("%PDF-SOURCE"))
const embedFacturXXmlInPdf = vi.fn(async (_i: { sourcePdf: Uint8Array; xml: string }) => Buffer.from("%PDF-FACTURX"))

vi.mock("@/lib/invoice/pdf", () => ({ renderInvoicePdf: (d: InvoicePdfData) => renderInvoicePdf(d) }))
vi.mock("@/lib/invoice/facturx-pdfa", () => ({
  embedFacturXXmlInPdf: (i: { sourcePdf: Uint8Array; xml: string }) => embedFacturXXmlInPdf(i),
}))

import { renderInvoicePdfSafe } from "@/lib/invoice/facturx-invoice"

const invoice = {
  ...input.invoice,
  id: 501,
  companyId: 77,
} as unknown as InvoicePdfData["invoice"]
const items = input.items.map((it, i) => ({ ...it, id: i + 1, invoiceId: 501 })) as unknown as InvoicePdfData["items"]

const creditNote = {
  ...invoice,
  id: 502,
  number: "AVO-2026-0001",
  documentType: "credit_note",
  originalInvoiceId: 501,
  creditReason: "Geste commercial",
  issuerIban: null,
  issuerBic: null,
  depositCents: 0,
  paidCents: 0,
  balanceCents: 0,
} as unknown as InvoicePdfData["invoice"]

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  renderInvoicePdf.mockClear()
  embedFacturXXmlInPdf.mockClear()
  vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
  vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
  vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "")
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("L87 — moteur Factur-X réel", () => {
  it("pilote + facture complète : modèle unique en police incorporée + XML embarqué, sans 3e verrou", async () => {
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items, logoDataUrl: "data:logo", originalRef: null })

    expect(pdf.toString()).toBe("%PDF-FACTURX")
    expect(renderInvoicePdf).toHaveBeenCalledOnce()
    expect(renderInvoicePdf.mock.calls[0][0]).toMatchObject({ embeddedFonts: true, logoDataUrl: "data:logo" })
    const { xml } = embedFacturXXmlInPdf.mock.calls[0][0]
    expect(xml).toContain("<rsm:CrossIndustryInvoice")
    expect(xml).toContain("<ram:GrandTotalAmount>180.00</ram:GrandTotalAmount>")
    expect(xml).toContain("<ram:DuePayableAmount>150.00</ram:DuePayableAmount>")
  })

  it("hors pilote : PDF classique (Helvetica), le moteur Factur-X n'est jamais appelé", async () => {
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "88")
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items })
    expect(pdf.toString()).toBe("%PDF-SOURCE")
    expect(renderInvoicePdf.mock.calls[0][0].embeddedFonts).toBeUndefined()
    expect(embedFacturXXmlInPdf).not.toHaveBeenCalled()
  })

  it("désactivé par défaut (variable absente)", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "")
    await renderInvoicePdfSafe({ companyId: 77, invoice, items })
    expect(embedFacturXXmlInPdf).not.toHaveBeenCalled()
  })

  it("montants du XML différents de la facture : PDF classique, code AMOUNT_MISMATCH journalisé", async () => {
    const bad = { ...invoice, totalCents: 18001 } as InvoicePdfData["invoice"]
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice: bad, items })
    expect(pdf.toString()).toBe("%PDF-SOURCE")
    expect(embedFacturXXmlInPdf).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      "FACTURX_PILOT_FALLBACK",
      expect.objectContaining({ codes: expect.arrayContaining(["AMOUNT_MISMATCH"]) }),
    )
  })

  it("avoir réel sans échéance : PDF classique (aucune règle de règlement inventée)", async () => {
    const pdf = await renderInvoicePdfSafe({
      companyId: 77,
      invoice: { ...creditNote, dueDate: null } as InvoicePdfData["invoice"],
      items,
      originalRef: { number: "FAC-2026-0042", issueDate: "2026-10-09" },
    })
    expect(pdf.toString()).toBe("%PDF-SOURCE")
    expect(embedFacturXXmlInPdf).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      "FACTURX_PILOT_FALLBACK",
      expect.objectContaining({ codes: ["CREDIT_NOTE_SETTLEMENT_UNDECIDED"] }),
    )
  })

  it("avoir avec échéance : XML type 381 lié à la facture d'origine", async () => {
    const pdf = await renderInvoicePdfSafe({
      companyId: 77,
      invoice: creditNote,
      items,
      originalRef: { number: "FAC-2026-0042", issueDate: "2026-10-09" },
    })
    expect(pdf.toString()).toBe("%PDF-FACTURX")
    const { xml } = embedFacturXXmlInPdf.mock.calls[0][0]
    expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>")
    expect(xml).toMatch(/<ram:InvoiceReferencedDocument>\s*<ram:IssuerAssignedID>FAC-2026-0042<\/ram:IssuerAssignedID>/)
    expect(xml).toContain('<qdt:DateTimeString format="102">20261009</qdt:DateTimeString>')
  })

  it("erreur de génération : PDF classique, journal sans message brut ni donnée client", async () => {
    embedFacturXXmlInPdf.mockRejectedValueOnce(new Error("boom Garage Martin SAS compta@garage-martin.example"))
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items })
    expect(pdf.toString()).toBe("%PDF-SOURCE")
    expect(renderInvoicePdf).toHaveBeenCalledTimes(2)
    expect(renderInvoicePdf.mock.calls[1][0].embeddedFonts).toBeUndefined()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('"reason":"RENDER_ERROR"')
    expect(logged).not.toContain("Garage Martin")
    expect(logged).not.toContain("garage-martin")
  })

  it("PDF Factur-X invalide : repli sur le PDF classique", async () => {
    embedFacturXXmlInPdf.mockResolvedValueOnce(Buffer.from("PAS UN PDF"))
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items })
    expect(pdf.toString()).toBe("%PDF-SOURCE")
    expect(JSON.stringify(warn.mock.calls)).toContain('"reason":"FACTURX_INVALID_PDF"')
  })
})
