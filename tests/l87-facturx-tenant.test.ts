/**
 * L87 — isolation tenant : téléchargement du PDF et page de la facture.
 * Le tenant B reçoit 404 sur la facture du tenant A ; le companyId utilisé
 * vient UNIQUEMENT du contexte membre ; le message n'est jamais calculé
 * pour une facture d'un autre tenant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const getCompanyMemberContext = vi.fn()
const requireCompanyMember = vi.fn()
const getInvoiceDetail = vi.fn()
const renderInvoicePdfSafe = vi.fn(async (_d: unknown) => Buffer.from("%PDF-X"))
const buildFacturXNotice = vi.fn((_i: unknown) => null)
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})

vi.mock("@/lib/admin", () => ({
  getCompanyMemberContext: () => getCompanyMemberContext(),
  requireCompanyMember: () => requireCompanyMember(),
}))
vi.mock("@/lib/invoice/queries", () => ({
  getInvoiceDetail: (id: number, cid?: number) => getInvoiceDetail(id, cid),
}))
vi.mock("@/lib/invoice/facturx-invoice", () => ({
  renderInvoicePdfSafe: (d: unknown) => renderInvoicePdfSafe(d),
}))
vi.mock("@/lib/invoice/facturx-messages", () => ({
  buildFacturXNotice: (i: unknown) => buildFacturXNotice(i),
}))
vi.mock("@/lib/invoice/logo", () => ({ getLogoDataUrl: async () => null }))
vi.mock("next/navigation", () => ({ notFound: () => notFound() }))
vi.mock("@/components/admin/invoice-editor", () => ({ InvoiceEditor: () => null }))
vi.mock("@/components/admin/invoice-view", () => ({ InvoiceView: () => null }))

const TENANT_A = 11
const TENANT_B = 22
// Base simulée : la facture 5 appartient au tenant A.
function fakeDetail(id: number, cid?: number) {
  if (id === 5 && cid === TENANT_A) {
    return {
      invoice: { id: 5, companyId: TENANT_A, status: "issued", number: "FAC-1", issuerLogoPathname: null },
      items: [],
      originalInvoice: null,
      payments: [],
      events: [],
      creditNotes: [],
      creditSummary: null,
    }
  }
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  getInvoiceDetail.mockImplementation(async (id: number, cid?: number) => fakeDetail(id, cid))
})

describe("L87 — route PDF", () => {
  it("le tenant B reçoit 404 sur la facture du tenant A, rien n'est généré", async () => {
    getCompanyMemberContext.mockResolvedValue({ tenant: { id: TENANT_B } })
    const { GET } = await import("@/app/api/factures/[id]/pdf/route")
    const res = await GET({} as never, { params: Promise.resolve({ id: "5" }) })
    expect(res.status).toBe(404)
    expect(getInvoiceDetail).toHaveBeenCalledWith(5, TENANT_B)
    expect(renderInvoicePdfSafe).not.toHaveBeenCalled()
  })

  it("le tenant A obtient son PDF, généré avec SON companyId", async () => {
    getCompanyMemberContext.mockResolvedValue({ tenant: { id: TENANT_A } })
    const { GET } = await import("@/app/api/factures/[id]/pdf/route")
    const res = await GET({} as never, { params: Promise.resolve({ id: "5" }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
    expect(renderInvoicePdfSafe).toHaveBeenCalledWith(expect.objectContaining({ companyId: TENANT_A }))
  })

  it("non connecté : 401", async () => {
    getCompanyMemberContext.mockResolvedValue(null)
    const { GET } = await import("@/app/api/factures/[id]/pdf/route")
    const res = await GET({} as never, { params: Promise.resolve({ id: "5" }) })
    expect(res.status).toBe(401)
  })
})

describe("L87 — page facture", () => {
  const props = (id: string) => ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({ tenant: "autre-slug" }),
  })

  it("le tenant B : 404 et le message n'est jamais calculé", async () => {
    requireCompanyMember.mockResolvedValue({ tenant: { id: TENANT_B } })
    const { default: Page } = await import("@/app/admin/(dashboard)/factures/[id]/page")
    await expect(Page(props("5"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(getInvoiceDetail).toHaveBeenCalledWith(5, TENANT_B)
    expect(buildFacturXNotice).not.toHaveBeenCalled()
  })

  it("le tenant A : message calculé avec le companyId du membre (jamais de l'URL)", async () => {
    requireCompanyMember.mockResolvedValue({ tenant: { id: TENANT_A } })
    const { default: Page } = await import("@/app/admin/(dashboard)/factures/[id]/page")
    await Page(props("5"))
    expect(getInvoiceDetail).toHaveBeenCalledWith(5, TENANT_A)
    expect(buildFacturXNotice).toHaveBeenCalledWith(expect.objectContaining({ companyId: TENANT_A }))
  })
})
