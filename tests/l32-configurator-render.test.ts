import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * L32 — S5 / S4 par un VRAI rendu du configurateur Spirit (écran des familles).
 * Seules la police `next/font` et l'action serveur de demande sont simulées.
 */

vi.mock("next/font/google", () => ({ Oswald: () => ({ className: "osw", variable: "--font-osw" }) }))
vi.mock("@/app/(site)/demande/actions", () => ({
  submitCustomRequest: vi.fn(),
  finalizeCustomRequest: vi.fn(),
  associateQuotePhoto: vi.fn(),
}))

import { SpiritConfigurator } from "@/components/custom-sites/spirit-acs/configurator/spirit-configurator"
import { MAIN_FAMILIES } from "@/components/custom-sites/spirit-acs/configurator/flow-data"
import { spiritOptimizedPhotoPrefix, spiritPhotoOverrides } from "@/components/custom-sites/spirit-acs/service-photos"
import type { CustomRequestType } from "@/lib/custom-requests"

const types = [{ key: "sur-mesure", label: "Sur mesure" }] as unknown as CustomRequestType[]
const cardImages = (html: string) =>
  [...html.matchAll(/<img src="([^"]*)" alt="([^"]*)" class="rq-card-img"/g)].map((m) => [m[1], m[2]])
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&")

describe("rendu des cartes « Choisissez votre prestation »", () => {
  it("S5 — sans photo choisie : exactement les images et textes alternatifs d'origine", () => {
    for (const familyPhotos of [undefined, {}]) {
      const html = renderToStaticMarkup(createElement(SpiritConfigurator, { types, familyPhotos }))
      expect(cardImages(html).map(([src, alt]) => [src, decode(alt)])).toEqual(MAIN_FAMILIES.map((f) => [f.image, f.alt]))
    }
  })

  it("S4 — photo choisie pour Polissage : seule cette carte change, avec la photo servie par la route", () => {
    const pathname = `${spiritOptimizedPhotoPrefix(7, "polissage-ceramique")}abc123.webp`
    const { families } = spiritPhotoOverrides("spirit-acs", { "polissage-ceramique": pathname })
    const html = renderToStaticMarkup(createElement(SpiritConfigurator, { types, familyPhotos: families }))
    const images = cardImages(html).map(([src, alt]) => [decode(src), decode(alt)])
    expect(images).toEqual(
      MAIN_FAMILIES.map((f) =>
        f.key === "polissage-ceramique" ? [families["polissage-ceramique"].src, "Polissage & protection céramique"] : [f.image, f.alt],
      ),
    )
    expect(images[1][0]).toMatch(/^\/api\/spirit-service-photo\?company=spirit-acs&k=polissage-ceramique&v=/)
  })
})
