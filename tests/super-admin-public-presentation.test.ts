import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { resolveTenantPublicPresentation } from "@/lib/super-admin/public-presentation"
import { getVisibleSettingsCategories, findCategoryByTab } from "@/lib/admin/settings-nav"
import { publicReservationUrl, tenantPublicUrl } from "@/lib/tenant-shared"

/**
 * PRODUITS SÉPARÉS — le Super Admin et l'espace admin doivent refléter le
 * produit RÉELLEMENT choisi (`companies.onboardingIntent`, source de vérité) :
 *
 *  - booking_only  : moteur/widget de réservation, PAS de vitrine DetailFlow.
 *                    Le lien public est la route canonique `/p/<slug>/reservation`.
 *  - public_page   : vraie vitrine DetailFlow (URL `/?tenant=<slug>`).
 *  - custom_website / customSiteKey : affichage « site personnalisé » historique.
 *  - null (legacy) : comportement historique strict (« Site standard »).
 *
 * Ces tests verrouillent la correction du bug S&WASH (booking_only affiché comme
 * « Site standard » → 404 sur `/?tenant=s-wash`) sans toucher aux autres produits.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ROOT = "detailflow.fr"

describe("Super Admin — présentation publique contextuelle", () => {
  it("booking_only → « Réservation / Widget » + URL de réservation canonique (jamais /?tenant=)", () => {
    const p = resolveTenantPublicPresentation({
      slug: "s-wash",
      onboardingIntent: "booking_only",
      customSiteKey: null,
      rootDomain: ROOT,
    })
    expect(p.kind).toBe("reservation")
    expect(p.siteLabel).toBe("Réservation / Widget")
    expect(p.linkLabel).toBe("Lien de réservation")
    expect(p.publicUrl).toBe(publicReservationUrl("s-wash", ROOT))
    expect(p.publicUrl).toBe("https://www.detailflow.fr/p/s-wash/reservation")
    // La régression exacte du bug : plus jamais l'URL de vitrine `/?tenant=`.
    expect(p.publicUrl).not.toContain("/?tenant=")
    expect(p.siteLabel).not.toBe("Site standard")
  })

  it("booking_only → aucun site vitrine (URL ≠ URL de vitrine `/?tenant=`)", () => {
    const p = resolveTenantPublicPresentation({
      slug: "s-wash",
      onboardingIntent: "booking_only",
      customSiteKey: null,
      rootDomain: ROOT,
    })
    expect(p.publicUrl).not.toBe(tenantPublicUrl("s-wash", ROOT))
  })

  it("public_page → « Site vitrine » + URL de vitrine `/?tenant=`", () => {
    const p = resolveTenantPublicPresentation({
      slug: "mon-garage",
      onboardingIntent: "public_page",
      customSiteKey: null,
      rootDomain: ROOT,
    })
    expect(p.kind).toBe("vitrine")
    expect(p.siteLabel).toBe("Site vitrine")
    expect(p.publicUrl).toBe(tenantPublicUrl("mon-garage", ROOT))
    expect(p.publicUrl).toBe("https://www.detailflow.fr/?tenant=mon-garage")
  })

  it("custom_website via customSiteKey → affichage « site personnalisé » historique inchangé", () => {
    const p = resolveTenantPublicPresentation({
      slug: "spirit-acs",
      onboardingIntent: "custom_website",
      customSiteKey: "spirit-acs",
      rootDomain: ROOT,
    })
    expect(p.kind).toBe("custom")
    expect(p.siteLabel).toBe("Spirit ACS")
    expect(p.publicUrl).toBe(tenantPublicUrl("spirit-acs", ROOT))
  })

  it("customSiteKey est PRIORITAIRE sur l'intention (aucun site custom affecté)", () => {
    const p = resolveTenantPublicPresentation({
      slug: "rozan",
      onboardingIntent: "booking_only", // ignoré au profit du site custom
      customSiteKey: "rozan",
      rootDomain: ROOT,
    })
    expect(p.kind).toBe("custom")
    expect(p.siteLabel).toBe("Rozan Cleaning Services")
    expect(p.publicUrl).toContain("/?tenant=rozan")
  })

  it("null (tenant historique) → « Site standard » + URL de vitrine (comportement inchangé)", () => {
    const p = resolveTenantPublicPresentation({
      slug: "legacy-co",
      onboardingIntent: null,
      customSiteKey: null,
      rootDomain: ROOT,
    })
    expect(p.kind).toBe("standard")
    expect(p.siteLabel).toBe("Site standard")
    expect(p.linkLabel).toBe("Site public")
    expect(p.publicUrl).toBe(tenantPublicUrl("legacy-co", ROOT))
  })

  it("la requête super-admin sélectionne bien onboardingIntent (sinon la carte ne peut pas être contextuelle)", () => {
    const q = read("lib/super-admin/queries.ts")
    expect(q).toContain("onboardingIntent: companies.onboardingIntent")
  })
})

describe("Espace admin — réglages adaptés au produit", () => {
  it("booking_only → la catégorie « Site public » (réglages de vitrine) est masquée", () => {
    const cats = getVisibleSettingsCategories(null, "booking_only")
    expect(cats.some((c) => c.id === "site")).toBe(false)
    // Les modules métier communs restent présents (aucune capacité retirée).
    expect(cats.some((c) => c.id === "reservations")).toBe(true)
    expect(cats.some((c) => c.id === "billing")).toBe(true)
    // Aucun onglet de vitrine n'est atteignable par ?tab=.
    expect(findCategoryByTab("site", null, "booking_only")).toBeNull()
    expect(findCategoryByTab("gallery", null, "booking_only")).toBeNull()
    expect(findCategoryByTab("appearance", null, "booking_only")).toBeNull()
  })

  it("public_page → la catégorie « Site public » (vitrine) reste disponible", () => {
    const cats = getVisibleSettingsCategories(null, "public_page")
    expect(cats.some((c) => c.id === "site")).toBe(true)
    expect(findCategoryByTab("site", null, "public_page")?.id).toBe("site")
  })

  it("null (legacy) → liste complète inchangée (aucune régression)", () => {
    const cats = getVisibleSettingsCategories(null, null)
    expect(cats.some((c) => c.id === "site")).toBe(true)
    expect(findCategoryByTab("gallery", null, null)?.id).toBe("site")
  })

  it("custom_website résolu (customSiteKey => intention null) conserve la vitrine custom", () => {
    // resolveDashboardIntent renvoie null pour un site custom ; on simule ce
    // contrat en passant intention null : la liste reste complète (historique).
    const cats = getVisibleSettingsCategories("rozan", null)
    expect(cats.some((c) => c.id === "site")).toBe(true)
  })

  it("l'éditeur /admin/page-publique renvoie vers « Ma réservation » pour booking_only", () => {
    const page = read("app/admin/page-publique/page.tsx")
    expect(page).toContain('dashboardIntent === "booking_only"')
    expect(page).toContain("/admin/ma-reservation")
  })
})
