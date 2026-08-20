import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Étape 2B — correctif Lot 1 : garde du SITE VITRINE (feature `website`).
 *
 * Tests du composant serveur `requireWebsiteFeature()` avec dépendances mockées
 * (aucune écriture DB, aucun accès réseau). On vérifie précisément le
 * branchement :
 *   - domaine racine / hors tenant  => autorisé (jamais 404)
 *   - LEGACY (hasFeature renvoie true) => autorisé
 *   - licence explicite AVEC website   => autorisé
 *   - licence explicite SANS website   => notFound() (404)
 *
 * `notFound()` de Next lève une erreur : on la simule par un sentinel pour
 * distinguer « rendu autorisé » de « 404 déclenchée ».
 */

const NOT_FOUND = new Error("NEXT_NOT_FOUND")

const getCurrentTenant = vi.fn()
const hasFeature = vi.fn()

vi.mock("@/lib/tenant", () => ({
  getCurrentTenant: () => getCurrentTenant(),
}))
vi.mock("@/lib/licensing/server", () => ({
  hasFeature: (companyId: number, key: string) => hasFeature(companyId, key),
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

  it("ESSENTIAL sans website => notFound() (site vitrine inaccessible)", async () => {
    getCurrentTenant.mockResolvedValue({ id: 9, slug: "essential-co" })
    hasFeature.mockResolvedValue(false)
    await expect(requireWebsiteFeature()).rejects.toBe(NOT_FOUND)
    expect(hasFeature).toHaveBeenCalledWith(9, "website")
  })
})
