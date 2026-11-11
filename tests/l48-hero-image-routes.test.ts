import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * L48 — photo de bannière :
 *  - POST /api/admin/hero-image : jeton privé sous le préfixe DU tenant connecté.
 *  - GET /api/hero-image : ne sert que la valeur enregistrée de CETTE entreprise.
 */

const getCompanyMemberContext = vi.fn()
let tokenOptions: unknown = null
// Résultats successifs des requêtes db (1re : companies, 2e : public_page_config).
let rows: unknown[][] = []
const blobGet = vi.fn()

vi.mock("@/lib/admin", () => ({
  getCompanyMemberContext: () => getCompanyMemberContext(),
  requireCompanyMember: vi.fn(),
}))
vi.mock("@vercel/blob/client", () => ({
  handleUpload: async ({ body, onBeforeGenerateToken }: { body: { pathname: string }; onBeforeGenerateToken: (p: string) => Promise<unknown> }) => {
    tokenOptions = await onBeforeGenerateToken(body.pathname)
    return { type: "blob.generate-client-token", clientToken: "t" }
  },
}))
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => blobGet(...a) }))
vi.mock("@/lib/db/schema", () => ({
  companies: { id: "id", slug: "slug", status: "status" },
  publicPageConfig: { companyId: "companyId", heroImageUrl: "heroImageUrl" },
}))
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }) }))
vi.mock("@/lib/db", () => {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "from", "where", "limit"]) c[m] = () => c
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(rows.shift() ?? []).then(res)
  return { db: c }
})

import { POST } from "@/app/api/admin/hero-image/route"
import { GET } from "@/app/api/hero-image/route"

const A_PATH = "hero-image/company-7-hero-1700000000-abc.jpg"

function member(id: number, customSiteKey: string | null = null) {
  getCompanyMemberContext.mockResolvedValue({ user: { id: "u" }, tenant: { id, slug: `t${id}`, customSiteKey }, role: "OWNER" })
}
const post = (pathname: string) =>
  POST(
    new NextRequest("https://www.detailflow.fr/api/admin/hero-image", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname }, pathname }),
    }),
  )
const getImg = (qs: string) => GET(new NextRequest(`https://www.detailflow.fr/api/hero-image?${qs}`))
const qs = (slug: string, p: string) => `company=${slug}&p=${encodeURIComponent(p)}`

beforeEach(() => {
  tokenOptions = null
  rows = []
  getCompanyMemberContext.mockReset()
  blobGet.mockReset()
  member(7)
})

describe("POST jeton d'envoi", () => {
  it("membre A sous son préfixe → jeton privé, JPG/PNG/WEBP, 6 Mo", async () => {
    expect((await post(A_PATH)).status).toBe(200)
    expect(tokenOptions).toEqual({
      access: "private",
      addRandomSuffix: true,
      allowedContentTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
      maximumSizeInBytes: 6 * 1024 * 1024,
    })
  })

  it("non connecté → 401, aucun jeton", async () => {
    getCompanyMemberContext.mockResolvedValue(null)
    expect((await post(A_PATH)).status).toBe(401)
    expect(tokenOptions).toBeNull()
  })

  it("site personnalisé → refus, aucun jeton", async () => {
    member(7, "spirit-acs")
    expect((await post(A_PATH)).status).toBe(403)
    expect(tokenOptions).toBeNull()
  })

  it.each([
    ["tenant B avec le préfixe de A", 77, A_PATH],
    ["company-7 contre company-77", 7, "hero-image/company-77-hero-1.jpg"],
    ["autre type d'image", 7, "service-image/company-7-x.jpg"],
    ["remontée de chemin", 7, "hero-image/company-7-../company-8-x.jpg"],
  ])("%s → 400, aucun jeton", async (_l, id, p) => {
    member(id)
    expect((await post(p)).status).toBe(400)
    expect(tokenOptions).toBeNull()
  })
})

describe("GET photo publique", () => {
  const okBlob = () => ({
    statusCode: 200,
    stream: new ReadableStream({ start: (c) => (c.enqueue(new Uint8Array([1])), c.close()) }),
    blob: { etag: '"e"', contentType: "image/jpeg" },
  })

  it("A + valeur enregistrée → 200, stream du Blob privé", async () => {
    rows = [[{ id: 7, status: "ACTIVE" }], [{ heroImageUrl: A_PATH }]]
    blobGet.mockResolvedValue(okBlob())
    const res = await getImg(qs("a", A_PATH))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    expect(blobGet).toHaveBeenCalledWith(A_PATH, expect.objectContaining({ access: "private" }))
  })

  it("company=B & p=<pathname de A> → 404 sans lecture du Blob", async () => {
    rows = [[{ id: 8, status: "ACTIVE" }], [{ heroImageUrl: A_PATH }]]
    expect((await getImg(qs("b", A_PATH))).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it("pathname sous le préfixe de A mais différent de la valeur enregistrée → 404", async () => {
    rows = [[{ id: 7, status: "ACTIVE" }], [{ heroImageUrl: "hero-image/company-7-autre.jpg" }]]
    expect((await getImg(qs("a", A_PATH))).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it("aucune config → 404", async () => {
    rows = [[{ id: 7, status: "ACTIVE" }], []]
    expect((await getImg(qs("a", A_PATH))).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it.each([
    ["slug inconnu", []],
    ["entreprise archivée", [{ id: 7, status: "ARCHIVED" }]],
  ])("%s → 404", async (_l, company) => {
    rows = [company, [{ heroImageUrl: A_PATH }]]
    expect((await getImg(qs("a", A_PATH))).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it("paramètre manquant → 400", async () => {
    expect((await getImg("company=a")).status).toBe(400)
    expect((await getImg(`p=${A_PATH}`)).status).toBe(400)
  })
})
