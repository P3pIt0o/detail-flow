import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  resolveHost,
  tenantCanonicalHost,
  tenantCanonicalPathPrefix,
  tenantPublicPathUrl,
  publicPagePathRedirect,
  publicPageDomainRedirect,
  TENANT_PATH_CANONICAL,
} from "@/lib/tenant-shared"
import { tenantCanonicalUrl, tenantSeoIdentity } from "@/lib/seo/tenant-url"
import { humanSiteUrl } from "@/lib/admin/public-link"
import sitemap from "@/app/sitemap"
import { getPublicSiteCatalog, listSitemapPaths } from "@/lib/public-site/provider"
import { CLZ_SERVICE_PAGES, CLZ_ZONE_PAGE } from "@/components/custom-sites/cleanyzer/seo-content"

const ROOT = "detailflow.fr"
const CLZ = "https://www.cleanyzer.fr"
const params = (q = "") => new URLSearchParams(q)

describe("L50 C1 — cleanyzer.fr résout le tenant cleanyzer", () => {
  it("apex, www et port", () => {
    for (const h of ["cleanyzer.fr", "www.cleanyzer.fr", "www.cleanyzer.fr:443", "WWW.Cleanyzer.FR"]) {
      expect(resolveHost(h, ROOT)).toEqual({ kind: "tenant", slug: "cleanyzer" })
    }
  })

  it("domaines voisins ou piégés → vitrine (table fermée)", () => {
    for (const h of ["cleanyzer.com", "notcleanyzer.fr", "cleanyzer.fr.evil.com", "evil-cleanyzer.fr"]) {
      expect(resolveHost(h, ROOT)).toEqual({ kind: "root" })
    }
  })

  it("?tenant= sur cleanyzer.fr ne change pas de tenant", () => {
    expect(resolveHost("www.cleanyzer.fr", ROOT, "autre")).toEqual({ kind: "tenant", slug: "cleanyzer" })
  })
})

describe("L50 C2 — non-régression Spirit, Rozan, tenants standards", () => {
  it("Spirit : résolution et hôte canonique inchangés", () => {
    expect(resolveHost("www.spiritacs.com", ROOT)).toEqual({ kind: "tenant", slug: "spirit-acs" })
    expect(tenantCanonicalHost("spirit-acs")).toBe("www.spiritacs.com")
  })

  it("/p/spirit-acs : aucune redirection (réécriture conservée)", () => {
    for (const kind of ["root", "tenant", "preview"] as const) {
      expect(publicPageDomainRedirect("/p/spirit-acs", params(), kind)).toBeNull()
    }
    expect(publicPagePathRedirect("/p/spirit-acs", params())).toBeNull()
  })

  it("tenant standard : redirection L30 vers ?tenant= inchangée", () => {
    expect(publicPagePathRedirect("/p/autre/avis", params("a=1"))).toBe("/avis?a=1&tenant=autre")
    expect(publicPageDomainRedirect("/p/autre/avis", params(), "root")).toBeNull()
    expect(resolveHost("www.detailflow.fr", ROOT, "autre")).toEqual({ kind: "tenant", slug: "autre" })
  })

  it("Rozan reste en ?tenant= et sans domaine", () => {
    expect(tenantCanonicalHost("rozancleaningservice")).toBeNull()
    expect(tenantPublicPathUrl("/demande/T", "rozancleaningservice", ROOT)).toBe(
      "https://www.detailflow.fr/demande/T?tenant=rozancleaningservice",
    )
  })
})

describe("L50 C3 — liens, canonique et sitemap sur www.cleanyzer.fr", () => {
  const identity = tenantSeoIdentity({
    slug: "cleanyzer",
    publicDomain: tenantCanonicalHost("cleanyzer"),
    publicPathPrefix: tenantCanonicalPathPrefix("cleanyzer"),
  })

  it("hôte canonique et préfixe /p/ abandonné", () => {
    expect(tenantCanonicalHost("cleanyzer")).toBe("www.cleanyzer.fr")
    expect(tenantCanonicalPathPrefix("cleanyzer")).toBeNull()
    expect(TENANT_PATH_CANONICAL.has("cleanyzer")).toBe(false)
  })

  it("canonique, liens e-mail et lien public admin sans ?tenant=", () => {
    expect(tenantCanonicalUrl("/", identity)).toBe(`${CLZ}/`)
    expect(tenantCanonicalUrl("/prestations/x", identity)).toBe(`${CLZ}/prestations/x`)
    expect(tenantPublicPathUrl("/demande/T", "cleanyzer", ROOT)).toBe(`${CLZ}/demande/T`)
    expect(humanSiteUrl("cleanyzer", ROOT)).toBe(CLZ)
  })

  it("sitemap : accueil + prestations + zone sur www.cleanyzer.fr, plus de /p/cleanyzer", () => {
    const urls = sitemap().map((e) => e.url)
    const clz = urls.filter((u) => u.startsWith(CLZ))
    expect(clz).toContain(`${CLZ}/`)
    for (const p of CLZ_SERVICE_PAGES) expect(clz).toContain(`${CLZ}/prestations/${p.slug}`)
    expect(clz).toContain(`${CLZ}/${CLZ_ZONE_PAGE.slug}`)
    // Exactement les chemins du catalogue public, rien d'autre.
    const expected = listSitemapPaths(getPublicSiteCatalog("cleanyzer")!).map(({ path: p }) => tenantCanonicalUrl(p, identity))
    expect([...clz].sort()).toEqual([...expected].sort())
    for (const u of urls) {
      expect(u).not.toContain("/p/cleanyzer")
      expect(u).not.toContain("tenant=cleanyzer")
    }
  })

  it("indexation ouverte : cleanyzer retiré de la prépublication", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/seo/tenant-seo.server.ts"), "utf8")
    expect(src).toMatch(/PREPUBLICATION_NOINDEX_SITE_KEYS = new Set<string>\(\)/)
    expect(src).not.toMatch(/PREPUBLICATION_NOINDEX_SITE_KEYS = new Set\(\["cleanyzer"\]\)/)
  })
})

describe("L50 C4 — redirection 308 /p/cleanyzer → www.cleanyzer.fr", () => {
  it("accueil et sous-chemins, paramètres conservés", () => {
    expect(publicPageDomainRedirect("/p/cleanyzer", params(), "root")).toBe(`${CLZ}/`)
    expect(publicPageDomainRedirect("/p/cleanyzer/", params(), "root")).toBe(`${CLZ}/`)
    expect(publicPageDomainRedirect("/p/cleanyzer/prestations/x", params("a=1"), "root")).toBe(
      `${CLZ}/prestations/x?a=1`,
    )
    expect(publicPageDomainRedirect("/p/cleanyzer/reservation", params(), "tenant")).toBe(`${CLZ}/reservation`)
  })

  it("embed, preview, autres slugs → aucune redirection", () => {
    expect(publicPageDomainRedirect("/p/cleanyzer", params("embed=1"), "root")).toBeNull()
    expect(publicPageDomainRedirect("/p/cleanyzer/reservation", params(), "preview")).toBeNull()
    expect(publicPageDomainRedirect("/p/spirit-acs", params(), "root")).toBeNull()
    expect(publicPageDomainRedirect("/p/autre", params(), "root")).toBeNull()
    expect(publicPageDomainRedirect("/reservation", params(), "tenant")).toBeNull()
  })

  it("la cible n'est jamais en /p/ (pas de boucle)", () => {
    const t = publicPageDomainRedirect("/p/cleanyzer/p/cleanyzer", params(), "root")
    expect(t === null || !new URL(t).pathname.startsWith("/p/")).toBe(true)
  })

  it("L30 laisse /p/cleanyzer au nouveau mécanisme (pas de ?tenant=)", () => {
    expect(publicPagePathRedirect("/p/cleanyzer/avis", params())).toBeNull()
  })

  it("le middleware appelle la redirection domaine avant L30, en 308", () => {
    const src = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8")
    const i = src.indexOf("publicPageDomainRedirect(path, req.nextUrl.searchParams, res.kind)")
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(src.indexOf("publicPagePathRedirect(path, req.nextUrl.searchParams)"))
    expect(src).toMatch(/NextResponse\.redirect\(domainRedirect, 308\)/)
  })
})
