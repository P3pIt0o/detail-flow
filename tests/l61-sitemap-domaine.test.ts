import { describe, expect, it } from "vitest"
import { siteConfig } from "@/config/site"
import { sitemapEntriesForHost, robotsSitemapUrlForHost } from "@/lib/seo/host-sitemap"

const urls = (host: string | null) => sitemapEntriesForHost(host).map((e) => e.url)
const ROOT = siteConfig.seo.url.replace(/\/+$/, "")

describe("L61 sitemap par domaine", () => {
  it.each([
    ["www.spiritacs.com", "https://www.spiritacs.com"],
    ["spiritacs.com", "https://www.spiritacs.com"],
    ["WWW.Cleanyzer.fr:443", "https://www.cleanyzer.fr"],
    ["cleanyzer.fr", "https://www.cleanyzer.fr"],
  ])("domaine personnalisé %s → uniquement son hôte", (host, prefix) => {
    const list = urls(host)
    expect(list.length).toBeGreaterThan(0)
    for (const u of list) expect(u.startsWith(prefix), u).toBe(true)
    expect(list.some((u) => u.includes("detailflow") || u.includes("tenant="))).toBe(false)
  })

  it("cloisonnement spirit / cleanyzer", () => {
    expect(urls("spiritacs.com").some((u) => u.includes("cleanyzer") || u.includes("rozan"))).toBe(false)
    expect(urls("cleanyzer.fr").some((u) => u.includes("spiritacs") || u.includes("rozan"))).toBe(false)
  })

  it.each(["www.detailflow.fr", "detailflow.fr", "evil.com", "x.vercel.app", "", null])(
    "plateforme/inconnu %s → accueil + Rozan, sans Spirit ni Cleanyzer",
    (host) => {
      const list = urls(host)
      expect(list).toContain(siteConfig.seo.url)
      expect(list.some((u) => u.includes("tenant=rozancleaningservice"))).toBe(true)
      expect(list.some((u) => u.includes("spiritacs.com") || u.includes("cleanyzer.fr"))).toBe(false)
      expect(list.some((u) => u.includes("tenant=spirit-acs") || u.includes("tenant=cleanyzer"))).toBe(false)
    },
  )

  it("robots : Sitemap par hôte, jamais l'hôte brut", () => {
    expect(robotsSitemapUrlForHost("spiritacs.com")).toBe("https://www.spiritacs.com/sitemap.xml")
    expect(robotsSitemapUrlForHost("www.cleanyzer.fr")).toBe("https://www.cleanyzer.fr/sitemap.xml")
    for (const h of ["evil.com", "a.com/x", "evil.com\nSitemap: http://x", "www.detailflow.fr", null, ""]) {
      expect(robotsSitemapUrlForHost(h)).toBe(`${ROOT}/sitemap.xml`)
    }
  })
})
