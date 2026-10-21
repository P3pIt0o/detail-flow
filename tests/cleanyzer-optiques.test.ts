import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import sitemap from "@/app/sitemap"
import {
  CLZ_OPTIQUES_PRICE,
  CLZ_OPTIQUES_SLUG,
  CLZ_SERVICE_PAGES,
  getClzServicePage,
} from "@/components/custom-sites/cleanyzer/seo-content"
import { EXTERIEUR_OPTIONS } from "@/components/custom-sites/cleanyzer/content"
import { OPTIONS } from "../scripts/cleanyzer-catalog-import.mjs"

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")
const CLZ = "components/custom-sites/cleanyzer"

describe("Cleanyzer — page rénovation des optiques", () => {
  const page = getClzServicePage(CLZ_OPTIQUES_SLUG)

  it("slug unique servi par la route /prestations/[service]", () => {
    expect(CLZ_OPTIQUES_SLUG).toBe("renovation-optiques-phares-annecy")
    expect(page?.kind).toBe("optiques")
    expect(CLZ_SERVICE_PAGES.filter((p) => p.slug === CLZ_OPTIQUES_SLUG)).toHaveLength(1)
    expect(read("app/(site)/prestations/[service]/page.tsx")).toContain("getClzServicePage(slug)")
  })

  it("H1 et métadonnées uniques par rapport aux autres prestations", () => {
    const others = CLZ_SERVICE_PAGES.filter((p) => p.slug !== CLZ_OPTIQUES_SLUG)
    for (const o of others) {
      expect(o.h1).not.toBe(page!.h1)
      expect(o.metaTitle).not.toBe(page!.metaTitle)
      expect(o.metaDescription).not.toBe(page!.metaDescription)
    }
    expect(page!.metaTitle.length).toBeLessThanOrEqual(60)
    expect(page!.metaDescription.length).toBeLessThanOrEqual(160)
  })

  it("tarif 65 € issu du barème content.ts et identique au catalogue d'import", () => {
    const fromContent = EXTERIEUR_OPTIONS.find((o) => o.key === "renovation-optiques")?.price
    expect(CLZ_OPTIQUES_PRICE).toBe(fromContent)
    expect(CLZ_OPTIQUES_PRICE).toBe(65)
    const imported = (OPTIONS as { key?: string; slug?: string; price?: number; priceCents?: number }[]).find(
      (o) => o.key === "renovation-optiques" || o.slug === "renovation-optiques",
    )
    if (imported) {
      const p = imported.priceCents != null ? imported.priceCents / 100 : imported.price
      expect(p).toBe(65)
    }
  })

  it("option non réservable seule : aucune Offer autonome dans le JSON-LD", () => {
    expect(read(`${CLZ}/service-page.tsx`)).toMatch(/page\.kind === "optiques"\) return \[\]/)
  })

  it("absente du sitemap pendant la prépublication", () => {
    for (const e of sitemap()) expect(e.url).not.toContain(CLZ_OPTIQUES_SLUG)
  })

  it("liens internes vers le lavage extérieur, la zone et les réalisations", () => {
    const src = read(`${CLZ}/service-page.tsx`)
    expect(src).toContain("clzPath(`/prestations/${EXTERIOR_SLUG}`)")
    expect(src).toContain("clzPath(`/${CLZ_ZONE_PAGE.slug}`)")
    expect(src).toContain("#avant-apres")
  })
})

describe("Cleanyzer — avant / après", () => {
  const src = read(`${CLZ}/realisations-tom.tsx`)

  it("sous-titre « Le résultat en images. »", () => {
    expect(src).toContain("Le résultat en images.")
  })

  it("slider : vraies images HTML avec alt et contrôle accessible au clavier", () => {
    const slider = read(`${CLZ}/compare-slider.tsx`)
    expect(slider).toMatch(/<Image|<img/)
    expect(slider).toMatch(/alt=/)
    expect(slider).toMatch(/type="range"|role="slider"/)
  })
})

describe("Cleanyzer — huitième zone Porsche", () => {
  it("8 zones interactives : les 7 d'origine + optiques", () => {
    const src = read(`${CLZ}/visit-3d.tsx`)
    const order = src.match(/const KEY_ORDER[^=]*=\s*\[([^\]]+)\]/)![1]
    const zones = [...order.matchAll(/"(\w+)"/g)].map((m) => m[1])
    expect(zones).toEqual(["body", "optics", "rims", "engine", "mats", "seats", "vents", "leather"])
  })
})
