import { beforeEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"

/**
 * L25 — la prépublication Cleanyzer (noindex) ne touche AUCUN autre tenant :
 * Spirit ACS et Rozan restent indexables et présents au sitemap, sur les deux
 * chemins qui produisent la directive robots (pages et métadonnées).
 */
const tenant = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: async () => tenant.current }))
vi.mock("@/lib/licensing/server", () => ({ hasFeature: async () => true }))
vi.mock("@/lib/public-page/config", () => ({ getEffectivePublicPageForCurrentTenant: async () => null }))
vi.mock("@/lib/public-contact", () => ({ getPublicHours: async () => null }))
vi.mock("@/lib/reviews/public", () => ({ getTenantGoogleRating: async () => null }))

const TENANTS = {
  spirit: { id: 1, slug: "spirit-acs", customSiteKey: "spirit-acs", name: "Spirit ACS" },
  rozan: { id: 2, slug: "rozancleaningservice", customSiteKey: "rozan", name: "Rozan" },
  cleanyzer: { id: 3, slug: "cleanyzer", customSiteKey: "cleanyzer", name: "CLEANYZER" },
} as const

async function robotsFor(key: keyof typeof TENANTS) {
  tenant.current = { ...TENANTS[key] }
  vi.resetModules() // `cache()` de resolveTenantSeo : un module neuf par tenant.
  const seo = await import("@/lib/seo/tenant-seo.server")
  const page = await seo.resolvePublicPageRobots()
  const meta = await seo.buildTenantMetadata({ path: "/", title: "T", description: "D" })
  return { page, meta: meta.robots }
}

const noindex = (r: unknown) => typeof r === "object" && r !== null && (r as { index?: boolean }).index === false

describe("Robots par tenant", () => {
  beforeEach(() => {
    tenant.current = null
  })
  it.each(["spirit", "rozan"] as const)("%s reste indexable (pages et métadonnées)", async (key) => {
    const { page, meta } = await robotsFor(key)
    expect(noindex(page), "resolvePublicPageRobots").toBe(false)
    expect(noindex(meta), "buildTenantMetadata").toBe(false)
  })
  it("Cleanyzer seul est en noindex,follow (pages et métadonnées)", async () => {
    const { page, meta } = await robotsFor("cleanyzer")
    expect(page).toEqual({ index: false, follow: true })
    expect(meta).toEqual({ index: false, follow: true })
  })
})

describe("Sitemap", () => {
  const urls = sitemap().map((e) => e.url)
  it("Spirit ACS et Rozan présents", () => {
    expect(urls.some((u) => u.startsWith("https://www.spiritacs.com"))).toBe(true)
    expect(urls.some((u) => /[?&]tenant=rozancleaningservice/.test(u))).toBe(true)
  })
  it("aucune URL Cleanyzer", () => {
    expect(urls.filter((u) => /cleanyzer/i.test(u))).toEqual([])
  })
})
