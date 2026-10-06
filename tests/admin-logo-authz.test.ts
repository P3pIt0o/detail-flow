import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * /api/admin/logo + saveInvoicingSettings : un logo n'est servi / enregistré
 * que s'il appartient au tenant du membre (logo déjà enregistré ou namespace
 * invoice-logo/{companyId}/). Jamais de Blob privé arbitraire.
 */

const TENANT_A = 101
const TENANT_B = 202
const LEGACY_LOGO_A = "invoice-logo/logo-1700000000000-AbCdEf.png"
const NEW_LOGO_A = `invoice-logo/${TENANT_A}/logo-1800000000000-XyZ123.png`
const LOGO_B = `invoice-logo/${TENANT_B}/logo-1800000000000-QwErTy.png`
const LEGACY_LOGO_B = "invoice-logo/logo-1600000000000-BbBbBb.png"
const QUOTE_PHOTO_B = `quote-photos/${TENANT_B}/photo-secret.jpg`

const state = vi.hoisted(() => ({
  member: null as null | { tenantId: number } | "unauthenticated" | "not-member",
  storedLogo: {} as Record<number, string | null>,
  selectWheres: [] as unknown[],
  updates: [] as { set: Record<string, unknown>; where: unknown }[],
  inserts: [] as unknown[],
}))

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>()
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }),
    and: (...parts: unknown[]) => ({ op: "and", parts }),
  }
})

const blob = vi.hoisted(() => ({
  get: vi.fn(async (pathname: string) => ({
    stream: new ReadableStream(),
    blob: { contentType: "image/png", etag: `etag-${pathname}` },
  })),
  put: vi.fn(async (pathname: string) => ({ pathname: pathname.replace(/\.png$/, "-RND.png") })),
}))
vi.mock("@vercel/blob", () => blob)

function memberContext() {
  if (state.member === null || state.member === "unauthenticated" || state.member === "not-member") return null
  return {
    user: { id: "u", email: "a@a.fr", name: "A" },
    tenant: { id: state.member.tenantId },
    role: "OWNER",
    isSuperAdmin: false,
  }
}

vi.mock("@/lib/admin", () => ({
  getCompanyMemberContext: vi.fn(async () => memberContext()),
  requireCompanyMember: vi.fn(async () => {
    if (state.member === "unauthenticated") throw new Error("NEXT_REDIRECT:/admin/login")
    const ctx = memberContext()
    if (!ctx) throw new Error("NEXT_NOT_FOUND")
    return ctx
  }),
}))

vi.mock("@/lib/db", () => {
  const query = () => {
    let companyId: number | null = null
    const q: Record<string, unknown> = {}
    q.from = () => q
    q.where = (w: { op: string; col: string; val: number }) => {
      state.selectWheres.push(w)
      if (w?.op === "eq" && w.col === "companyId") companyId = w.val
      return q
    }
    q.limit = () => q
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      const rows =
        companyId !== null && companyId in state.storedLogo
          ? [{ id: 1, invoiceLogoPathname: state.storedLogo[companyId] }]
          : []
      return Promise.resolve(rows).then(res, rej)
    }
    return q
  }
  return {
    db: {
      select: vi.fn(() => query()),
      insert: vi.fn(() => ({ values: vi.fn(async (v: unknown) => void state.inserts.push(v)) })),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => ({
          where: async (where: unknown) => void state.updates.push({ set, where }),
        }),
      })),
    },
  }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/booking/travel", () => ({ geocodeAddress: vi.fn(async () => null) }))

import { GET, POST } from "@/app/api/admin/logo/route"
import { saveInvoicingSettings } from "@/app/admin/(dashboard)/parametres/actions"
import { isAllowedTenantLogoPathname, safeLogoExtension } from "@/lib/admin/logo-policy"

function getRequest(pathname: string) {
  return new NextRequest(`https://www.detailflow.fr/api/admin/logo?pathname=${encodeURIComponent(pathname)}`)
}

function invoicingInput(invoiceLogoPathname: string | null) {
  return {
    invoiceCompanyAddress: "1 rue A",
    invoiceSiret: "",
    invoiceIban: "",
    invoiceBic: "",
    vatEnabled: false,
    vatRate: "0",
    vatExemptNote: "",
    invoicePrefix: "fac",
    invoiceDueDays: 30,
    invoiceFooterNote: "",
    invoiceLegalMentions: "",
    invoiceEmailSubject: "",
    invoiceEmailBody: "",
    invoiceLogoPathname,
  }
}

beforeEach(() => {
  state.member = null
  state.storedLogo = { [TENANT_A]: LEGACY_LOGO_A, [TENANT_B]: LEGACY_LOGO_B }
  state.selectWheres = []
  state.updates = []
  state.inserts = []
  blob.get.mockClear()
  blob.put.mockClear()
})

describe("logo-policy", () => {
  it("accepte le logo déjà enregistré (legacy) et le namespace du tenant", () => {
    expect(isAllowedTenantLogoPathname(LEGACY_LOGO_A, TENANT_A, LEGACY_LOGO_A)).toBe(true)
    expect(isAllowedTenantLogoPathname(NEW_LOGO_A, TENANT_A, LEGACY_LOGO_A)).toBe(true)
  })

  it("refuse les logos d'un autre tenant et les Blobs arbitraires", () => {
    expect(isAllowedTenantLogoPathname(LOGO_B, TENANT_A, LEGACY_LOGO_A)).toBe(false)
    expect(isAllowedTenantLogoPathname(LEGACY_LOGO_B, TENANT_A, LEGACY_LOGO_A)).toBe(false)
    expect(isAllowedTenantLogoPathname(QUOTE_PHOTO_B, TENANT_A, LEGACY_LOGO_A)).toBe(false)
    expect(isAllowedTenantLogoPathname(`invoice-logo/${TENANT_A}0/x.png`, TENANT_A, null)).toBe(false)
    expect(isAllowedTenantLogoPathname(`invoice-logo/${TENANT_A}/../${TENANT_B}/x.png`, TENANT_A, null)).toBe(false)
    expect(isAllowedTenantLogoPathname(`invoice-logo/${TENANT_A}/sub/x.png`, TENANT_A, null)).toBe(false)
    expect(isAllowedTenantLogoPathname(`invoice-logo/${TENANT_A}/`, TENANT_A, null)).toBe(false)
    expect(isAllowedTenantLogoPathname("", TENANT_A, null)).toBe(false)
    expect(isAllowedTenantLogoPathname(null, TENANT_A, LEGACY_LOGO_A)).toBe(false)
  })

  it("extension assainie", () => {
    expect(safeLogoExtension("logo.PNG")).toBe("png")
    expect(safeLogoExtension("x.p/../ng")).toBe("ng")
    expect(safeLogoExtension("sans-extension")).toBe("png")
  })
})

describe("GET /api/admin/logo", () => {
  it("non connecté : 401, aucun accès Blob", async () => {
    state.member = "unauthenticated"
    const res = await GET(getRequest(LEGACY_LOGO_A))
    expect(res.status).toBe(401)
    expect(blob.get).not.toHaveBeenCalled()
  })

  it("non membre du tenant courant : 401, aucun accès Blob", async () => {
    state.member = "not-member"
    const res = await GET(getRequest(LOGO_B))
    expect(res.status).toBe(401)
    expect(blob.get).not.toHaveBeenCalled()
  })

  it("membre A + ancien logo légitime de A : servi", async () => {
    state.member = { tenantId: TENANT_A }
    const res = await GET(getRequest(LEGACY_LOGO_A))
    expect(res.status).toBe(200)
    expect(blob.get).toHaveBeenCalledWith(LEGACY_LOGO_A, { access: "private" })
  })

  it("membre A + nouveau logo dans le namespace de A : servi", async () => {
    state.member = { tenantId: TENANT_A }
    const res = await GET(getRequest(NEW_LOGO_A))
    expect(res.status).toBe(200)
    expect(blob.get).toHaveBeenCalledWith(NEW_LOGO_A, { access: "private" })
  })

  it.each([LOGO_B, LEGACY_LOGO_B, QUOTE_PHOTO_B, "private/anything.pdf"])(
    "membre A + pathname non autorisé %s : 404 neutre AVANT tout appel Blob",
    async (pathname) => {
      state.member = { tenantId: TENANT_A }
      const res = await GET(getRequest(pathname))
      expect(res.status).toBe(404)
      expect(blob.get).not.toHaveBeenCalled()
    },
  )

  it("la lecture des settings est scopée au tenant du membre", async () => {
    state.member = { tenantId: TENANT_A }
    await GET(getRequest(LEGACY_LOGO_B))
    expect(state.selectWheres).toEqual([{ op: "eq", col: "companyId", val: TENANT_A }])
  })
})

describe("POST /api/admin/logo", () => {
  function upload(type = "image/png", size = 100) {
    const fd = new FormData()
    fd.set("file", new File([new Uint8Array(size)], "logo.png", { type }))
    return new NextRequest("https://www.detailflow.fr/api/admin/logo", { method: "POST", body: fd })
  }

  it("non connecté / non membre : 401, aucun upload", async () => {
    state.member = "unauthenticated"
    expect((await POST(upload())).status).toBe(401)
    state.member = "not-member"
    expect((await POST(upload())).status).toBe(401)
    expect(blob.put).not.toHaveBeenCalled()
  })

  it("membre A : upload dans invoice-logo/{A}/ avec suffixe aléatoire", async () => {
    state.member = { tenantId: TENANT_A }
    const res = await POST(upload())
    expect(res.status).toBe(200)
    const [pathname, , options] = blob.put.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>]
    expect(pathname.startsWith(`invoice-logo/${TENANT_A}/logo-`)).toBe(true)
    expect(options).toMatchObject({ access: "private", addRandomSuffix: true })
    const body = (await res.json()) as { pathname: string }
    expect(isAllowedTenantLogoPathname(body.pathname, TENANT_A, null)).toBe(true)
  })

  it("type et taille inchangés : image uniquement, max 2 Mo", async () => {
    state.member = { tenantId: TENANT_A }
    expect((await POST(upload("application/pdf"))).status).toBe(400)
    expect((await POST(upload("image/png", 2 * 1024 * 1024 + 1))).status).toBe(400)
    expect(blob.put).not.toHaveBeenCalled()
  })
})

describe("saveInvoicingSettings — invoiceLogoPathname", () => {
  it("non connecté : refus, aucune écriture", async () => {
    state.member = "unauthenticated"
    await expect(saveInvoicingSettings(invoicingInput(NEW_LOGO_A))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(state.updates).toHaveLength(0)
  })

  it.each([LOGO_B, LEGACY_LOGO_B, QUOTE_PHOTO_B])(
    "membre A + pathname %s : refus sans modifier les settings (A et B inchangés)",
    async (pathname) => {
      state.member = { tenantId: TENANT_A }
      const r = await saveInvoicingSettings(invoicingInput(pathname))
      expect(r.ok).toBe(false)
      expect(state.updates).toHaveLength(0)
      expect(state.inserts).toHaveLength(0)
      expect(state.storedLogo[TENANT_B]).toBe(LEGACY_LOGO_B)
    },
  )

  it("membre A + ancien logo légitime déjà enregistré : accepté", async () => {
    state.member = { tenantId: TENANT_A }
    const r = await saveInvoicingSettings(invoicingInput(LEGACY_LOGO_A))
    expect(r.ok).toBe(true)
    expect(state.updates[0].set.invoiceLogoPathname).toBe(LEGACY_LOGO_A)
    expect(state.updates[0].where).toEqual({ op: "eq", col: "companyId", val: TENANT_A })
  })

  it("membre A + nouveau logo dans son namespace : accepté", async () => {
    state.member = { tenantId: TENANT_A }
    const r = await saveInvoicingSettings(invoicingInput(NEW_LOGO_A))
    expect(r.ok).toBe(true)
    expect(state.updates[0].set.invoiceLogoPathname).toBe(NEW_LOGO_A)
  })

  it("membre A + suppression du logo (null / vide) : accepté", async () => {
    state.member = { tenantId: TENANT_A }
    expect((await saveInvoicingSettings(invoicingInput(null))).ok).toBe(true)
    expect((await saveInvoicingSettings(invoicingInput(""))).ok).toBe(true)
    expect(state.updates.map((u) => u.set.invoiceLogoPathname)).toEqual([null, null])
  })
})
