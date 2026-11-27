import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  getCustomSiteAdminProfile,
  isAdminRouteHidden,
  isSettingsTabHidden,
} from "@/lib/admin/custom-site-admin-profile"
import { buildAdminNav, buildMainNav, buildPlusGroups } from "@/lib/admin/nav"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { ALL_SETTINGS_TABS, findCategoryByTab, getVisibleSettingsCategories, SETTINGS_CATEGORIES } from "@/lib/admin/settings-nav"
import { searchSettings } from "@/lib/admin/settings-search"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const HIDDEN_ROUTES = ["/admin/page-publique", "/admin/ma-reservation", "/admin/site-personnalise"]
const OTHERS = [null, "spirit-acs", "rozan", "justclean"]
const INTENTS = ["booking_only", "public_page", null] as const
const MODES = [null, "link", "widget"] as const

const signals = {
  companyInfoComplete: false,
  billingConfirmed: false,
  hasService: false,
  hasAvailability: false,
  publicSiteComplete: false,
  hasBooking: false,
}

const hrefs = (customSiteKey: string | null) => {
  const opts = { intent: null, customSiteKey, bookingDistributionMode: "widget" }
  return [
    ...buildMainNav().map((i) => i.href),
    ...buildAdminNav(opts).map((i) => i.href),
    ...buildPlusGroups(opts).flatMap((g) => g.items.map((i) => i.href)),
  ]
}

describe("L102 — profil Cleanyzer", () => {
  it("routes masquées absentes du menu et de « Plus », quel que soit le mode", () => {
    for (const intent of INTENTS) {
      for (const bookingDistributionMode of MODES) {
        const opts = { intent, customSiteKey: "cleanyzer", bookingDistributionMode }
        const all = [
          ...buildAdminNav(opts).map((i) => i.href),
          ...buildPlusGroups(opts).flatMap((g) => g.items.map((i) => i.href)),
        ]
        for (const route of HIDDEN_ROUTES) expect(all).not.toContain(route)
      }
    }
  })

  it("galerie absente des onglets et de la recherche", () => {
    expect(findCategoryByTab("gallery", "cleanyzer")).toBeNull()
    expect(searchSettings("galerie", "cleanyzer")).toEqual([])
    expect(isSettingsTabHidden("cleanyzer", "gallery")).toBe(true)
  })

  it("étape « présence en ligne » retirée, progression recalculée", () => {
    const res = computeOnboardingSteps(signals, "cleanyzer")
    expect(res.steps.map((s) => s.key)).toEqual(["company", "billing", "service", "availability", "booking"])
    expect(res.total).toBe(5)
    const done = computeOnboardingSteps(
      { ...signals, companyInfoComplete: true, billingConfirmed: true, hasService: true, hasAvailability: true, hasBooking: true },
      "cleanyzer",
    )
    expect(done.allDone).toBe(true)
    expect(done.percent).toBe(100)
  })

  it("tous les écrans d'activité et les onglets utiles restent présents", () => {
    const all = hrefs("cleanyzer")
    for (const route of [
      "/admin",
      "/admin/calendrier",
      "/admin/clients",
      "/admin/mon-agenda",
      "/admin/prestations",
      "/admin/produits",
      "/admin/factures",
      "/admin/export",
      "/admin/reservations",
      "/admin/analyse",
      "/admin/demandes",
      "/admin/leads",
      "/admin/abonnements-clients",
      "/admin/offres",
      "/admin/parametres",
      "/admin/parametres?tab=reviews",
      "/admin/parametres?tab=payments",
      "/admin/abonnement",
    ]) {
      expect(all).toContain(route)
    }
    for (const tab of ALL_SETTINGS_TABS.filter((t) => t !== "gallery")) {
      expect(findCategoryByTab(tab, "cleanyzer"), tab).not.toBeNull()
    }
  })

  it("partage masqué et réglages standard masqués", () => {
    const profile = getCustomSiteAdminProfile("cleanyzer")
    expect(profile.hideShareActions).toBe(true)
    expect(profile.hideStandardSiteContent).toBe(true)
  })

  it("les adresses masquées sont reconnues", () => {
    for (const route of HIDDEN_ROUTES) expect(isAdminRouteHidden("cleanyzer", route)).toBe(true)
    expect(isAdminRouteHidden("cleanyzer", "/admin/parametres")).toBe(false)
  })

  it("chaque élément masqué porte sa raison", () => {
    const profile = getCustomSiteAdminProfile("cleanyzer")
    for (const item of [...profile.hiddenRoutes, ...profile.hiddenSettingsTabs, ...profile.hiddenOnboardingSteps]) {
      expect(item.reason.length).toBeGreaterThan(10)
    }
  })
})

describe("L102 — les autres tenants ne changent pas (tenant B ≠ A)", () => {
  it("profil vide pour standard, Spirit, Rozan, JustClean et clés piégées", () => {
    for (const key of [...OTHERS, undefined, "", "CLEANYZER", "toString", "__proto__", "constructor"]) {
      const profile = getCustomSiteAdminProfile(key)
      expect(profile.hiddenRoutes).toEqual([])
      expect(profile.hiddenSettingsTabs).toEqual([])
      expect(profile.hiddenOnboardingSteps).toEqual([])
      expect(profile.hideShareActions).toBe(false)
      expect(profile.hideStandardSiteContent).toBe(false)
    }
  })

  it("menu, onglets et étapes inchangés", () => {
    for (const key of OTHERS) {
      for (const route of HIDDEN_ROUTES) expect(isAdminRouteHidden(key, route)).toBe(false)
      expect(computeOnboardingSteps(signals, key)).toEqual(computeOnboardingSteps(signals))
      expect(computeOnboardingSteps(signals, key).total).toBe(6)
    }
    expect(getVisibleSettingsCategories(null)).toEqual(SETTINGS_CATEGORIES)
    for (const key of ["rozan", "justclean"]) expect(getVisibleSettingsCategories(key)).toEqual(SETTINGS_CATEGORIES)
    expect(findCategoryByTab("gallery", "spirit-acs")).not.toBeNull()
    expect(buildAdminNav({ intent: null, customSiteKey: null }).map((i) => i.href)).toContain("/admin/page-publique")
  })

  it("le profil ne dépend que de la clé du tenant authentifié", () => {
    const profileSrc = read("lib/admin/custom-site-admin-profile.ts")
    expect(profileSrc).not.toMatch(/searchParams|slug\b.*===|formData/i)
    for (const file of [
      "app/admin/(dashboard)/layout.tsx",
      "app/admin/(dashboard)/parametres/page.tsx",
      "app/admin/(dashboard)/ma-reservation/page.tsx",
      "app/admin/(dashboard)/site-personnalise/page.tsx",
      "app/admin/page-publique/page.tsx",
    ]) {
      const src = read(file)
      expect(src, file).toMatch(/requireCompanyMember\(\)/)
      expect(src, file).toMatch(/(getCustomSiteAdminProfile|isAdminRouteHidden|isSettingsTabHidden)\([^)]*(ctx\.tenant|tenant|company)\.customSiteKey/)
    }
  })
})

describe("L102 — câblage des pages", () => {
  it("les trois pages redirigent vers les paramètres après l'authentification", () => {
    for (const [file, route] of [
      ["app/admin/(dashboard)/ma-reservation/page.tsx", "/admin/ma-reservation"],
      ["app/admin/(dashboard)/site-personnalise/page.tsx", "/admin/site-personnalise"],
      ["app/admin/page-publique/page.tsx", "/admin/page-publique"],
    ]) {
      const src = read(file)
      const guard = src.indexOf(`"${route}"`)
      expect(guard, file).toBeGreaterThan(src.indexOf("await requireCompanyMember()"))
      expect(src.slice(guard), file).toMatch(/redirect\(withTenant\("\/admin\/parametres"/)
    }
  })

  it("?tab=gallery redirige, la carte « Réservation en ligne » est masquée", () => {
    const src = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(src).toMatch(/isSettingsTabHidden\(tenant\.customSiteKey, tab\)/)
    expect(src).toMatch(/redirect\(withTenant\("\/admin\/parametres"/)
    expect(src).toMatch(/hideShareActions/)
  })

  it("en-tête : partage masqué, « Voir mon site » conservé", () => {
    expect(read("app/admin/(dashboard)/layout.tsx")).toMatch(/hideShareActions/)
    expect(read("components/admin/admin-shell.tsx")).toMatch(/hideShareActions/)
  })

  it("« Voir mon site » mène au domaine de Cleanyzer", () => {
    const link = resolvePublicLink({ slug: "cleanyzer", intent: null, customSiteKey: "cleanyzer", status: "ACTIVE" })
    expect(link?.url).toBe("https://www.cleanyzer.fr")
  })

  it("tableau de bord : étapes calculées avec la clé du tenant", () => {
    expect(read("app/admin/(dashboard)/page.tsx")).toMatch(/company\.customSiteKey,?\s*\)/)
  })
})
