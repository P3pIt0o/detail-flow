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
import { ROZAN_SERVICES, ROZAN_LOCAL_PAGES, ROZAN_TENANT_SLUG } from "@/components/custom-sites/rozan/content"

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

  it("chaque page de nav fournit de quoi rendre une carte d'accueil (titre, accroche, image)", () => {
    const catalog = getPublicSiteCatalog("spirit-acs")!
    for (const p of listNavigationServicePages(catalog)) {
      // Le titre de carte = navLabel, l'accroche = cardTagline (repli cardTitle).
      expect(p.navLabel.length).toBeGreaterThan(0)
      expect(((p.cardTagline ?? p.cardTitle) || "").length).toBeGreaterThan(0)
      expect(p.image).toBeTruthy()
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

describe("catalogue public Rozan (tenant existant, aucune duplication)", () => {
  it("est résolu par la clé de SITE « rozan » mais porte le slug du TENANT réel", () => {
    // Distinction verrouillée : clé de site personnalisé ≠ slug de tenant.
    const catalog = getPublicSiteCatalog("rozan")
    expect(catalog).not.toBeNull()
    expect(catalog!.tenantSlug).toBe(ROZAN_TENANT_SLUG)
    expect(catalog!.tenantSlug).toBe("rozancleaningservice")
    // On ne crée jamais un tenant « rozan » distinct.
    expect(getPublicSiteCatalog("rozancleaningservice")).toBeNull()
  })

  it("projette les prestations actives Rozan en pages publiées et transactionnelles", () => {
    const catalog = getPublicSiteCatalog("rozan")!
    const active = ROZAN_SERVICES.filter((s) => s.active)
    expect(listPublishedServicePages(catalog)).toHaveLength(active.length)
    // Rozan est transactionnel : réservation + acompte (piloté par l'admin).
    for (const p of catalog.servicePages) {
      expect(p.conversionMode).toBe("booking_deposit")
      expect(resolveConversion(p.conversionMode)).toEqual({
        mode: "booking_deposit",
        engine: "booking",
        paymentMode: "deposit",
      })
    }
  })

  it("le sitemap Rozan liste l'accueil, les prestations réelles et les pages locales", () => {
    const catalog = getPublicSiteCatalog("rozan")!
    const paths = listSitemapPaths(catalog).map((p) => p.path)
    expect(paths).toContain("/")
    // Chaque prestation active a une URL /prestations/{slug} réellement servie.
    for (const s of ROZAN_SERVICES.filter((s) => s.active)) {
      expect(paths).toContain(`/prestations/${s.slug}`)
    }
    // Chaque page locale publiée est présente au premier niveau « /{slug} ».
    for (const slug of Object.keys(ROZAN_LOCAL_PAGES)) {
      expect(paths).toContain(`/${slug}`)
    }
    // Aucune fuite du tunnel de conversion ni des pages au shell standard.
    expect(paths).not.toContain("/reservation")
    expect(paths).not.toContain("/avis")
    expect(paths).not.toContain("/contact")
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
