import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Étape 2B — correctif Lot 1 : garde du SITE VITRINE (feature `website`).
 *
 * Tests du composant serveur `requireWebsiteFeature()` avec dépendances mockées
 * (aucune écriture DB, aucun accès réseau). On vérifie précisément le
 * branchement (ordre des dérogations) :
 *   - domaine racine / hors tenant        => autorisé (jamais 404)
 *   - LEGACY (hasFeature renvoie true)     => autorisé
 *   - licence explicite AVEC website       => autorisé
 *   - SANS website mais APERÇU (membre/SA) => autorisé (brouillon prévisualisable)
 *   - SANS website mais page PUBLIÉE       => autorisé (Cas B self-service)
 *   - SANS website, pas d'aperçu, brouillon => notFound() (404 public)
 *
 * `notFound()` de Next lève une erreur : on la simule par un sentinel pour
 * distinguer « rendu autorisé » de « 404 déclenchée ».
 */

const NOT_FOUND = new Error("NEXT_NOT_FOUND")

const getCurrentTenant = vi.fn()
const hasFeature = vi.fn()
const isCurrentTenantPreviewer = vi.fn()
const isPublicPagePublished = vi.fn()

vi.mock("@/lib/tenant", () => ({
  getCurrentTenant: () => getCurrentTenant(),
  isCurrentTenantPreviewer: (id: number) => isCurrentTenantPreviewer(id),
}))
vi.mock("@/lib/licensing/server", () => ({
  hasFeature: (companyId: number, key: string) => hasFeature(companyId, key),
}))
vi.mock("@/lib/public-page/config", () => ({
  isPublicPagePublished: (id: number) => isPublicPagePublished(id),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND
  },
}))
vi.mock("server-only", () => ({}))

import { requireWebsiteFeature } from "@/lib/licensing/website-guard"

beforeEach(() => {
  getCurrentTenant.mockReset()
  hasFeature.mockReset()
  isCurrentTenantPreviewer.mockReset()
  isPublicPagePublished.mockReset()
  // Par défaut : ni aperçu, ni publié → seules les dérogations testées passent.
  isCurrentTenantPreviewer.mockResolvedValue(false)
  isPublicPagePublished.mockResolvedValue(false)
})

describe("requireWebsiteFeature — vitrine racine / hors tenant", () => {
  it("autorise quand aucun tenant (detailflow.fr) sans appeler hasFeature", async () => {
    getCurrentTenant.mockResolvedValue(null)
    await expect(requireWebsiteFeature()).resolves.toBeUndefined()
    expect(hasFeature).not.toHaveBeenCalled()
  })
})

describe("requireWebsiteFeature — LEGACY (licensePlan = NULL)", () => {
  it("autorise : hasFeature renvoie true pour un tenant legacy", async () => {
    getCurrentTenant.mockResolvedValue({ id: 42, slug: "legacy-co" })
    hasFeature.mockResolvedValue(true) // comportement LEGACY du moteur central
    await expect(requireWebsiteFeature()).resolves.toBeUndefined()
    expect(hasFeature).toHaveBeenCalledWith(42, "website")
  })
})

describe("requireWebsiteFeature — licence explicite", () => {
  it("PRO avec website => autorisé", async () => {
    getCurrentTenant.mockResolvedValue({ id: 7, slug: "pro-co" })
    hasFeature.mockResolvedValue(true)
    await expect(requireWebsiteFeature()).resolves.toBeUndefined()
  })

  it("ESSENTIAL sans website, sans aperçu, non publié => notFound() (404 public)", async () => {
    getCurrentTenant.mockResolvedValue({ id: 9, slug: "essential-co" })
    hasFeature.mockResolvedValue(false)
    await expect(requireWebsiteFeature()).rejects.toBe(NOT_FOUND)
    expect(hasFeature).toHaveBeenCalledWith(9, "website")
  })
})

describe("requireWebsiteFeature — dérogations self-service (Cas B)", () => {
  it("FREE sans website mais APERÇU membre/super-admin => autorisé (brouillon)", async () => {
    getCurrentTenant.mockResolvedValue({ id: 11, slug: "free-co" })
    hasFeature.mockResolvedValue(false)
    isCurrentTenantPreviewer.mockResolvedValue(true)
    await expect(requireWebsiteFeature()).resolves.toBeUndefined()
    // La publication n'est même pas consultée : l'aperçu prime.
    expect(isPublicPagePublished).not.toHaveBeenCalled()
  })

  it("FREE sans website, sans aperçu, mais page PUBLIÉE => autorisé (public)", async () => {
    getCurrentTenant.mockResolvedValue({ id: 12, slug: "free-published" })
    hasFeature.mockResolvedValue(false)
    isCurrentTenantPreviewer.mockResolvedValue(false)
    isPublicPagePublished.mockResolvedValue(true)
    await expect(requireWebsiteFeature()).resolves.toBeUndefined()
    expect(isPublicPagePublished).toHaveBeenCalledWith(12)
  })
})
