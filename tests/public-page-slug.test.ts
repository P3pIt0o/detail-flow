import { describe, expect, it } from "vitest"
import {
  DEFAULT_TENANT_SLUG,
  isValidSlug,
  parsePublicPagePath,
  publicPagePath,
  publicPageUrl,
  publicReservationPath,
  publicReservationUrl,
} from "@/lib/tenant-shared"
import {
  resolveEffectivePublicPage,
  type CompanyPublicFields,
  type PublicPageConfigRow,
} from "@/lib/public-page/resolve"

/**
 * LOT 2 — Tests PURS (sans DB) du routage `/p/<slug>` et du résolveur de config
 * de page publique. Couvrent : résolution du slug par chemin, cohabitation avec
 * les préfixes réservés, et la chaîne de repli config → colonnes company →
 * défauts (garantie de non-régression pour les tenants sans config).
 */

describe("parsePublicPagePath", () => {
  it("résout un slug simple vers le rendu racine du tenant", () => {
    expect(parsePublicPagePath("/p/mon-garage")).toEqual({ slug: "mon-garage", rest: "/" })
  })

  it("conserve le sous-chemin (réservation, etc.)", () => {
    expect(parsePublicPagePath("/p/mon-garage/reservation")).toEqual({
      slug: "mon-garage",
      rest: "/reservation",
    })
    expect(parsePublicPagePath("/p/mon-garage/a/b")).toEqual({ slug: "mon-garage", rest: "/a/b" })
  })

  it("renvoie null sans slug", () => {
    expect(parsePublicPagePath("/p")).toBeNull()
    expect(parsePublicPagePath("/p/")).toBeNull()
  })

  it("ignore les chemins hors /p (aucune interférence)", () => {
    expect(parsePublicPagePath("/")).toBeNull()
    expect(parsePublicPagePath("/admin")).toBeNull()
    expect(parsePublicPagePath("/marketing/pricing")).toBeNull()
    expect(parsePublicPagePath("/prestations")).toBeNull()
    // Un segment "pxyz" ne doit pas être confondu avec le préfixe /p.
    expect(parsePublicPagePath("/pricing")).toBeNull()
  })

  it("rejette un premier segment syntaxiquement invalide", () => {
    expect(parsePublicPagePath("/p/AB")).toBeNull() // trop court + majuscules
    expect(parsePublicPagePath("/p/espace invalide")).toBeNull()
    // Slug réservé (ex. "admin") rejeté par isValidSlug.
    expect(parsePublicPagePath("/p/admin")).toBeNull()
  })

  it("accepte le tenant historique DetailFlow malgré sa réservation", () => {
    // Exception de ROUTING : `detailflow` reste réservé (interdit à la création)
    // mais l'entreprise historique existe déjà et doit rester joignable.
    expect(parsePublicPagePath("/p/detailflow")).toEqual({ slug: "detailflow", rest: "/" })
    expect(parsePublicPagePath("/p/detailflow/reservation")).toEqual({
      slug: "detailflow",
      rest: "/reservation",
    })
    // Cohérence avec la constante partagée (pas de valeur codée en dur).
    expect(parsePublicPagePath(`/p/${DEFAULT_TENANT_SLUG}`)).toEqual({
      slug: DEFAULT_TENANT_SLUG,
      rest: "/",
    })
  })

  it("garde les AUTRES slugs réservés refusés (exception limitée au tenant historique)", () => {
    expect(parsePublicPagePath("/p/admin")).toBeNull()
    expect(parsePublicPagePath("/p/api")).toBeNull()
    expect(parsePublicPagePath("/p/super-admin")).toBeNull()
    expect(parsePublicPagePath("/p/www")).toBeNull()
  })

  it("laisse `detailflow` INTERDIT à la création d'un nouveau tenant", () => {
    // La validation de slug ne change pas : `detailflow` reste réservé.
    expect(isValidSlug("detailflow")).toBe(false)
    expect(isValidSlug(DEFAULT_TENANT_SLUG)).toBe(false)
  })

  it("construit les chemins/URL publics attendus", () => {
    expect(publicPagePath("mon-garage")).toBe("/p/mon-garage")
    expect(publicPageUrl("mon-garage")).toBe("/p/mon-garage")
    expect(publicPageUrl("mon-garage", "detailflow.fr")).toBe("https://www.detailflow.fr/p/mon-garage")
  })

  it("construit le lien public de réservation (Cas A : /p/<slug>/reservation)", () => {
    expect(publicReservationPath("mon-garage")).toBe("/p/mon-garage/reservation")
    // Aperçu/local (pas de domaine racine) → chemin relatif.
    expect(publicReservationUrl("mon-garage")).toBe("/p/mon-garage/reservation")
    // Production → URL absolue sur le domaine racine (préfixe www.).
    expect(publicReservationUrl("mon-garage", "detailflow.fr")).toBe(
      "https://www.detailflow.fr/p/mon-garage/reservation",
    )
    // Le sous-chemin est bien re-résolu vers le tenant par le middleware (pur).
    expect(parsePublicPagePath("/p/mon-garage/reservation")).toEqual({
      slug: "mon-garage",
      rest: "/reservation",
    })
  })
})

describe("resolveEffectivePublicPage — chaîne de repli", () => {
  const company: CompanyPublicFields = {
    brandPrimary: "#111111",
    brandSecondary: "#222222",
    heroOverlay: null,
  }

  it("sans config : repli intégral sur company puis défauts (aucune régression)", () => {
    const eff = resolveEffectivePublicPage(null, company)
    expect(eff.hasConfig).toBe(false)
    expect(eff.accentPrimary).toBe("#111111")
    expect(eff.accentSecondary).toBe("#222222")
    expect(eff.theme).toBe("auto")
    // Toggles par défaut visibles → aucune section masquée.
    expect(eff.showAbout).toBe(true)
    expect(eff.showGallery).toBe(true)
    expect(eff.showReviews).toBe(true)
    expect(eff.isPublished).toBe(false)
    expect(eff.seoIndexable).toBe(false)
    expect(eff.heroImageUrl).toBeNull()
  })

  it("config renseignée : prioritaire sur les colonnes company", () => {
    const row: PublicPageConfigRow = {
      layoutVariant: "bold",
      heroImageUrl: "/tenants/x/hero.jpg",
      heroImagePosition: "center",
      heroOverlay: 40,
      accentPrimary: "#ff0000",
      accentSecondary: null, // vide → repli sur company.brandSecondary
      theme: "dark",
      showGallery: false,
      showReviews: true,
      showAbout: false,
      interventionZone: "Lyon et 30 km",
      depositRuleText: "Acompte 30%",
      cancellationPolicy: "Gratuit -24h",
      seoIndexable: true,
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    }
    const eff = resolveEffectivePublicPage(row, company)
    expect(eff.hasConfig).toBe(true)
    expect(eff.accentPrimary).toBe("#ff0000") // config prioritaire
    expect(eff.accentSecondary).toBe("#222222") // repli company (config null)
    expect(eff.theme).toBe("dark")
    expect(eff.heroImageUrl).toBe("/tenants/x/hero.jpg")
    expect(eff.heroOverlay).toBe(40)
    expect(eff.showGallery).toBe(false)
    expect(eff.showAbout).toBe(false)
    expect(eff.showReviews).toBe(true)
    expect(eff.interventionZone).toBe("Lyon et 30 km")
    expect(eff.seoIndexable).toBe(true)
    expect(eff.isPublished).toBe(true)
  })

  it("normalise un thème invalide en 'auto' et nettoie les chaînes vides", () => {
    const row = {
      layoutVariant: "   ",
      heroImageUrl: "",
      heroImagePosition: null,
      heroOverlay: null,
      accentPrimary: "   ",
      accentSecondary: "",
      theme: "banane",
      showGallery: true,
      showReviews: false,
      showAbout: true,
      interventionZone: "",
      depositRuleText: null,
      cancellationPolicy: null,
      seoIndexable: false,
      publishedAt: null,
    } as unknown as PublicPageConfigRow
    const eff = resolveEffectivePublicPage(row, company)
    expect(eff.theme).toBe("auto")
    expect(eff.layoutVariant).toBeNull()
    // accent vide → repli company.
    expect(eff.accentPrimary).toBe("#111111")
    expect(eff.interventionZone).toBeNull()
    expect(eff.showReviews).toBe(false)
  })
})
