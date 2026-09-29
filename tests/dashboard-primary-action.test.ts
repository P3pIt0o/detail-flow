import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildWidgetPrimaryAction,
  isBookingDistributionMode,
  resolveDashboardPrimaryMode,
  resolveSiteLinkUrl,
} from "@/lib/admin/primary-action"
import { buildAdminNav, buildAdminNavGroups } from "@/lib/admin/nav"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { isBookingLinkAccessible } from "@/lib/company/publication-shared"
import { buildEmbedScriptSnippet, embedIframeSrc } from "@/lib/embed/snippet"

const ROOT = "detailflow.fr"
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const hasPagePublique = (items: { href: string }[]) => items.some((i) => i.href === "/admin/page-publique")

describe("bookingDistributionMode : source de vérité", () => {
  it("n'accepte que link | widget", () => {
    expect(isBookingDistributionMode("link")).toBe(true)
    expect(isBookingDistributionMode("widget")).toBe(true)
    for (const v of [null, undefined, "", "cleanyzer", "WIDGET", 1]) expect(isBookingDistributionMode(v)).toBe(false)
  })

  it("widget → bouton principal = intégration", () => {
    expect(resolveDashboardPrimaryMode("widget")).toBe("widget")
  })

  it("link → partage du lien conservé", () => {
    expect(resolveDashboardPrimaryMode("link")).toBe("copy_link")
    const booking = resolvePublicLink({ slug: "demo", intent: "booking_only", customSiteKey: null, status: "ACTIVE", rootDomain: ROOT })
    expect(booking?.kind).toBe("reservation")
  })

  it("tenants existants sans valeur (dont Spirit ACS / Rozan) → fallback historique", () => {
    expect(resolveDashboardPrimaryMode(null)).toBe("copy_link")
    expect(resolveDashboardPrimaryMode(undefined)).toBe("copy_link")
  })

  it("ni customSiteKey ni slug ne déterminent le mode", () => {
    for (const key of ["cleanyzer", "spirit-acs", "rozan"]) expect(resolveDashboardPrimaryMode(key)).toBe("copy_link")
    const code = read("lib/admin/primary-action.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    expect(code).not.toMatch(/cleanyzer|spirit|rozan/i)
    expect(read("app/admin/(dashboard)/layout.tsx")).not.toMatch(/["']cleanyzer["']/)
  })

  it("Cleanyzer → widget via le backfill ciblé (id + slug + customSiteKey, NULL uniquement)", () => {
    const sqlText = read("scripts/booking-distribution-mode-migration.sql").replace(/^\s*--.*$/gm, "")
    expect(sqlText).toMatch(/SET "bookingDistributionMode" = 'widget'\s+WHERE id = 104\s+AND slug = 'cleanyzer'\s+AND "customSiteKey" = 'cleanyzer'\s+AND "bookingDistributionMode" IS NULL/)
    expect(sqlText).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i)
    expect(sqlText.match(/\bUPDATE\b/gi)?.length).toBe(1)
    expect(sqlText).not.toMatch(/DEFAULT/i)
  })
})

describe("navigation admin", () => {
  const base = { intent: "booking_only" as const, customSiteKey: null }

  it("widget → « Page publique » absente (liste et groupes)", () => {
    expect(hasPagePublique(buildAdminNav({ ...base, bookingDistributionMode: "widget" }))).toBe(false)
    const grouped = buildAdminNavGroups({ ...base, bookingDistributionMode: "widget" }).flatMap((g) => g.items)
    expect(hasPagePublique(grouped)).toBe(false)
  })

  it("link / null → navigation strictement identique à l'historique", () => {
    for (const customSiteKey of [null, "spirit-acs", "rozan", "cleanyzer"]) {
      for (const intent of ["booking_only", "public_page", null] as const) {
        const legacy = buildAdminNav({ intent, customSiteKey })
        expect(buildAdminNav({ intent, customSiteKey, bookingDistributionMode: null })).toEqual(legacy)
        expect(buildAdminNav({ intent, customSiteKey, bookingDistributionMode: "link" })).toEqual(legacy)
      }
    }
  })
})

describe("onboarding → persistance", () => {
  it("le choix explicite est transmis puis persisté", () => {
    expect(read("app/demarrer/onboarding.tsx")).toMatch(/Comment souhaitez-vous recevoir vos réservations/)
    expect(read("app/admin/creer-mon-espace/create-workspace-form.tsx")).toMatch(/name="distribution"/)
    const action = read("app/admin/creer-mon-espace/actions.ts")
    expect(action).toMatch(/distributionRaw === "link" \|\| distributionRaw === "widget"/)
    expect(action).toMatch(/bookingDistributionMode: distribution/)
    expect(read("lib/company/provision.ts")).toMatch(/SET "bookingDistributionMode" = \$\{distributionValue\} WHERE id = \$\{company\.id\}/)
  })
})

describe("widget : lien de réservation direct + « Voir mon site »", () => {
  const ORIGIN = "https://www.detailflow.fr"
  const snippet = buildEmbedScriptSnippet("tenant-a", ROOT)

  it("URL directe = route canonique /p/<slug>/reservation (jamais /book, jamais ?tenant=)", () => {
    const a = buildWidgetPrimaryAction({ slug: "tenant-a", active: true, scriptSnippet: snippet, origin: ORIGIN })
    expect(a.bookingUrl).toBe("https://www.detailflow.fr/p/tenant-a/reservation")
    expect(a.bookingUrl).not.toMatch(/\/book\/|\?tenant=|embed=1|\/admin/)
  })

  it("même route que l'iframe du widget (un seul moteur)", () => {
    const a = buildWidgetPrimaryAction({ slug: "tenant-a", active: true, scriptSnippet: snippet, origin: ORIGIN })
    expect(embedIframeSrc("tenant-a", ROOT)).toBe(`${a.bookingUrl}?embed=1`)
  })

  it("bouton du dashboard : libellé/icône inchangés, copie UNIQUEMENT bookingUrl", () => {
    const ui = read("components/admin/widget-action-button.tsx")
    expect(ui).toMatch(/onClick=\{\(\) => copy\("link", bookingUrl\)\}/)
    expect(ui).toMatch(/Intégrer la réservation/)
    expect(ui).toMatch(/<Code2 className="size-4 shrink-0"/)
    expect(ui).not.toMatch(/scriptSnippet/)
    expect(ui).not.toMatch(/role="dialog"/)
    expect(ui).not.toMatch(/\/book\//)
  })

  it("Paramètres > Réservation en ligne : lien public AVANT le code d'intégration", () => {
    const ui = read("components/admin/settings/online-booking-settings.tsx")
    const order = [
      "Réservation en ligne",
      "Votre lien de réservation",
      "Copier le lien",
      "Intégrer la réservation sur votre site",
      "Copier le code d'intégration",
    ].map((label) => ui.indexOf(label))
    for (const i of order) expect(i).toBeGreaterThan(-1)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  it("Paramètres : deux copies distinctes (URL seule vs code div data-* / script)", () => {
    const ui = read("components/admin/settings/online-booking-settings.tsx")
    expect(ui).toMatch(/copy\("link", bookingUrl\)/)
    expect(ui).toMatch(/copy\("code", scriptSnippet\)/)
    expect(ui).not.toMatch(/copy\("link", scriptSnippet\)/)
    const page = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(page).toMatch(/resolveDashboardPrimaryMode\(await getBookingDistributionMode\(tenant\.id\)\) === "widget"/)
    expect(page).toMatch(/slug: tenant\.slug/)
    const a = buildWidgetPrimaryAction({ slug: "tenant-a", active: true, scriptSnippet: snippet, origin: ORIGIN })
    expect(a.bookingUrl).not.toMatch(/<|>|data-|script/i)
    expect(a.scriptSnippet).toContain('data-detailflow-slug="tenant-a"')
  })

  it("widget inactif → lien public toujours fourni + code d'intégration conservé", () => {
    const a = buildWidgetPrimaryAction({ slug: "tenant-a", active: false, scriptSnippet: snippet, origin: ORIGIN })
    expect(a.active).toBe(false)
    expect(a.bookingUrl).toBe("https://www.detailflow.fr/p/tenant-a/reservation")
    expect(a.scriptSnippet).toContain('data-detailflow-slug="tenant-a"')
  })

  it("aucun slug de tenant codé en dur dans la logique widget", () => {
    for (const f of [
      "components/admin/widget-action-button.tsx",
      "components/admin/settings/online-booking-settings.tsx",
      "lib/admin/primary-action.ts",
    ]) {
      const src = read(f).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
      expect(src).not.toMatch(/cleanyzer|spirit|rozan|textile/i)
    }
  })

  it("« Voir mon site » : masqué en widget, inchangé en link / NULL", () => {
    const url = "https://www.detailflow.fr/p/demo"
    expect(resolveSiteLinkUrl("widget", url)).toBeNull()
    expect(resolveSiteLinkUrl("link", url)).toBe(url)
    expect(resolveSiteLinkUrl(null, url)).toBe(url)
    expect(resolveSiteLinkUrl(undefined, url)).toBe(url)
    for (const key of ["cleanyzer", "spirit-acs", "rozan"]) expect(resolveSiteLinkUrl(key, url)).toBe(url)
  })

  it("isolation : le lien ne porte que le slug du tenant authentifié (encodé)", () => {
    const a = buildWidgetPrimaryAction({ slug: "tenant-a", active: true, scriptSnippet: snippet, origin: ORIGIN })
    const b = buildWidgetPrimaryAction({ slug: "tenant-b", active: true, scriptSnippet: snippet, origin: ORIGIN })
    expect(a.bookingUrl).not.toContain("tenant-b")
    expect(b.bookingUrl).not.toContain("tenant-a")
    const evil = buildWidgetPrimaryAction({ slug: "x/../y?tenant=z", active: true, scriptSnippet: "", origin: ORIGIN })
    expect(evil.bookingUrl).toBe("https://www.detailflow.fr/p/x%2F..%2Fy%3Ftenant%3Dz/reservation")
    const layout = read("app/admin/(dashboard)/layout.tsx")
    expect(layout).toMatch(/slug: ctx\.tenant\.slug/)
    expect(layout).toMatch(/resolveSiteLinkUrl\(bookingDistributionMode/)
    const layoutCode = layout.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    expect(layoutCode).not.toMatch(/searchParams|cleanyzer/i)
  })
})

describe("activation et isolation", () => {
  it("bookingLinkEnabled=false + widget → module inactif", () => {
    expect(resolveDashboardPrimaryMode("widget")).toBe("widget")
    expect(isBookingLinkAccessible("BETA", { customSitePublished: false, bookingLinkEnabled: false })).toBe(false)
    expect(isBookingLinkAccessible("BETA", { customSitePublished: false, bookingLinkEnabled: true })).toBe(true)
    expect(isBookingLinkAccessible("SUSPENDED", { customSitePublished: false, bookingLinkEnabled: true })).toBe(false)
  })

  it("le code d'intégration ne porte que le slug du tenant", () => {
    const a = buildEmbedScriptSnippet("tenant-a", ROOT)
    const b = buildEmbedScriptSnippet("tenant-b", ROOT)
    expect(a).toContain('data-detailflow-slug="tenant-a"')
    expect(a).not.toContain("tenant-b")
    expect(b).not.toContain("tenant-a")
  })

  it("mode et slug résolus côté serveur depuis le tenant authentifié", () => {
    const layout = read("app/admin/(dashboard)/layout.tsx")
    expect(layout).toMatch(/getBookingDistributionMode\(ctx\.tenant\.id\)/)
    expect(read("lib/company/booking-distribution.ts")).toMatch(/WHERE id = \$\{companyId\}/)
  })
})
