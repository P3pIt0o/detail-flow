import { describe, it, expect, vi, afterEach } from "vitest"
import { input } from "./facturx-template-fixture"
import { renderInvoicePdfSafe } from "@/lib/invoice/facturx-invoice"
import type { InvoicePdfData } from "@/lib/invoice/pdf"

const data = {
  companyId: 77,
  invoice: input.invoice as unknown as InvoicePdfData["invoice"],
  items: input.items as unknown as InvoicePdfData["items"],
  logoDataUrl: null,
  originalRef: null,
}

const oldPdf = Buffer.from("%PDF-OLD")
const newPdf = Buffer.from("%PDF-NEW")

function activate() {
  vi.stubEnv("FACTURX_INVOICES_ENABLED", "true")
  vi.stubEnv("FACTURX_PILOT_COMPANY_IDS", "77")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Factur-X C4 - activation pilote", () => {
  it("accepte une facture compatible", async () => {
    activate()
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async () => newPdf)

    const pdf = await renderInvoicePdfSafe(data, { legacy, final })

    expect(pdf).toBe(newPdf)
    expect(final).toHaveBeenCalledOnce()
    expect(legacy).not.toHaveBeenCalled()
  })

  it("refuse une facture incompatible", async () => {
    activate()
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async () => newPdf)
    const badData = {
      ...data,
      invoice: {
        ...data.invoice,
        documentType: "credit_note",
      } as InvoicePdfData["invoice"],
    }

    const pdf = await renderInvoicePdfSafe(badData, { legacy, final })

    expect(pdf).toBe(oldPdf)
    expect(final).not.toHaveBeenCalled()
  })

  it("conserve l'ancien PDF en cas de panne", async () => {
    activate()
    const legacy = vi.fn(async () => oldPdf)
    const final = vi.fn(async (): Promise<Buffer> => {
      throw new Error("FACTURX_FAILURE")
    })
    vi.spyOn(console, "warn").mockImplementation(() => {})

    const pdf = await renderInvoicePdfSafe(data, { legacy, final })

    expect(pdf).toBe(oldPdf)
    expect(legacy).toHaveBeenCalledOnce()
  })
})
