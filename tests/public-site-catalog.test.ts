import { describe, it, expect } from "vitest"
import {
  getPublicSiteCatalog,
  listPublishedServicePages,
  listNavigationServicePages,
  findPublishedServicePage,
  listRelatedServicePages,
  listSitemapPaths,
} from "@/lib/public-site/provider"
import { resolveConversion } from "@/lib/public-site/conversion"
import { SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Phase 2 — Couche publique commune. Ces tests verrouillent le rôle de « source
 * de vérité unique » du catalogue et la résolution PAR PAGE du mode de
 * conversion, sans dépendre du design Spirit.
 */
describe("public-site provider", () => {
  it("ne renvoie un catalogue que pour un site personnalisé connu (repli sûr sinon)", () => {
    expect(getPublicSiteCatalog(null)).toBeNull()
    expect(getPublicSiteCatalog("")).toBeNull()
    expect(getPublicSiteCatalog("tenant-standard-inconnu")).toBeNull()
    expect(getPublicSiteCatalog("spirit-acs")).not.toBeNull()
  })

  it("projette SPIRIT_SERVICES sans perte (une page publiée par prestation)", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    expect(catalog.tenantSlug).toBe("spirit-acs")
    expect(listPublishedServicePages(catalog)).toHaveLength(SPIRIT_SERVICES.length)
  })

  it("trouve une page publiée par slug et renvoie null pour un slug inconnu", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    const known = SPIRIT_SERVICES[0]!.slug
    expect(findPublishedServicePage(catalog, known)?.slug).toBe(known)
    expect(findPublishedServicePage(catalog, "slug-qui-nexiste-pas")).toBeNull()
    expect(findPublishedServicePage(catalog, null)).toBeNull()
  })

  it("le maillage interne exclut la page courante", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    const slug = SPIRIT_SERVICES[0]!.slug
    const related = listRelatedServicePages(catalog, slug)
    expect(related.every((p) => p.slug !== slug)).toBe(true)
    expect(listRelatedServicePages(catalog, slug, 2).length).toBeLessThanOrEqual(2)
  })

  it("le sitemap dérive de la même source (statiques + prestations publiées)", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    const paths = listSitemapPaths(catalog).map((p) => p.path)
    expect(paths).toContain("/")
    expect(paths).toContain(`/prestations/${SPIRIT_SERVICES[0]!.slug}`)
    // Aucune page non publiée ne peut apparaître dans le sitemap.
    const publishedSlugs = new Set(listPublishedServicePages(catalog).map((p) => p.slug))
    for (const p of paths) {
      const m = p.match(/^\/prestations\/(.+)$/)
      if (m) expect(publishedSlugs.has(m[1]!)).toBe(true)
    }
  })

  it("la navigation ne contient que des pages publiées ET en navigation", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    for (const p of listNavigationServicePages(catalog)) {
      expect(p.published).toBe(true)
      expect(p.inNavigation).toBe(true)
    }
  })
})

describe("resolveConversion (mode par page → moteur existant)", () => {
  it("Spirit ACS : quote_request → moteur custom_request, sans paiement", () => {
    expect(resolveConversion("quote_request")).toEqual({
      mode: "quote_request",
      engine: "custom_request",
      paymentMode: null,
    })
  })

  it("les modes booking pointent vers le moteur de réservation existant", () => {
    expect(resolveConversion("booking")).toEqual({ mode: "booking", engine: "booking", paymentMode: "none" })
    expect(resolveConversion("booking_deposit")).toEqual({
      mode: "booking_deposit",
      engine: "booking",
      paymentMode: "deposit",
    })
    expect(resolveConversion("booking_full")).toEqual({
      mode: "booking_full",
      engine: "booking",
      paymentMode: "full",
    })
  })

  it("toutes les prestations Spirit sont en quote_request pour cette phase", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    for (const p of catalog.servicePages) {
      expect(p.conversionMode).toBe("quote_request")
    }
  })
})
