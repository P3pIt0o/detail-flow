import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * L86 — Le bouton « Réserver » de `/carte` suit la même règle que `/reservation` : licence
 * `online_booking` vérifiée côté serveur, sauf pour les tunnels de réservation historiques.
 */

const h = vi.hoisted(() => ({
  allowed: false,
  customSiteKey: null as string | null,
  checks: [] as Array<[number, string]>,
}))

vi.mock("@/lib/tenant", () => ({
  resolvePublicRequestTenant: async () => ({
    id: 7,
    slug: "alpha",
    name: "Alpha Detailing",
    status: "ACTIVE",
    bookingMode: "LIVE",
    customSiteKey: h.customSiteKey,
    onboardingIntent: "public_page",
    brandPrimary: null,
    logoUrl: null,
    siteContent: null,
  }),
  tenantAcceptsBookings: () => true,
}))
vi.mock("@/lib/licensing/enforce", () => ({
  canUseFeature: async (id: number, feature: string) => {
    h.checks.push([id, feature])
    return h.allowed
  },
}))
vi.mock("@/lib/public-contact", () => ({
  getPublicContact: async () => ({ name: "Alpha Detailing", phone: null, email: null, website: null, city: "Lyon" }),
}))
vi.mock("@/lib/booking/location", () => ({
  getLocationConfig: async () => ({ mobileEnabled: true, workshopEnabled: false }),
}))
vi.mock("@/lib/notifications/review-resolver", () => ({ resolveTenantReviewLink: async () => null }))

import { loadPublicDigitalCard } from "@/lib/digital-card.server"

const keys = async () => (await loadPublicDigitalCard())!.actions.map((a) => a.key)

beforeEach(() => {
  h.allowed = false
  h.customSiteKey = null
  h.checks.length = 0
})

describe("L86 bouton « Réserver »", () => {
  it("sans la licence online_booking : bouton masqué", async () => {
    expect(await keys()).not.toContain("book")
    expect(h.checks).toEqual([[7, "online_booking"]])
  })

  it("avec la licence : bouton affiché", async () => {
    h.allowed = true
    expect(await keys()).toContain("book")
  })

  it("tunnel historique : bouton conservé ; Spirit ACS : toujours masqué", async () => {
    h.customSiteKey = "rozan"
    expect(await keys()).toContain("book")
    h.customSiteKey = "spirit-acs"
    h.allowed = true
    expect(await keys()).not.toContain("book")
  })
})
