import { describe, expect, it } from "vitest"
import { resolveDashboardPrimaryMode } from "@/lib/admin/primary-action"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { isBookingLinkAccessible } from "@/lib/company/publication-shared"
import { buildEmbedScriptSnippet } from "@/lib/embed/snippet"

const ROOT = "detailflow.fr"

describe("action principale du dashboard", () => {
  it("Cleanyzer → widget", () => {
    expect(resolveDashboardPrimaryMode("cleanyzer")).toBe("widget")
  })

  it("Spirit ACS et Rozan → comportement historique (copie du lien)", () => {
    expect(resolveDashboardPrimaryMode("spirit-acs")).toBe("copy_link")
    expect(resolveDashboardPrimaryMode("rozan")).toBe("copy_link")
  })

  it("tenant standard (site ou booking_only) → comportement historique", () => {
    expect(resolveDashboardPrimaryMode(null)).toBe("copy_link")
    expect(resolveDashboardPrimaryMode(undefined)).toBe("copy_link")
    const site = resolvePublicLink({ slug: "demo", intent: "public_page", customSiteKey: null, status: "ACTIVE", rootDomain: ROOT })
    const booking = resolvePublicLink({ slug: "demo", intent: "booking_only", customSiteKey: null, status: "ACTIVE", rootDomain: ROOT })
    expect(site?.kind).toBe("public_page")
    expect(booking?.kind).toBe("reservation")
  })

  it("le mode ne dépend que du customSiteKey, jamais de customSitePublished", () => {
    // La signature ne reçoit aucun flag de publication : impossible d'en dépendre.
    expect(resolveDashboardPrimaryMode.length).toBe(1)
  })

  it("bookingLinkEnabled=false → widget non actif", () => {
    expect(isBookingLinkAccessible("BETA", { customSitePublished: false, bookingLinkEnabled: false })).toBe(false)
    expect(isBookingLinkAccessible("BETA", { customSitePublished: false, bookingLinkEnabled: true })).toBe(true)
    expect(isBookingLinkAccessible("SUSPENDED", { customSitePublished: false, bookingLinkEnabled: true })).toBe(false)
  })

  it("isolation : le code d'intégration ne porte que le slug du tenant", () => {
    const a = buildEmbedScriptSnippet("cleanyzer", ROOT)
    const b = buildEmbedScriptSnippet("autre-tenant", ROOT)
    expect(a).toContain('data-detailflow-slug="cleanyzer"')
    expect(a).not.toContain("autre-tenant")
    expect(b).not.toContain("cleanyzer")
  })
})
