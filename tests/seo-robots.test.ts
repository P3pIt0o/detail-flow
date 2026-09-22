import { describe, expect, it } from "vitest"
import { resolvePublicRobots } from "@/lib/seo/robots"

/**
 * Politique d'indexation PURE des pages publiques (aucune DB). Garantit que
 * l'offre visible == le comportement d'indexation, et que les sites existants
 * (custom / feature `website`) ne sont JAMAIS dégradés (non-régression).
 */
describe("resolvePublicRobots", () => {
  const base = {
    hasTenant: true,
    isCustomSite: false,
    hasWebsiteFeature: false,
    isPublished: false,
    seoIndexable: false,
  }

  it("hors tenant (vitrine racine) : aucune directive", () => {
    expect(resolvePublicRobots({ ...base, hasTenant: false })).toBeNull()
  })

  it("site personnalisé : indexé comme historiquement (aucune directive)", () => {
    expect(
      resolvePublicRobots({ ...base, isCustomSite: true, isPublished: false, seoIndexable: false }),
    ).toBeNull()
  })

  it("site avec feature website : indexé comme historiquement (aucune directive)", () => {
    expect(
      resolvePublicRobots({ ...base, hasWebsiteFeature: true, isPublished: false, seoIndexable: false }),
    ).toBeNull()
  })

  it("self-service publié ET indexation autorisée : indexable (aucune directive)", () => {
    expect(resolvePublicRobots({ ...base, isPublished: true, seoIndexable: true })).toBeNull()
  })

  it("self-service publié MAIS indexation refusée : noindex, follow conservé", () => {
    expect(resolvePublicRobots({ ...base, isPublished: true, seoIndexable: false })).toEqual({
      index: false,
      follow: true,
    })
  })

  it("self-service brouillon (non publié) : noindex + nofollow", () => {
    expect(resolvePublicRobots({ ...base, isPublished: false, seoIndexable: true })).toEqual({
      index: false,
      follow: false,
    })
    expect(resolvePublicRobots({ ...base, isPublished: false, seoIndexable: false })).toEqual({
      index: false,
      follow: false,
    })
  })

  it("priorité : custom/website priment sur l'état de publication", () => {
    // Même non publié + non indexable, un site custom reste indexé (null).
    expect(resolvePublicRobots({ ...base, isCustomSite: true })).toBeNull()
    expect(resolvePublicRobots({ ...base, hasWebsiteFeature: true })).toBeNull()
  })
})
