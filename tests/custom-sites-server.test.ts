import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Lot 1 — Adaptateur serveur des sites personnalisés (`lib/custom-sites/server`).
 *
 * On vérifie le DISPATCH sûr et l'isolation tenant :
 *   - clé null            => site standard (null), aucune régression
 *   - clé enregistrée     => définition renvoyée (registre mocké)
 *   - clé inconnue        => repli sur site standard + journalisation sobre
 *   - le tenant provient TOUJOURS de getCurrentTenant (serveur), jamais du client
 *
 * Toutes les dépendances DB / loaders publics sont mockées : aucun accès réseau.
 */

const getCurrentTenant = vi.fn()
const getCustomSiteDefinition = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/tenant", () => ({
  getCurrentTenant: () => getCurrentTenant(),
}))
vi.mock("@/lib/custom-sites/registry", () => ({
  getCustomSiteDefinition: (k: string | null | undefined) => getCustomSiteDefinition(k),
}))
vi.mock("@/lib/public-contact", () => ({ getPublicContact: vi.fn(), getPublicHours: vi.fn() }))
vi.mock("@/lib/catalog-queries", () => ({ getPublicServices: vi.fn(), getPublicReviews: vi.fn() }))
vi.mock("@/lib/public-gallery", () => ({ getPublicGallery: vi.fn() }))
vi.mock("@/lib/site-content", () => ({
  getPublicSiteContent: vi.fn(),
  getPublicCustomRequestsConfig: vi.fn(),
}))

import { resolveCustomSite, getCustomSitePublicData } from "@/lib/custom-sites/server"

const fakeDef = { key: "spirit-acs", name: "Spirit ACS", ownShell: true, Page: () => null }

beforeEach(() => {
  getCurrentTenant.mockReset()
  getCustomSiteDefinition.mockReset()
})

describe("resolveCustomSite — dispatch sûr", () => {
  it("customSiteKey null => site standard (null), sans consulter le registre", async () => {
    getCurrentTenant.mockResolvedValue({ id: 1, slug: "std-co", customSiteKey: null })
    await expect(resolveCustomSite()).resolves.toBeNull()
    expect(getCustomSiteDefinition).not.toHaveBeenCalled()
  })

  it("clé enregistrée => renvoie la définition du site personnalisé", async () => {
    getCurrentTenant.mockResolvedValue({ id: 2, slug: "spirit", customSiteKey: "spirit-acs" })
    getCustomSiteDefinition.mockReturnValue(fakeDef)
    await expect(resolveCustomSite()).resolves.toBe(fakeDef)
    expect(getCustomSiteDefinition).toHaveBeenCalledWith("spirit-acs")
  })

  it("clé inconnue => repli sur le site standard (null) + journalisation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    getCurrentTenant.mockResolvedValue({ id: 3, slug: "x-co", customSiteKey: "inconnue" })
    getCustomSiteDefinition.mockReturnValue(null)
    await expect(resolveCustomSite()).resolves.toBeNull()
    expect(logSpy).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it("hors contexte tenant (vitrine racine) => null", async () => {
    getCurrentTenant.mockResolvedValue(null)
    await expect(resolveCustomSite()).resolves.toBeNull()
  })
})

describe("getCustomSitePublicData — isolation tenant", () => {
  it("null hors contexte tenant", async () => {
    getCurrentTenant.mockResolvedValue(null)
    await expect(getCustomSitePublicData()).resolves.toBeNull()
  })

  it("compose une identité tenant sûre depuis getCurrentTenant (jamais un companyId client)", async () => {
    getCurrentTenant.mockResolvedValue({
      id: 5,
      slug: "spirit",
      name: "Spirit ACS",
      logoUrl: null,
      brandPrimary: null,
      brandSecondary: null,
      customSiteKey: "spirit-acs",
    })
    const data = await getCustomSitePublicData()
    expect(data?.tenant).toEqual({
      id: 5,
      slug: "spirit",
      name: "Spirit ACS",
      logoUrl: null,
      brandPrimary: null,
      brandSecondary: null,
    })
    // Le contrat n'expose que des loaders (aucun accès direct DB / companyId client).
    expect(typeof data?.getServices).toBe("function")
    expect(typeof data?.getContact).toBe("function")
  })
})
