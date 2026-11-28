import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AppearanceSettings } from "@/components/admin/settings/appearance-settings"
import { SiteBranding } from "@/components/admin/settings/site-branding"
import {
  getCustomSiteAdminProfile,
  isAdminRouteHidden,
  isSettingsTabHidden,
  visibleShareHint,
} from "@/lib/admin/custom-site-admin-profile"
import { AdminShell } from "@/components/admin/admin-shell"
import { noLaterBookingsText } from "@/lib/admin/queries"
import { buildAdminNav, buildMainNav, buildPlusGroups } from "@/lib/admin/nav"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { ALL_SETTINGS_TABS, findCategoryByTab, getVisibleSettingsCategories, SETTINGS_CATEGORIES } from "@/lib/admin/settings-nav"
import { searchSettings } from "@/lib/admin/settings-search"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"

const { redirectMock, memberMock, pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/admin"),
  redirectMock: vi.fn((_url: string) => {
    throw new Error("NEXT_REDIRECT")
  }),
  memberMock: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: pathnameMock,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/admin", () => ({
  requireCompanyMember: memberMock,
  requireAdminCompanyId: vi.fn(async () => 1),
  requireAdmin: memberMock,
}))
vi.mock("server-only", () => ({}))

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

describe("L102 — après relecture : textes d'aide exacts", () => {
  const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/&#x27;/g, "'")
  const branding = (customSiteWording: boolean) =>
    html(
      createElement(SiteBranding, {
        logoPathname: null,
        cgv: "",
        hero: { heroTitle: "", heroHighlight: "", heroSubtitle: "", heroCtaPrimary: "", heroCtaSecondary: "" },
        customSiteWording,
      }),
    )
  const appearance = (customSiteWording: boolean) =>
    html(createElement(AppearanceSettings, { brandPrimary: null, brandSecondary: null, customSiteWording }))

  it("logo, réseaux et couleurs : textes adaptés au site sur mesure", () => {
    const b = branding(true)
    expect(b).toContain("Transmis à Google. Il ne change pas le logo de votre site sur mesure")
    expect(b).toContain("Ces liens sont transmis à Google. Ils ne changent pas les liens affichés sur votre site sur mesure.")
    expect(b).not.toContain("pied de page")
    const a = appearance(true)
    expect(a).toContain("Ces couleurs ne changent pas votre site sur mesure.")
    expect(a).toContain("confirmation, de gestion de rendez-vous et de paiement")
    expect(a).not.toContain("immédiatement à votre site")
  })

  it("les autres entreprises gardent les textes actuels", () => {
    const b = branding(false)
    expect(b).toContain("Affiché dans l'en-tête et le pied de page de votre site")
    expect(b).toContain("ils s'afficheront dans le pied de page de votre")
    expect(b).not.toContain("sur mesure")
    const a = appearance(false)
    expect(a).toContain("Ces couleurs s'appliquent immédiatement à votre site après enregistrement.")
    expect(a).not.toContain("sur mesure")
  })

  it("recherche « titre » / « présentation » : plus de « Contenu du site » pour Cleanyzer seulement", () => {
    for (const q of ["titre", "texte presentation", "présentation"]) {
      expect(searchSettings(q, "cleanyzer").map((r) => r.label), q).not.toContain("Contenu du site")
      for (const key of [null, "rozan", "justclean"]) {
        expect(searchSettings(q, key).map((r) => r.label), `${q} ${key}`).toContain("Contenu du site")
      }
    }
    expect(searchSettings("site", "cleanyzer").map((r) => r.label)).toContain("Contenu du site")
  })
})

describe("L102 — plus aucune invitation à partager", () => {
  const hint = noLaterBookingsText(0, 0).hint

  it("tableau de bord vide : pas de « Partagez votre lien » pour Cleanyzer, inchangé ailleurs", () => {
    expect(hint).toContain("Partagez votre lien")
    expect(visibleShareHint("cleanyzer", hint)).toBeUndefined()
    for (const key of OTHERS) expect(visibleShareHint(key, hint)).toBe(hint)
    const src = read("app/admin/(dashboard)/page.tsx")
    expect(src).toMatch(/visibleShareHint\(company\.customSiteKey, noLater\.hint\)/)
    expect(src).not.toMatch(/\{noLater\.hint\b/)
  })

  const shell = (hideShareActions: boolean, pathname: string) => {
    pathnameMock.mockReturnValue(pathname)
    const props = {
      brandName: "DetailFlow",
      companyName: "Demo",
      adminName: "Alex",
      mainNav: [],
      groups: [],
      publicUrl: "https://www.cleanyzer.fr",
      hideShareActions,
    }
    return renderToStaticMarkup(createElement(AdminShell, props as unknown as Parameters<typeof AdminShell>[0], null))
  }

  it.each(["/admin", "/admin/plus"])("en-tête et « Plus » (%s) : copie du lien masquée seulement si demandé", (path) => {
    const hidden = shell(true, path)
    expect(hidden).not.toContain("Copier mon lien")
    expect(hidden).toContain("Voir mon site")
    expect(hidden).toContain('href="https://www.cleanyzer.fr"')
    expect(shell(false, path)).toContain("Copier mon lien")
  })
})

describe("L102 — redirections (pages exécutées)", () => {
  const pages = [
    ["ma-reservation", () => import("@/app/admin/(dashboard)/ma-reservation/page")],
    ["site-personnalise", () => import("@/app/admin/(dashboard)/site-personnalise/page")],
    ["page-publique", () => import("@/app/admin/page-publique/page")],
  ] as const

  // Le premier accès authentifié donne la clé ; la suite de la page n'est pas exécutée ici.
  const run = async (load: () => Promise<{ default: unknown }>, customSiteKey: string | null) => {
    redirectMock.mockClear()
    memberMock.mockReset()
    const tenant = { id: 1, slug: "demo", customSiteKey, status: "ACTIVE", onboardingIntent: null }
    memberMock.mockResolvedValue({ tenant, company: tenant, companyId: 1, role: "OWNER", isSuperAdmin: false })
    const Page = (await load()).default as (p: unknown) => Promise<unknown>
    await Page({ searchParams: Promise.resolve({ tenant: "demo" }) }).catch(() => {})
    return redirectMock.mock.calls.map(([url]) => String(url))
  }

  it.each(pages)("%s : Cleanyzer renvoyé aux paramètres (aperçu conservé)", async (_name, load) => {
    expect(await run(load, "cleanyzer")).toEqual(["/admin/parametres?tenant=demo"])
    expect(memberMock).toHaveBeenCalled()
  })

  it.each(pages)("%s : tenant standard jamais renvoyé aux paramètres", async (_name, load) => {
    expect((await run(load, null)).filter((u) => u.startsWith("/admin/parametres"))).toEqual([])
  })

  it("?tab=gallery : Cleanyzer renvoyé aux paramètres", async () => {
    const load = () => import("@/app/admin/(dashboard)/parametres/page")
    redirectMock.mockClear()
    memberMock.mockResolvedValue({ tenant: { id: 1, customSiteKey: "cleanyzer" }, role: "OWNER", isSuperAdmin: false })
    const Page = (await load()).default as (p: unknown) => Promise<unknown>
    await expect(Page({ searchParams: Promise.resolve({ tab: "gallery" }) })).rejects.toThrow("NEXT_REDIRECT")
    expect(redirectMock.mock.calls).toEqual([["/admin/parametres"]])
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
