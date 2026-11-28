import { describe, it, expect, vi, afterEach } from "vitest"
import { renderInvoicePdfSafe } from "@/lib/invoice/facturx-invoice"
import type { InvoicePdfData } from "@/lib/invoice/pdf"

const data = {
  companyId: 77,
  invoice: {} as InvoicePdfData["invoice"],
  items: [] as InvoicePdfData["items"],
  logoDataUrl: null,
  originalRef: null,
}

const oldPdf = Buffer.from("%PDF-OLD")
const newPdf = Buffer.from("%PDF-NEW")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Securite Factur-X C4", () => {
  it("desactive par defaut", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "false")
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async () => newPdf)
    expect(await renderInvoicePdfSafe(data, { legacy, final }))
      .toBe(oldPdf)
    expect(final).not.toHaveBeenCalled()
  })

  it("refuse un autre tenant", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "88")
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async () => newPdf)
    expect(await renderInvoicePdfSafe(data, { legacy, final }))
      .toBe(oldPdf)
    expect(final).not.toHaveBeenCalled()
  })

  it("utilise l'ancien PDF pour une facture incomplète du pilote", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async () => newPdf)
    expect(await renderInvoicePdfSafe(data, { legacy, final }))
      .toBe(oldPdf)
    expect(final).not.toHaveBeenCalled()
  })

  it("n'appelle pas deux fois l'ancien PDF quand la facture pilote est non éligible", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
    vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const legacy = vi.fn(async (): Promise<Buffer> => {
      throw new Error("LEGACY_FAILURE")
    })
    await expect(renderInvoicePdfSafe(data, { legacy })).rejects.toThrow("LEGACY_FAILURE")
    expect(legacy).toHaveBeenCalledTimes(1)
  })

  it("n'appelle pas deux fois l'ancien PDF", async () => {
    vi.stubEnv("FACTURX_INVOICES_ENABLED", "false")
    const legacy = vi.fn(async () => {
      throw new Error("LEGACY_FAILURE")
    })
    await expect(
      renderInvoicePdfSafe(data, { legacy })
    ).rejects.toThrow("LEGACY_FAILURE")
    expect(legacy).toHaveBeenCalledTimes(1)
  })
})
