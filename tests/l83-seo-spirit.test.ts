import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildTenantPageMetadata } from "@/lib/seo/tenant-metadata"
import { tenantSeoIdentity, tenantCanonicalUrl } from "@/lib/seo/tenant-url"
import { sitemapEntriesForHost } from "@/lib/seo/host-sitemap"
import { tenantCanonicalHost } from "@/lib/tenant-shared"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"
import { GET } from "@/app/favicon.ico/route"
import { SPIRIT_PAGE_META, SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"

const tenantRef = vi.hoisted(() => ({ tenant: null as Record<string, unknown> | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: async () => tenantRef.tenant }))
vi.mock("@/lib/public-contact", () => ({ getPublicHours: async () => [] }))
vi.mock("@/lib/reviews/public", () => ({ getTenantGoogleRating: async () => null }))
vi.mock("@/lib/licensing/server", () => ({ hasFeature: async () => true }))
vi.mock("@/lib/public-page/config", () => ({ getEffectivePublicPageForCurrentTenant: async () => null }))
import { buildTenantMetadata, buildTenantLocalBusiness } from "@/lib/seo/tenant-seo.server"

const mkTenant = (slug: string, customSiteKey: string | null) => ({
  id: `id-${slug}`,
  slug,
  name: slug === "spirit-acs" ? "Spirit ACS" : "Autre",
  customSiteKey,
  logoUrl: null,
  phone: null,
  email: null,
  socialLinks: null,
})

const root = process.cwd()
const bytes = (rel: string) => readFileSync(path.join(root, rel))
const favicon = async (host: string | null) => {
  const res = await GET(new Request("https://x.test/favicon.ico", host ? { headers: { host } } : undefined))
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}

const spiritIdentity = tenantSeoIdentity({ slug: "spirit-acs", publicDomain: tenantCanonicalHost("spirit-acs") })
const base = {
  identity: spiritIdentity,
  path: "/",
  title: "Titre | Spirit ACS",
  description: "Description",
  siteName: "Spirit ACS",
  imageUrl: "https://www.spiritacs.com/x.png",
}

describe("L83 favicon par hôte", () => {
  it.each(["spiritacs.com", "www.spiritacs.com", "WWW.SpiritACS.com:443"])("%s → icône Spirit", async (h) => {
    const { res, body } = await favicon(h)
    expect(res.status).toBe(200)
    expect(body.equals(bytes("public/custom-sites/spirit-acs/icon.png"))).toBe(true)
  })
  it.each(["www.detailflow.fr", "evil.com", "a.com/x", null])("%s → icône DetailFlow", async (h) => {
    const { body } = await favicon(h)
    expect(body.equals(bytes("public/icons/icon-192.png"))).toBe(true)
  })
  it("Cleanyzer inchangé : pas de /favicon.ico (404 comme avant)", async () => {
    const { res } = await favicon("cleanyzer.fr")
    expect(res.status).toBe(404)
  })
})

describe("L83 métadonnées sans DetailFlow", () => {
  it("site perso : balises plateforme neutralisées", () => {
    const m = buildTenantPageMetadata({ ...base, neutralizePlatformTags: true })
    expect(m.manifest).toBeNull()
    expect(m.keywords).toBeNull()
    expect(m.generator).toBeNull()
    expect(JSON.stringify(m)).not.toMatch(/detailflow|v0\.app/i)
  })
  it("sans l'option : aucune clé plateforme ajoutée (DetailFlow inchangé)", () => {
    const m = buildTenantPageMetadata(base)
    for (const k of ["manifest", "applicationName", "appleWebApp", "authors", "creator", "keywords", "generator"]) {
      expect(k in m, k).toBe(false)
    }
  })
  it("le layout racine garde le manifest DetailFlow", () => {
    expect(readFileSync(path.join(root, "app/layout.tsx"), "utf8")).toContain("manifest: '/manifest.webmanifest'")
  })
})

describe("L83 métadonnées via buildTenantMetadata", () => {
  it("Spirit neutralisé, Cleanyzer et hors tenant inchangés", async () => {
    tenantRef.tenant = mkTenant("spirit-acs", "spirit-acs")
    const spirit = await buildTenantMetadata({ path: "/", title: "T", description: "D" })
    expect(spirit.manifest).toBeNull()
    expect(JSON.stringify(spirit)).not.toMatch(/detailflow/i)
    tenantRef.tenant = mkTenant("cleanyzer", "cleanyzer")
    const clean = await buildTenantMetadata({ path: "/", title: "T", description: "D" })
    expect("manifest" in clean).toBe(false)
    tenantRef.tenant = null
    const none = await buildTenantMetadata({ path: "/", title: "T", description: "D" })
    expect("manifest" in none).toBe(false)
  })
})

describe("L83 JSON-LD logo", () => {
  it("Spirit : logo absolu, sans areaServed ni aggregateRating", async () => {
    tenantRef.tenant = mkTenant("spirit-acs", "spirit-acs")
    const ld = (await buildTenantLocalBusiness()) as Record<string, unknown>
    expect(ld.logo).toBe("https://www.spiritacs.com/custom-sites/spirit-acs/icon.png")
    expect("areaServed" in ld).toBe(false)
    expect("aggregateRating" in ld).toBe(false)
  })
  it("Cleanyzer sans logoUrl : pas de logo ajouté", async () => {
    tenantRef.tenant = mkTenant("cleanyzer", "cleanyzer")
    const ld = (await buildTenantLocalBusiness()) as Record<string, unknown>
    expect(ld.logo).toBeUndefined()
  })
})

describe("L83 textes", () => {
  const catalog = getPublicSiteCatalog("spirit-acs" as never)!
  const pages = [
    ...Object.values(SPIRIT_PAGE_META).map((p) => ({ t: p.title, d: p.description })),
    ...SPIRIT_SERVICES.map((s) => ({ t: s.metaTitle, d: s.metaDescription })),
  ]
  it("titres ≤ 60, descriptions 140-160", () => {
    expect(pages.length).toBeGreaterThan(8)
    for (const { t, d } of pages) {
      expect(t.length, t).toBeLessThanOrEqual(60)
      expect(d.length, d).toBeGreaterThanOrEqual(140)
      expect(d.length, d).toBeLessThanOrEqual(160)
    }
  })
  it("le catalogue Spirit existe", () => expect(catalog).toBeTruthy())
})

describe("L83 sitemap", () => {
  it("Spirit : aucun lastmod ; les autres sitemaps gardent le leur", () => {
    for (const e of sitemapEntriesForHost("spiritacs.com")) expect(e.lastModified, e.url).toBeUndefined()
    for (const h of ["cleanyzer.fr", "www.detailflow.fr"]) {
      for (const e of sitemapEntriesForHost(h)) expect(e.lastModified, `${h} ${e.url}`).toBeDefined()
    }
  })
  it("description d'accueil sans promesse « gratuit »", () => {
    expect(SPIRIT_PAGE_META.home.description).not.toMatch(/gratuit/i)
  })
  it("URL du sitemap = canonique de chaque page Spirit", () => {
    const catalog = getPublicSiteCatalog("spirit-acs" as never)!
    const urls = sitemapEntriesForHost("spiritacs.com").map((e) => e.url)
    const expected = listSitemapPaths(catalog).map(({ path: p }) => tenantCanonicalUrl(p, spiritIdentity))
    expect(urls).toEqual(expected)
    expect(urls).toContain("https://www.spiritacs.com/")
  })
  it("cloisonnement Spirit / Cleanyzer", () => {
    expect(sitemapEntriesForHost("spiritacs.com").some((e) => /cleanyzer/.test(e.url))).toBe(false)
    expect(sitemapEntriesForHost("cleanyzer.fr").some((e) => /spiritacs/.test(e.url))).toBe(false)
  })
})
