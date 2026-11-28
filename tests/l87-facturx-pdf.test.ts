/**
 * L87 — PDF Factur-X final, de bout en bout (sans simulation du rendu) :
 * modèle unique pdf.tsx en Lato incorporée, profil couleur, XML embarqué.
 * La conformité PDF/A-3b officielle reste à valider en externe sur Preview.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { input } from "./facturx-template-fixture"
import { buildFacturXXml } from "@/lib/invoice/facturx/xml"
import { renderInvoicePdfSafe } from "@/lib/invoice/facturx-invoice"
import type { InvoicePdfData } from "@/lib/invoice/pdf"

const invoice = {
  ...input.invoice,
  id: 601,
  companyId: 77,
  issuerPhone: null,
  customerPhone: null,
  vehicleTypeName: null,
  vehicleBrand: "Peugeot",
  vehicleModel: "308",
  vehiclePlate: null,
  footerNote: null,
  legalMentions: null,
  vatExemptNote: null,
  issuerSiret: null,
  issuerLogoPathname: null,
} as unknown as InvoicePdfData["invoice"]
const items = input.items.map((it, i) => ({ ...it, id: i + 1, invoiceId: 601 })) as unknown as InvoicePdfData["items"]

afterEach(() => vi.unstubAllEnvs())

describe("L87 — PDF Factur-X final", () => {
  it("pilote : XML embarqué identique, polices incorporées, profil couleur présent", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items, logoDataUrl: null, originalRef: null })
    expect(warn).not.toHaveBeenCalled()
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")

    const { extract } = await import("@stafyniaksacha/facturx")
    const extracted = await extract({ pdf })
    const expected = buildFacturXXml({ ...input, originalInvoice: null })
    if (!expected.ok) throw new Error("fixture invalide")
    const normalize = (x: string) => x.trim().replace(/^<\?xml[^>]*\?>/i, "")
    expect(normalize(Buffer.from(extracted.xml).toString("utf8"))).toBe(normalize(expected.xml))

    const { PDFDocument, PDFName, PDFDict, PDFArray } = await import("pdf-lib")
    const doc = await PDFDocument.load(pdf)
    const intents = doc.catalog.lookup(PDFName.of("OutputIntents"), PDFArray)
    expect(intents.size()).toBeGreaterThan(0)

    // Polices : toutes incorporées (FontFile2), aucune Helvetica standard.
    const fonts: string[] = []
    let embedded = 0
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict)) continue
      const type = obj.get(PDFName.of("Type"))
      if (type?.toString() === "/FontDescriptor") {
        if (obj.get(PDFName.of("FontFile2")) || obj.get(PDFName.of("FontFile3"))) embedded++
      }
      if (type?.toString() === "/Font") {
        const base = obj.get(PDFName.of("BaseFont"))?.toString() ?? ""
        if (base) fonts.push(base)
      }
    }
    expect(fonts.length).toBeGreaterThan(0)
    expect(fonts.some((f) => /Helvetica/i.test(f))).toBe(false)
    expect(fonts.every((f) => /Lato/i.test(f))).toBe(true)
    expect(embedded).toBeGreaterThan(0)
  }, 30000)

  it("hors pilote : PDF classique sans XML embarqué", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "false")
    const pdf = await renderInvoicePdfSafe({ companyId: 77, invoice, items })
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    const raw = pdf.toString("latin1")
    expect(raw).not.toContain("factur-x.xml")
    expect(raw).toContain("Helvetica")
  }, 30000)
})
