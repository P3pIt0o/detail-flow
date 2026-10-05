import { describe, expect, it } from "vitest"
import { resolvePublicLink } from "@/lib/admin/public-link"
import { resolveSiteLinkUrl } from "@/lib/admin/primary-action"

const ROOT = "detailflow.fr"
const base = { intent: null, customSiteKey: null, status: "ACTIVE", rootDomain: ROOT } as const

describe("resolvePublicLink — lien public du dashboard Admin", () => {
  it("tenant standard sans domaine custom → /?tenant=<slug> (comme le Super Admin)", () => {
    const link = resolvePublicLink({ ...base, slug: "mon-garage" })
    expect(link).toEqual({ url: "https://www.detailflow.fr/?tenant=mon-garage", kind: "public_page" })
    expect(link?.url).not.toContain("/p/mon-garage")
  })

  it("syl-net-auto → https://www.detailflow.fr/?tenant=syl-net-auto", () => {
    expect(resolvePublicLink({ ...base, slug: "syl-net-auto" })?.url).toBe(
      "https://www.detailflow.fr/?tenant=syl-net-auto",
    )
  })

  it("site custom sans domaine et legacy → même forme ?tenant=", () => {
    expect(resolvePublicLink({ ...base, slug: "x", customSiteKey: "foo" })?.url).toBe(
      "https://www.detailflow.fr/?tenant=x",
    )
    expect(resolvePublicLink({ ...base, slug: "x", intent: "public_page" as never })?.url).toBe(
      "https://www.detailflow.fr/?tenant=x",
    )
  })

  it("domaine custom inchangé (Spirit ACS)", () => {
    expect(resolvePublicLink({ ...base, slug: "spirit-acs" })).toEqual({
      url: "https://www.spiritacs.com",
      kind: "custom_domain",
    })
  })

  it("SUSPENDED et ARCHIVED → null", () => {
    expect(resolvePublicLink({ ...base, slug: "mon-garage", status: "SUSPENDED" })).toBeNull()
    expect(resolvePublicLink({ ...base, slug: "mon-garage", status: "ARCHIVED" })).toBeNull()
  })

  it("booking_only sans domaine custom → /reservation?tenant=<slug>", () => {
    const link = resolvePublicLink({ ...base, slug: "mon-garage", intent: "booking_only" })
    expect(link).toEqual({ url: "https://www.detailflow.fr/reservation?tenant=mon-garage", kind: "reservation" })
    expect(link?.url).not.toContain("/p/")
  })

  it("le dashboard reçoit ce publicUrl pour « Copier mon lien » et « Voir mon site »", () => {
    const link = resolvePublicLink({ ...base, slug: "syl-net-auto" })
    // layout.tsx passe ce même publicUrl à AdminShell, qui l'utilise pour les deux actions.
    expect(resolveSiteLinkUrl("site", link?.url ?? null)).toBe("https://www.detailflow.fr/?tenant=syl-net-auto")
  })
})
