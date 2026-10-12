import { afterEach, describe, expect, it, vi } from "vitest"
import { extract, check } from "@stafyniaksacha/facturx"
import { PDFDocument } from "pdf-lib"
import { renderInvoicePdfSafe } from "@/lib/invoice/facturx-invoice"
import type { InvoicePdfData } from "@/lib/invoice/pdf"
import { input } from "./facturx-template-fixture"

const data = {
  companyId: 77,
  invoice: input.invoice as unknown as InvoicePdfData["invoice"],
  items: input.items as unknown as InvoicePdfData["items"],
  logoDataUrl: null,
  originalRef: null,
}

const legacyPdf = Buffer.from("%PDF-LEGACY-TEST")
const legacy = vi.fn(async () => legacyPdf)

function enablePilot() {
  vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
  vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  legacy.mockClear()
})

describe("Factur-X C4 - branchement reel fail closed", () => {
  it("garde le legacy par defaut meme pour le pilote", async () => {
    enablePilot()
    vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "false")
    expect(await renderInvoicePdfSafe(data, { legacy })).toBe(legacyPdf)
    expect(legacy).toHaveBeenCalledOnce()
  })

  it("garde le legacy pour un autre tenant", async () => {
    enablePilot()
    vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "true")
    expect(await renderInvoicePdfSafe({ ...data, companyId: 88 }, { legacy }))
      .toBe(legacyPdf)
    expect(legacy).toHaveBeenCalledOnce()
  })

  it("garde le legacy sur avoir", async () => {
    enablePilot()
    vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "true")
    const credit = {
      ...data,
      invoice: { ...data.invoice, documentType: "credit_note" } as InvoicePdfData["invoice"],
    }
    expect(await renderInvoicePdfSafe(credit, { legacy })).toBe(legacyPdf)
    expect(legacy).toHaveBeenCalledOnce()
  })

  it("cree un vrai PDF avec XML valide pour une facture pilote", async () => {
    enablePilot()
    vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "true")
    const pdf = await renderInvoicePdfSafe(data, { legacy })
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(legacy).not.toHaveBeenCalled()
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0)
    const embeddedXml = Buffer.from((await extract({ pdf })).xml).toString("utf8")
    const validation = await check({ xml: embeddedXml, schematron: true })
    expect(validation.valid).toBe(true)
    expect(validation.schematronValid).toBe(true)
  }, 30000)

  it("trace le repli sans journaliser le snapshot client", async () => {
    enablePilot()
    vi.stubEnv("FACTURX_C4_FINAL_RENDERER_ENABLED", "true")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const final = vi.fn(async () => {
      throw new Error("FACTURX_INVALID_SNAPSHOT: " + JSON.stringify({ customerName: "SECRET" }))
    })
    expect(await renderInvoicePdfSafe(data, { legacy, final })).toBe(legacyPdf)
    expect(warn).toHaveBeenCalledWith("FACTURX_PILOT_FALLBACK", {
      companyId: 77,
      invoiceId: data.invoice.id,
      reason: "FACTURX_INVALID_SNAPSHOT",
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET")
  })
})
