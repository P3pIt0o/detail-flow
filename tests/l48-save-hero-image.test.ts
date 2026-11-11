import { beforeEach, describe, expect, it, vi } from "vitest"

/** L48 — saveHeroImage : écrit la seule colonne heroImageUrl du tenant courant, supprime l'ancien Blob borné au tenant. */

const requireCompanyMember = vi.fn()
const getPublicPageConfigRow = vi.fn()
const upsertPublicPageConfig = vi.fn(async () => ({}))
const del = vi.fn(async () => {})

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => del(...(a as [])) }))
vi.mock("@/lib/admin", () => ({ requireCompanyMember: () => requireCompanyMember() }))
vi.mock("@/lib/public-page/config", () => ({
  getPublicPageConfigRow: (...a: unknown[]) => getPublicPageConfigRow(...a),
  upsertPublicPageConfig: (...a: unknown[]) => upsertPublicPageConfig(...(a as [])),
  publishPublicPageConfig: vi.fn(),
}))

import { saveHeroImage, savePublicPageConfig } from "@/app/admin/page-publique/actions"

const NEW = "hero-image/company-7-new.jpg"
const OLD = "hero-image/company-7-old.jpg"

function tenant(customSiteKey: string | null = null) {
  requireCompanyMember.mockResolvedValue({ tenant: { id: 7, slug: "a", customSiteKey } })
}
const oldValue = (v: string | null) => getPublicPageConfigRow.mockResolvedValue(v === null ? null : { heroImageUrl: v })

beforeEach(() => {
  requireCompanyMember.mockReset()
  getPublicPageConfigRow.mockReset()
  upsertPublicPageConfig.mockClear()
  del.mockClear()
  tenant()
  oldValue(OLD)
})

describe("saveHeroImage", () => {
  it("remplacement → écrit pour le tenant 7 puis supprime l'ancien", async () => {
    expect(await saveHeroImage(NEW)).toEqual({ ok: true })
    expect(upsertPublicPageConfig).toHaveBeenCalledWith(7, { heroImageUrl: NEW })
    expect(getPublicPageConfigRow).toHaveBeenCalledWith(7)
    expect(del).toHaveBeenCalledWith(OLD)
  })

  it("retrait → null enregistré et ancien supprimé", async () => {
    expect(await saveHeroImage(null)).toEqual({ ok: true })
    expect(upsertPublicPageConfig).toHaveBeenCalledWith(7, { heroImageUrl: null })
    expect(del).toHaveBeenCalledWith(OLD)
  })

  it.each([
    ["https://cdn.exemple.fr/h.jpg"],
    ["/tenants/x/h.jpg"],
    ["hero-image/company-77-old.jpg"], // préfixe d'un autre tenant
    [NEW], // même valeur
  ])("ancienne valeur %s → aucun del", async (old) => {
    oldValue(old)
    expect(await saveHeroImage(NEW)).toEqual({ ok: true })
    expect(del).not.toHaveBeenCalled()
  })

  it("échec du del → l'enregistrement reste ok", async () => {
    del.mockRejectedValueOnce(new Error("blob"))
    expect(await saveHeroImage(NEW)).toEqual({ ok: true })
  })

  it("pathname d'un autre tenant → refus sans écriture", async () => {
    const res = await saveHeroImage("hero-image/company-8-x.jpg")
    expect(res.ok).toBe(false)
    expect(upsertPublicPageConfig).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("site personnalisé → refus sans écriture", async () => {
    tenant("spirit-acs")
    expect((await saveHeroImage(NEW)).ok).toBe(false)
    expect(upsertPublicPageConfig).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })
})

describe("savePublicPageConfig", () => {
  it("ne touche plus heroImageUrl (clé absente = inchangée)", async () => {
    const fd = new FormData()
    fd.set("heroImageUrl", "https://cdn.exemple.fr/h.jpg")
    expect(await savePublicPageConfig(fd)).toEqual({ ok: true })
    const input = (upsertPublicPageConfig.mock.calls[0] as unknown as [number, Record<string, unknown>])[1]
    expect("heroImageUrl" in input).toBe(false)
  })
})
