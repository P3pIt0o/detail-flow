import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { humanReservationUrl, humanSiteUrl, resolvePublicLink } from "@/lib/admin/public-link"
import { buildWidgetPrimaryAction, resolveSiteLinkUrl } from "@/lib/admin/primary-action"
import { resolveTenantPublicPresentation } from "@/lib/super-admin/public-presentation"
import { tenantPublicUrl, tenantReservationUrl } from "@/lib/tenant-shared"
import { embedIframeSrc } from "@/lib/embed/snippet"

const ROOT = "detailflow.fr"
const SLUG = "syl-net-auto"
const SITE = "https://www.detailflow.fr/?tenant=syl-net-auto"
const RESA = "https://www.detailflow.fr/reservation?tenant=syl-net-auto"
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
const base = { intent: null, customSiteKey: null, status: "ACTIVE", rootDomain: ROOT } as const

describe("helpers canoniques", () => {
  it("tenantPublicUrl / tenantReservationUrl", () => {
    expect(tenantPublicUrl(SLUG, ROOT)).toBe(SITE)
    expect(tenantReservationUrl(SLUG, ROOT)).toBe(RESA)
  })
})

describe("syl-net-auto : mêmes URLs partout, jamais /p/", () => {
  const all: Record<string, string | null | undefined> = {
    "header Copier mon lien": resolvePublicLink({ ...base, slug: SLUG })?.url,
    "Voir mon site": resolveSiteLinkUrl("link", resolvePublicLink({ ...base, slug: SLUG })?.url ?? null),
    "dashboard / StartFlowCard site": humanSiteUrl(SLUG, ROOT),
    "dashboard / StartFlowCard réservation": humanReservationUrl(SLUG, ROOT),
    "Ma réservation": humanReservationUrl(SLUG, ROOT),
    "lien de réservation booking_only": resolvePublicLink({ ...base, slug: SLUG, intent: "booking_only" })?.url,
    "widget lien direct": buildWidgetPrimaryAction({ slug: SLUG, active: true, scriptSnippet: "", rootDomain: ROOT }).bookingUrl,
    "Super Admin site": resolveTenantPublicPresentation({ slug: SLUG, onboardingIntent: null, customSiteKey: null, rootDomain: ROOT }).publicUrl,
    "Super Admin réservation": resolveTenantPublicPresentation({ slug: SLUG, onboardingIntent: "booking_only", customSiteKey: null, rootDomain: ROOT }).publicUrl,
  }

  it("valeurs attendues", () => {
    expect(all["header Copier mon lien"]).toBe(SITE)
    expect(all["Voir mon site"]).toBe(SITE)
    expect(all["dashboard / StartFlowCard site"]).toBe(SITE)
    expect(all["dashboard / StartFlowCard réservation"]).toBe(RESA)
    expect(all["Ma réservation"]).toBe(RESA)
    expect(all["lien de réservation booking_only"]).toBe(RESA)
    expect(all["widget lien direct"]).toBe(RESA)
    expect(all["Super Admin site"]).toBe(SITE)
    expect(all["Super Admin réservation"]).toBe(RESA)
  })

  it("aucun lien HUMAN-FACING ne contient /p/syl-net-auto", () => {
    for (const [name, url] of Object.entries(all)) {
      expect(url, name).toBeTruthy()
      expect(url, name).not.toContain("/p/syl-net-auto")
    }
  })

  it("les pages Admin passent les helpers centraux (dashboard, Ma réservation)", () => {
    const dash = stripComments(read("app/admin/(dashboard)/page.tsx"))
    expect(dash).toMatch(/reservationUrl=\{humanReservationUrl\(company\.slug, rootDomain\)\}/)
    expect(dash).toMatch(/pageUrl=\{humanSiteUrl\(company\.slug, rootDomain\)\}/)
    expect(stripComments(read("app/admin/(dashboard)/ma-reservation/page.tsx"))).toMatch(/humanReservationUrl\(tenant\.slug, rootDomain\)/)
  })
})

describe("domaine personnalisé (Spirit ACS) inchangé", () => {
  it("site = domaine custom, réservation = domaine custom + /reservation", () => {
    expect(humanSiteUrl("spirit-acs", ROOT)).toBe("https://www.spiritacs.com")
    expect(humanReservationUrl("spirit-acs", ROOT)).toBe("https://www.spiritacs.com/reservation")
    expect(resolvePublicLink({ ...base, slug: "spirit-acs" })?.url).toBe("https://www.spiritacs.com")
  })
})

describe("SUSPENDED / ARCHIVED inchangés", () => {
  it("null", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"]) {
      expect(resolvePublicLink({ ...base, slug: SLUG, status })).toBeNull()
      expect(resolvePublicLink({ ...base, slug: SLUG, status, intent: "booking_only" })).toBeNull()
    }
  })
})

describe("garde anti-régression : pas de /p/<slug> dans les liens HUMAN-FACING", () => {
  // INTERDIT : générateurs / consommateurs de liens copiés, ouverts ou partagés.
  const FORBIDDEN = [
    "lib/admin/public-link.ts",
    "lib/admin/primary-action.ts",
    "lib/super-admin/public-presentation.ts",
    "app/admin/(dashboard)/page.tsx",
    "app/admin/(dashboard)/layout.tsx",
    "app/admin/(dashboard)/ma-reservation/page.tsx",
    "components/admin/start-flow-card.tsx",
    "components/admin/widget-action-button.tsx",
  ]

  it.each(FORBIDDEN)("%s : ni /p/ construit à la main, ni publicPageUrl/publicReservationUrl", (file) => {
    const code = stripComments(read(file))
    expect(code).not.toMatch(/`[^`]*\/p\/\$\{/)
    expect(code).not.toMatch(/["']\/p\//)
    expect(code).not.toMatch(/\bpublicPageUrl\(|\bpublicReservationUrl\(/)
  })

  it("AUTORISÉ : embed / middleware restent sur /p/<slug> (technique)", () => {
    expect(embedIframeSrc(SLUG, ROOT)).toBe("https://www.detailflow.fr/p/syl-net-auto/reservation?embed=1")
    expect(read("middleware.ts")).toMatch(/parsePublicPagePath/)
  })
})
