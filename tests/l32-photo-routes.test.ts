import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * L32 — routes des photos de prestations Spirit :
 *  - POST /api/admin/spirit-service-photo-upload : jeton d'envoi réservé à
 *    OWNER/ADMIN de Spirit, chemin imposé, JPG/PNG/WebP, 8 Mo.
 *  - GET /api/spirit-service-photo : ne sert QUE le WebP optimisé de cette
 *    entreprise et de cette clé, cache long.
 */

const getCompanyMemberContext = vi.fn()
const canUseFeature = vi.fn(async () => true)
let tokenOptions: unknown = null
let company: Record<string, unknown> | undefined
const blobGet = vi.fn()

vi.mock("@/lib/admin", () => ({
  getCompanyMemberContext: () => getCompanyMemberContext(),
  requireCompanyMember: vi.fn(),
}))
vi.mock("@/lib/licensing/enforce", () => ({
  canUseFeature: (...a: unknown[]) => canUseFeature(...(a as [])),
  FEATURE_LOCKED_MESSAGE: "Fonctionnalité indisponible.",
}))
vi.mock("@vercel/blob/client", () => ({
  handleUpload: async ({ body, onBeforeGenerateToken }: { body: { pathname: string }; onBeforeGenerateToken: (p: string) => Promise<unknown> }) => {
    tokenOptions = await onBeforeGenerateToken(body.pathname)
    return { type: "blob.generate-client-token", clientToken: "t" }
  },
}))
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => blobGet(...a) }))
vi.mock("@/lib/db/schema", () => ({
  companies: { id: "id", slug: "slug", status: "status", customSiteKey: "customSiteKey", siteContent: "siteContent" },
}))
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }) }))
vi.mock("@/lib/db", () => {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "from", "where", "limit"]) c[m] = () => c
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(company ? [company] : []).then(res)
  return { db: c }
})

import { POST } from "@/app/api/admin/spirit-service-photo-upload/route"
import { GET } from "@/app/api/spirit-service-photo/route"

const OK_UPLOAD = "spirit-service-photo-upload/company-42-moto-1700000000.jpg"
const STORED = "spirit-service-photo/company-42-moto-0123456789abcdef0123456789abcdef.webp"

function member(opts: { role?: string; customSiteKey?: string | null; isSuperAdmin?: boolean } = {}) {
  getCompanyMemberContext.mockResolvedValue({
    user: { id: "u" },
    tenant: { id: 42, slug: "spirit-acs", customSiteKey: "customSiteKey" in opts ? opts.customSiteKey : "spirit-acs" },
    role: opts.role ?? "OWNER",
    isSuperAdmin: opts.isSuperAdmin ?? false,
  })
}
const post = (pathname: string) =>
  POST(
    new NextRequest("https://www.detailflow.fr/api/admin/spirit-service-photo-upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname }, pathname }),
    }),
  )
const getPhoto = (qs: string, headers?: Record<string, string>) =>
  GET(new NextRequest(`https://www.detailflow.fr/api/spirit-service-photo?${qs}`, { headers }))

beforeEach(() => {
  tokenOptions = null
  getCompanyMemberContext.mockReset()
  canUseFeature.mockReset()
  canUseFeature.mockResolvedValue(true)
  blobGet.mockReset()
  company = { id: 42, status: "ACTIVE", customSiteKey: "spirit-acs", siteContent: { spiritAcs: { servicePhotos: { moto: STORED } } } }
  member()
})

describe("POST jeton d'envoi", () => {
  it("non connecté → 401", async () => {
    getCompanyMemberContext.mockResolvedValue(null)
    expect((await post(OK_UPLOAD)).status).toBe(401)
    expect(tokenOptions).toBeNull()
  })

  it.each([
    ["membre simple", { role: "MEMBER" }],
    ["autre tenant", { customSiteKey: null }],
    ["autre site sur mesure", { customSiteKey: "rozan" }],
  ])("%s → 403, aucun jeton", async (_l, opts) => {
    member(opts)
    expect((await post(OK_UPLOAD)).status).toBe(403)
    expect(tokenOptions).toBeNull()
  })

  it("licence sans site web → 403", async () => {
    canUseFeature.mockResolvedValue(false)
    expect((await post(OK_UPLOAD)).status).toBe(403)
  })

  it("OWNER Spirit : jeton privé, JPG/PNG/WebP, 8 Mo", async () => {
    expect((await post(OK_UPLOAD)).status).toBe(200)
    expect(tokenOptions).toEqual({
      access: "private",
      addRandomSuffix: true,
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      maximumSizeInBytes: 8 * 1024 * 1024,
    })
  })

  it.each([
    "spirit-service-photo-upload/company-99-moto-1.jpg",
    "spirit-service-photo-upload/company-42-inconnue-1.jpg",
    "spirit-service-photo/company-42-moto-1.webp",
    "photo-gallery/company-42-1.jpg",
  ])("chemin refusé : %s", async (p) => {
    const res = await post(p)
    expect(res.status).toBe(400)
    expect(tokenOptions).toBeNull()
  })
})

describe("GET photo publique", () => {
  const okBlob = () => ({
    statusCode: 200,
    stream: new ReadableStream({ start: (c) => (c.enqueue(new Uint8Array([1, 2])), c.close()) }),
    blob: { etag: '"e1"', contentType: "image/webp" },
  })

  it("WebP optimisé de cette entreprise → servi, cache long", async () => {
    blobGet.mockResolvedValue(okBlob())
    const res = await getPhoto("company=spirit-acs&k=moto&v=abc")
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("content-type")).toBe("image/webp")
    expect(blobGet).toHaveBeenCalledWith(STORED, expect.objectContaining({ access: "private" }))
  })

  it("ETag identique → 304", async () => {
    blobGet.mockResolvedValue({ statusCode: 304, blob: { etag: '"e1"' } })
    const res = await getPhoto("company=spirit-acs&k=moto&v=abc", { "if-none-match": '"e1"' })
    expect(res.status).toBe(304)
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
  })

  it.each([
    ["clé inconnue", "company=spirit-acs&k=inconnue"],
    ["clé sans photo", "company=spirit-acs&k=nettoyage"],
    ["paramètres manquants", "k=moto"],
  ])("%s → 404, aucun Blob lu", async (_l, qs) => {
    expect((await getPhoto(qs)).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it.each([
    ["entreprise inconnue", undefined],
    ["entreprise archivée", { id: 42, status: "ARCHIVED", customSiteKey: "spirit-acs", siteContent: { spiritAcs: { servicePhotos: { moto: STORED } } } }],
    ["entreprise non Spirit", { id: 42, status: "ACTIVE", customSiteKey: null, siteContent: { spiritAcs: { servicePhotos: { moto: STORED } } } }],
    // Valeur en base pointant vers le fichier d'un AUTRE tenant : jamais servie.
    ["photo d'un autre tenant", { id: 42, status: "ACTIVE", customSiteKey: "spirit-acs", siteContent: { spiritAcs: { servicePhotos: { moto: STORED.replace("company-42", "company-99") } } } }],
    // Fichier brut (non optimisé) : jamais servi.
    ["fichier brut", { id: 42, status: "ACTIVE", customSiteKey: "spirit-acs", siteContent: { spiritAcs: { servicePhotos: { moto: "spirit-service-photo-upload/company-42-moto-1.jpg" } } } }],
  ])("%s → 404", async (_l, row) => {
    company = row
    expect((await getPhoto("company=spirit-acs&k=moto")).status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })
})
