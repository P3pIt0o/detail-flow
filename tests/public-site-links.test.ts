import { describe, expect, it } from "vitest"
import { publicSiteHref } from "@/lib/public-site-links"

describe("publicSiteHref", () => {
  it("domaine racine (?tenant=, kind tenant) : réservation → formules conserve ?tenant=", () => {
    expect(publicSiteHref("formules", { tenantKind: "tenant", tenantSlug: "syl-net-auto" })).toBe(
      "/formules?tenant=syl-net-auto",
    )
  })

  it("formules → réservation conserve ?tenant=", () => {
    expect(publicSiteHref("reservation", { tenantKind: "tenant", tenantSlug: "syl-net-auto" })).toBe(
      "/reservation?tenant=syl-net-auto",
    )
  })

  it("aperçu : ?tenant= préservé avec embed et view", () => {
    expect(publicSiteHref("reservation", { tenantKind: "preview", tenantSlug: "acme", embed: true, view: "both" })).toBe(
      "/reservation?tenant=acme&embed=1&view=both",
    )
  })

  it("ancien kind 'path' : ne génère JAMAIS /p/<slug>", () => {
    const href = publicSiteHref("formules", { tenantKind: "path", tenantSlug: "acme", embed: true })
    expect(href).toBe("/formules?tenant=acme&embed=1")
    expect(href).not.toContain("/p/")
  })

  it("refuse un slug non sûr (pas d'injection de chemin ou d'autre tenant)", () => {
    expect(publicSiteHref("formules", { tenantKind: "tenant", tenantSlug: "../other" })).toBe("/formules")
    expect(publicSiteHref("formules", { tenantKind: "preview", tenantSlug: "a&tenant=b" })).toBe("/formules")
  })

  it("ne propage view que pour 'both' et embed uniquement si actif", () => {
    expect(publicSiteHref("formules", { tenantKind: "tenant", tenantSlug: "acme", view: "evil" })).toBe(
      "/formules?tenant=acme",
    )
  })
})
