import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildTenantPageMetadata } from "@/lib/seo/tenant-metadata"
import { tenantSeoIdentity, tenantCanonicalUrl } from "@/lib/seo/tenant-url"
import { sitemapEntriesForHost } from "@/lib/seo/host-sitemap"
import { tenantCanonicalHost } from "@/lib/tenant-shared"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"
import { GET } from "@/app/favicon.ico/route"
import { SPIRIT_PAGE_META, SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"

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
  it("Cleanyzer garde la sienne, différente de Spirit", async () => {
    const { body } = await favicon("cleanyzer.fr")
    expect(body.equals(bytes("public/custom-sites/cleanyzer/icon.png"))).toBe(true)
    expect(body.equals(bytes("public/custom-sites/spirit-acs/icon.png"))).toBe(false)
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

describe("L83 JSON-LD logo", () => {
  it("logo Spirit absolu, sans areaServed ni aggregateRating", () => {
    const src = readFileSync(path.join(root, "lib/seo/tenant-seo.server.ts"), "utf8")
    expect(src).toContain("${SPIRIT_ICON}")
    expect(src).not.toMatch(/aggregateRating/)
    expect(src).toContain("areaServed: args?.areaServed ?? null")
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
  it("aucun lastmod (pas de fausse date)", () => {
    for (const h of ["spiritacs.com", "cleanyzer.fr", "www.detailflow.fr", null]) {
      for (const e of sitemapEntriesForHost(h)) expect(e.lastModified, `${h} ${e.url}`).toBeUndefined()
    }
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
