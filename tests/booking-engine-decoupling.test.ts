import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  isBookingLinkAccessible,
  isEmbedBlocked,
  showsCustomSiteBookingAdmin,
  usesLegacyBookingWizard,
} from "@/lib/company/publication-shared"

const reservationPage = readFileSync(join(process.cwd(), "app/(site)/reservation/page.tsx"), "utf8")
const OFF_OFF = { customSitePublished: false, bookingLinkEnabled: false }
const OFF_ON = { customSitePublished: false, bookingLinkEnabled: true }
const ON_ON = { customSitePublished: true, bookingLinkEnabled: true }
const ON_OFF = { customSitePublished: true, bookingLinkEnabled: false }

describe("Moteur de réservation indépendant de customSitePublished", () => {
  it("site OFF + booking OFF : admin accessible, /book et widget fermés", () => {
    expect(showsCustomSiteBookingAdmin("cleanyzer")).toBe(true)
    expect(isBookingLinkAccessible("BETA", OFF_OFF)).toBe(false)
    expect(isEmbedBlocked("cleanyzer", "BETA", OFF_OFF)).toBe(true)
  })

  it("site OFF + booking ON : /book et widget ouverts, nouveau moteur", () => {
    expect(isBookingLinkAccessible("BETA", OFF_ON)).toBe(true)
    expect(isEmbedBlocked("cleanyzer", "BETA", OFF_ON)).toBe(false)
    expect(usesLegacyBookingWizard("cleanyzer")).toBe(false)
  })

  it("site ON + booking ON : même moteur (le choix ne lit que customSiteKey)", () => {
    expect(isEmbedBlocked("cleanyzer", "BETA", ON_ON)).toBe(false)
    expect(usesLegacyBookingWizard("cleanyzer")).toBe(false)
    expect(reservationPage).not.toMatch(/resolveCustomSite|customSitePublished/)
    expect(reservationPage).toContain("usesLegacyBookingWizard(requestTenant?.customSiteKey)")
  })

  it("booking ON mais entreprise suspendue/archivée : widget fermé", () => {
    expect(isEmbedBlocked("cleanyzer", "SUSPENDED", OFF_ON)).toBe(true)
    expect(isEmbedBlocked("cleanyzer", "ARCHIVED", OFF_ON)).toBe(true)
  })

  it("Spirit ACS et Rozan : tunnel historique conservé", () => {
    expect(usesLegacyBookingWizard("spirit-acs")).toBe(true)
    expect(usesLegacyBookingWizard("rozan")).toBe(true)
    // Leur site passe par /reservation hors widget : jamais bloqué par isEmbedBlocked.
    expect(reservationPage).toMatch(/isEmbed &&\s*requestTenant &&\s*isEmbedBlocked/)
    expect(isBookingLinkAccessible("ACTIVE", ON_OFF)).toBe(false)
  })

  it("tenant standard : nouveau moteur, widget jamais bloqué", () => {
    expect(usesLegacyBookingWizard(null)).toBe(false)
    expect(usesLegacyBookingWizard("")).toBe(false)
    expect(isEmbedBlocked(null, "ACTIVE", OFF_OFF)).toBe(false)
    expect(isEmbedBlocked("  ", "ACTIVE", OFF_OFF)).toBe(false)
  })

  it("isolation tenant : décision issue du seul tenant résolu côté serveur", () => {
    expect(reservationPage).toContain("getPublicationFlags(requestTenant.id)")
    expect(reservationPage).not.toMatch(/searchParams[^\n]*(tenant|slug|companyId)/)
  })
})
