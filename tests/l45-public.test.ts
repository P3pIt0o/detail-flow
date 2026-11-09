import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * L45 — C1 : `/carte` et la vCard du tenant A n'utilisent que les données de A ;
 * tenant inconnu / suspendu / carte désactivée → 404. Tenant et lectures mockés.
 */

type T = Record<string, unknown>
const h = vi.hoisted(() => ({
  current: null as T | null,
  calls: [] as Array<[string, unknown]>,
}))

const TENANTS: Record<string, T> = {
  a: {
    id: 1,
    slug: "a",
    name: "Alpha Detailing",
    status: "ACTIVE",
    bookingMode: "LIVE",
    customSiteKey: null,
    onboardingIntent: "public_page",
    brandPrimary: "#E11D48",
    logoUrl: "logos/a.png",
    city: "Lyon",
    siteContent: { footer: { tagline: "Detailing premium" } },
  },
  b: {
    id: 2,
    slug: "b",
    name: "Bravo Clean",
    status: "ACTIVE",
    bookingMode: "LIVE",
    customSiteKey: null,
    onboardingIntent: "public_page",
    brandPrimary: null,
    logoUrl: null,
    city: "Paris",
    siteContent: null,
  },
}
const CONTACTS: Record<number, T> = {
  1: { name: "Alpha Detailing", phone: "06 11 11 11 11", email: "a@alpha.fr", website: "https://alpha.fr", city: "Lyon" },
  2: { name: "Bravo Clean", phone: "01 22 22 22 22", email: "b@bravo.fr", website: null, city: "Paris" },
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("@/lib/tenant", () => ({
  getCurrentTenant: async () => h.current,
  tenantAcceptsBookings: (t: T) => t.status !== "SUSPENDED" && t.bookingMode !== "DISABLED",
}))
vi.mock("@/lib/public-contact", () => ({
  getPublicContact: async () => CONTACTS[(h.current as { id: number }).id],
}))
vi.mock("@/lib/booking/location", () => ({
  getLocationConfig: async (id: number) => {
    h.calls.push(["location", id])
    return id === 1
      ? { mobileEnabled: false, workshopEnabled: true, workshopAddress: "1 rue A", workshopPostalCode: "69001", workshopCity: "Lyon" }
      : { mobileEnabled: true, workshopEnabled: false, workshopAddress: "9 rue privée", workshopPostalCode: "75001", workshopCity: "Paris" }
  },
}))
vi.mock("@/lib/notifications/review-resolver", () => ({
  resolveTenantReviewLink: async (id: number) => {
    h.calls.push(["review", id])
    return id === 1 ? "https://g.page/r/alpha/review" : null
  },
}))

import { loadPublicDigitalCard } from "@/lib/digital-card.server"
import { GET } from "@/app/carte/contact/route"
import CartePage from "@/app/carte/page"

beforeEach(() => {
  h.current = null
  h.calls.length = 0
})

describe("loadPublicDigitalCard", () => {
  it("tenant A : uniquement les données de A (lectures filtrées par son id)", async () => {
    h.current = TENANTS.a
    const d = await loadPublicDigitalCard()
    expect(d).not.toBeNull()
    expect(h.calls).toEqual(expect.arrayContaining([["location", 1], ["review", 1]]))
    expect(h.calls.every(([, id]) => id === 1)).toBe(true)
    expect(d!.name).toBe("Alpha Detailing")
    expect(d!.line).toBe("Detailing premium · Lyon")
    expect(d!.logoSrc).toBe("/api/company-logo?company=a")
    expect(d!.card.accent).toBe("#E11D48")
    expect(d!.actions.map((x) => x.key)).toEqual(["book", "call", "whatsapp", "directions", "review", "contact"])
    expect(JSON.stringify(d)).not.toMatch(/Bravo|bravo|22 22/)
    expect(d!.vcard).toContain("ADR;TYPE=WORK:;;1 rue A;Lyon;;69001;")
  })

  it("tenant B (mobile, fixe, sans avis ni logo) : boutons et adresse privée masqués", async () => {
    h.current = TENANTS.b
    const d = await loadPublicDigitalCard()
    expect(h.calls.every(([, id]) => id === 2)).toBe(true)
    expect(d!.actions.map((x) => x.key)).toEqual(["book", "call", "contact"])
    expect(d!.logoSrc).toBeNull()
    expect(d!.vcard).not.toContain("ADR")
    expect(d!.vcard).not.toContain("privée")
    expect(JSON.stringify(d)).not.toMatch(/Alpha|alpha/)
  })

  it("réservation désactivée ou Spirit ACS → pas de bouton « Réserver »", async () => {
    h.current = { ...TENANTS.a, bookingMode: "DISABLED" }
    expect((await loadPublicDigitalCard())!.actions.map((x) => x.key)).not.toContain("book")
    h.current = { ...TENANTS.a, customSiteKey: "spirit-acs" }
    expect((await loadPublicDigitalCard())!.actions.map((x) => x.key)).not.toContain("book")
  })

  it("tenant inconnu, suspendu ou carte désactivée → null, sans lecture", async () => {
    expect(await loadPublicDigitalCard()).toBeNull()
    h.current = { ...TENANTS.a, status: "SUSPENDED" }
    expect(await loadPublicDigitalCard()).toBeNull()
    h.current = { ...TENANTS.a, siteContent: { digitalCard: { enabled: false } } }
    expect(await loadPublicDigitalCard()).toBeNull()
    expect(h.calls).toHaveLength(0)
  })
})

describe("route vCard /carte/contact", () => {
  it("tenant A → vCard de A, en-têtes de téléchargement", async () => {
    h.current = TENANTS.a
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/vcard; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="a.vcf"')
    expect(res.headers.get("cache-control")).toBe("no-store")
    const body = await res.text()
    expect(body).toContain("FN:Alpha Detailing")
    expect(body).not.toContain("Bravo")
  })

  it("tenant null / suspendu / désactivé → 404", async () => {
    expect((await GET()).status).toBe(404)
    h.current = { ...TENANTS.a, status: "SUSPENDED" }
    expect((await GET()).status).toBe(404)
    h.current = { ...TENANTS.b, siteContent: { digitalCard: { enabled: false } } }
    expect((await GET()).status).toBe(404)
  })
})

describe("page /carte", () => {
  it("tenant absent ou carte désactivée → notFound()", async () => {
    await expect(CartePage()).rejects.toThrow("NEXT_NOT_FOUND")
    h.current = { ...TENANTS.a, siteContent: { digitalCard: { enabled: false } } }
    await expect(CartePage()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("contrôle source : noindex, hors du groupe (site)", () => {
    const src = readFileSync(join(process.cwd(), "app/carte/page.tsx"), "utf8")
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
  })
})
