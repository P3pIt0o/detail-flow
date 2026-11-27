import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildAdminNav, buildMainNav, buildPlusGroups, showDirections } from "@/lib/admin/nav"
import { ALL_SETTINGS_TABS, findCategoryByTab } from "@/lib/admin/settings-nav"
import {
  SETTINGS_SEARCH,
  SETTINGS_SEARCH_EMPTY,
  searchSettings,
  settingsSearchHref,
} from "@/lib/admin/settings-search"
import { withTenant } from "@/lib/tenant-link"
import { DEFAULT_LOCATION_CONFIG, resolveLocationType, toPublicLocation } from "@/lib/booking/location-shared"
import { buildMapsDirectionsUrl } from "@/lib/notifications/maps"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const TENANTS = [
  { name: "standard", intent: null, customSiteKey: null, bookingDistributionMode: null },
  { name: "Spirit ACS", intent: null, customSiteKey: "spirit-acs", bookingDistributionMode: null },
  { name: "booking_only", intent: "booking_only" as const, customSiteKey: null, bookingDistributionMode: null },
  { name: "public_page", intent: "public_page" as const, customSiteKey: null, bookingDistributionMode: "link" },
  { name: "widget", intent: "booking_only" as const, customSiteKey: null, bookingDistributionMode: "widget" },
  { name: "Cleanyzer", intent: null, customSiteKey: "cleanyzer", bookingDistributionMode: "widget" },
  { name: "Rozan", intent: null, customSiteKey: "rozan", bookingDistributionMode: null },
]

const allHrefs = (o: (typeof TENANTS)[number]) => [
  ...buildMainNav().map((i) => i.href),
  ...buildPlusGroups(o).flatMap((g) => g.items.map((i) => i.href)),
]

describe("L77 — barre principale", () => {
  it("Aujourd'hui · Agenda · Clients · Plus", () => {
    expect(buildMainNav().map((i) => [i.label, i.href])).toEqual([
      ["Aujourd'hui", "/admin"],
      ["Agenda", "/admin/calendrier"],
      ["Clients", "/admin/clients"],
      ["Plus", "/admin/plus"],
    ])
  })

  it("bouton (+) : nouveau client, agenda, factures (pas de « Nouveau RDV »)", () => {
    const src = read("components/admin/mobile-tab-bar.tsx")
    for (const route of ["/admin/clients/new", "/admin/calendrier", "/admin/factures"]) {
      expect(src).toContain(`withTenant("${route}", tenantParam)`)
    }
    expect(src).not.toContain("Nouveau RDV")
  })
})

describe("L77 — page « Plus »", () => {
  it.each(TENANTS)("$name : aucun écran perdu, aucun doublon", (tenant) => {
    const hrefs = allHrefs(tenant)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const item of buildAdminNav(tenant)) expect(hrefs).toContain(item.href)
  })

  it.each(TENANTS)("$name : aucun écran masqué ne réapparaît", (tenant) => {
    const legacy = new Set(buildAdminNav(tenant).map((i) => i.href))
    for (const href of ["/admin/reservations", "/admin/prestations", "/admin/produits", "/admin/offres", "/admin/page-publique", "/admin/ma-reservation"]) {
      expect(allHrefs(tenant).includes(href)).toBe(legacy.has(href))
    }
  })

  it("trois rubriques, dans l'ordre", () => {
    const groups = buildPlusGroups(TENANTS[0])
    expect(groups.map((g) => g.label)).toEqual(["Mon activité", "Me faire connaître", "Réglages"])
    expect(groups[0].items.find((i) => i.href === "/admin/export")?.download).toBe(true)
  })

  it("réglages masqués pour un tenant : absents de « Plus », présents pour les autres", () => {
    const spirit = allHrefs(TENANTS[1])
    expect(spirit).not.toContain("/admin/parametres?tab=payments")
    expect(spirit).not.toContain("/admin/site-personnalise")
    expect(allHrefs(TENANTS[2])).not.toContain("/admin/parametres?tab=reviews")
    expect(allHrefs(TENANTS[0])).toEqual(
      expect.arrayContaining(["/admin/parametres?tab=payments", "/admin/parametres?tab=reviews", "/admin/site-personnalise"]),
    )
  })

  it("chaque lien garde ?tenant=", () => {
    for (const href of allHrefs(TENANTS[0])) expect(withTenant(href, "demo")).toMatch(/[?&]tenant=demo$/)
  })

  it("chaque écran a toujours son fichier (anciennes adresses servies)", () => {
    for (const tenant of TENANTS) {
      for (const href of allHrefs(tenant)) {
        const path = href.split("?")[0].replace(/^\/admin/, "")
        const files = [
          `app/admin/(dashboard)${path}/page.tsx`,
          `app/admin/(dashboard)${path}/route.ts`,
          `app/admin${path}/page.tsx`,
        ]
        expect(files.some((f) => existsSync(join(process.cwd(), f))), href).toBe(true)
      }
    }
  })
})

describe("L77 — recherche des réglages", () => {
  it("« horaires » mène au réglage Horaires d'ouverture", () => {
    const [first] = searchSettings("horaires")
    expect(first).toMatchObject({ label: "Horaires d'ouverture", tab: "hours", category: "Mes disponibilités" })
    expect(settingsSearchHref("hours")).toBe("/admin/parametres?tab=hours&bloc=reglage-hours")
    expect(first.href).toBe("/admin/parametres?tab=hours&bloc=reglage-hours")
  })

  it.each([
    ["acompte", "deposit"],
    ["conges", "timeoff"],
    ["Congés", "timeoff"],
    ["SMS", "sms"],
    ["logo", "site"],
    ["LOGO facture", "invoicing"],
    ["mot de passe", "security"],
  ])("« %s » trouve l'onglet %s", (query, tab) => {
    expect(searchSettings(query).map((r) => r.tab)).toContain(tab)
  })

  it("saisie vide = rien ; mot inconnu = aucun résultat + message", () => {
    expect(searchSettings("   ")).toEqual([])
    expect(searchSettings("zzzz")).toEqual([])
    expect(SETTINGS_SEARCH_EMPTY).toBe("Aucun réglage trouvé. Essayez un autre mot.")
    expect(read("components/admin/settings/settings-search.tsx")).toContain("SETTINGS_SEARCH_EMPTY")
  })

  it("chaque entrée vise un onglet connu ; chaque onglet a une entrée et son bloc dans la page", () => {
    const page = read("app/admin/(dashboard)/parametres/page.tsx")
    for (const e of SETTINGS_SEARCH) expect(ALL_SETTINGS_TABS).toContain(e.tab)
    for (const tab of ALL_SETTINGS_TABS) {
      expect(SETTINGS_SEARCH.some((e) => e.tab === tab), tab).toBe(true)
      expect(page, tab).toContain(`id="reglage-${tab}"`)
    }
  })

  it("Spirit ACS et booking_only : les réglages masqués ne sortent jamais", () => {
    for (const [key, intent] of [["spirit-acs", null], [null, "booking_only"]] as const) {
      for (const e of SETTINGS_SEARCH) {
        for (const r of searchSettings(e.label, key, intent)) {
          expect(findCategoryByTab(r.tab, key, intent), r.tab).not.toBeNull()
        }
      }
    }
    expect(searchSettings("horaires", "spirit-acs")).toEqual([])
    expect(searchSettings("couleurs", "spirit-acs")).toEqual([])
    expect(searchSettings("logo", "spirit-acs").map((r) => r.tab)).toEqual(["invoicing"])
    expect(searchSettings("galerie", null, "booking_only")).toEqual([])
    // Le tenant standard, lui, les trouve toujours.
    expect(searchSettings("horaires")).not.toEqual([])
    expect(searchSettings("galerie")).not.toEqual([])
  })

  it("présente en haut de « Plus » et de « Tous les réglages », sans appel serveur", () => {
    expect(read("app/admin/(dashboard)/plus/page.tsx")).toContain("<SettingsSearch")
    expect(read("app/admin/(dashboard)/parametres/page.tsx")).toContain("<SettingsSearch")
    expect(read("lib/admin/settings-search.ts")).not.toMatch(/fetch\(|@\/lib\/db|server-only/)
  })
})

describe("L77 — « Itinéraire » sur l'accueil", () => {
  it("atelier seul masqué ; mobile seul ou les deux affiché", () => {
    expect(showDirections({ mobileEnabled: false })).toBe(false)
    expect(showDirections({ mobileEnabled: true })).toBe(true)
  })

  it("l'accueil lit le réglage du tenant authentifié", () => {
    // L96 : accueil standard = requête groupée filtrée par entreprise ; Spirit garde sa lecture.
    expect(read("lib/admin/today-query.ts")).toContain('from settings s where s."companyId" = ${cid}')
    const page = read("app/admin/(dashboard)/spirit-dashboard-home.tsx")
    expect(page).toContain("getLocationConfig(companyId)")
    expect(page).toContain("showDirections(locationConfig)")
    // Lu en parallèle avec les autres données de l'accueil, pas en série.
    expect(page).not.toContain("await getLocationConfig(")
  })

  it("jamais configuré : le tunnel demande l'adresse du client, l'itinéraire vers cette adresse reste utile", () => {
    // Réglage par défaut = déplacement : la réservation enregistre l'adresse d'intervention du client.
    const loc = toPublicLocation(DEFAULT_LOCATION_CONFIG)
    expect(loc.mobile).toBe(true)
    expect(resolveLocationType(loc, null)).toBe("client")
    expect(showDirections(DEFAULT_LOCATION_CONFIG)).toBe(true)
  })

  it("jamais configuré, rendez-vous sans adresse : aucun lien « Itinéraire »", () => {
    expect(buildMapsDirectionsUrl(null)).toBeNull()
    expect(buildMapsDirectionsUrl("")).toBeNull()
    expect(read("app/admin/(dashboard)/spirit-dashboard-home.tsx")).toContain(
      "directions ? buildMapsDirectionsUrl(b.address) : null",
    )
    expect(read("lib/admin/today.ts")).toContain("address ? buildMapsDirectionsUrl(address) : null")
  })

  it("« Plus » résout le tenant côté serveur", () => {
    const page = read("app/admin/(dashboard)/plus/page.tsx")
    expect(page).toContain("requireCompanyMember()")
    expect(page).not.toMatch(/companyId\s*[:=]\s*[^\n]*searchParams/)
  })
})
