import { describe, expect, it } from "vitest"
import { publicSiteHref } from "@/lib/public-site-links"

describe("publicSiteHref", () => {
  it("reservation → formules conserve le tenant /p/<slug> avec embed et view", () => {
    expect(publicSiteHref("formules", { tenantKind: "path", tenantSlug: "acme", embed: true, view: "both" })).toBe(
      "/p/acme/formules?embed=1&view=both",
    )
  })

  it("formules → reservation conserve le tenant /p/<slug>", () => {
    expect(publicSiteHref("reservation", { tenantKind: "path", tenantSlug: "acme" })).toBe("/p/acme/reservation")
  })

  it("domaine personnalisé / sous-domaine : lien relatif, tenant porté par l'hôte", () => {
    expect(publicSiteHref("formules", { tenantKind: "tenant", tenantSlug: "acme", embed: true, view: "both" })).toBe(
      "/formules?embed=1&view=both",
    )
  })

  it("mode ?tenant= (preview) préservé", () => {
    expect(publicSiteHref("reservation", { tenantKind: "preview", tenantSlug: "acme", embed: true, view: "both" })).toBe(
      "/reservation?tenant=acme&embed=1&view=both",
    )
  })

  it("refuse un slug non sûr (pas d'injection de chemin ou d'autre tenant)", () => {
    expect(publicSiteHref("formules", { tenantKind: "path", tenantSlug: "../other" })).toBe("/formules")
    expect(publicSiteHref("formules", { tenantKind: "preview", tenantSlug: "a&tenant=b" })).toBe("/formules")
  })

  it("ne propage view que pour 'both' et embed uniquement si actif", () => {
    expect(publicSiteHref("formules", { tenantKind: "path", tenantSlug: "acme", view: "evil" })).toBe("/p/acme/formules")
  })
})
