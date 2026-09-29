import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  bookingLinkUrl,
  isBookingLinkAccessible,
  showsCustomSiteBookingAdmin,
} from "@/lib/company/publication-shared"
import { buildEmbedScriptSnippet } from "@/lib/embed/snippet"

const page = readFileSync(join(process.cwd(), "app/admin/page-publique/page.tsx"), "utf8")
const ORIGIN = "https://www.detailflow.fr"

describe("Page publique — réservation en ligne pour site personnalisé", () => {
  it("CAS 1 — Cleanyzer site OFF + booking ON : admin visible, lien accessible", () => {
    const flags = { customSitePublished: false, bookingLinkEnabled: true }
    expect(showsCustomSiteBookingAdmin("cleanyzer")).toBe(true)
    expect(isBookingLinkAccessible("BETA", flags)).toBe(true)
    expect(bookingLinkUrl("cleanyzer", ORIGIN)).toBe("https://www.detailflow.fr/book/cleanyzer")
  })

  it("CAS 2 — site OFF + booking OFF : admin toujours visible, lien fermé", () => {
    const flags = { customSitePublished: false, bookingLinkEnabled: false }
    expect(showsCustomSiteBookingAdmin("cleanyzer")).toBe(true)
    expect(isBookingLinkAccessible("BETA", flags)).toBe(false)
  })

  it("CAS 3 — site ON + booking OFF : lien fermé, indépendant du site", () => {
    const flags = { customSitePublished: true, bookingLinkEnabled: false }
    expect(showsCustomSiteBookingAdmin("rozan")).toBe(true)
    expect(isBookingLinkAccessible("ACTIVE", flags)).toBe(false)
  })

  it("CAS 4 — tenant standard : aucune section ajoutée, éditeur inchangé", () => {
    expect(showsCustomSiteBookingAdmin(null)).toBe(false)
    expect(showsCustomSiteBookingAdmin(undefined)).toBe(false)
    expect(page).toContain("<ConfigEditor")
  })

  it("Spirit ACS : section non affichée (parcours devis inchangé)", () => {
    expect(showsCustomSiteBookingAdmin("spirit-acs")).toBe(false)
  })

  it("suspendu/archivé : jamais accessible même activé", () => {
    const flags = { customSitePublished: true, bookingLinkEnabled: true }
    expect(isBookingLinkAccessible("SUSPENDED", flags)).toBe(false)
    expect(isBookingLinkAccessible("ARCHIVED", flags)).toBe(false)
  })

  it("la section ne dépend jamais de customSitePublished", () => {
    const section = page.slice(page.indexOf("showsCustomSiteBookingAdmin(tenant"), page.indexOf("getPublicPageConfigRow(tenant.id)"))
    expect(section).not.toContain("customSitePublished")
    expect(section).toContain("isBookingLinkAccessible(tenant.status, await getPublicationFlags(tenant.id))")
  })

  it("isolation : lien et widget construits depuis le slug du tenant serveur", () => {
    expect(page).toContain("bookingLinkUrl(tenant.slug")
    expect(page).toContain("buildEmbedScriptSnippet(tenant.slug")
    expect(bookingLinkUrl("a-b", ORIGIN)).not.toContain("cleanyzer")
    expect(buildEmbedScriptSnippet("cleanyzer", "detailflow.fr")).toContain('data-detailflow-slug="cleanyzer"')
  })
})
