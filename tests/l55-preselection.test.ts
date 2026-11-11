import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/** L55 — chaque bouton lié à UNE formule ouvre la réservation avec cette formule présélectionnée. */

let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => search,
  usePathname: () => "/p/cleanyzer",
}))
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("@/app/(site)/reservation/actions", () => ({
  createBookingAction: vi.fn(),
  getQuoteAction: vi.fn(),
  validatePromoCodeAction: vi.fn(),
}))

import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_SERVICE_IDS, clzBookingHref } from "@/components/custom-sites/cleanyzer/tokens"
import { FILM_SEQUENCES, JOURNEY_FORMULAS, filmIndex, zoneAction, type FormulaRef } from "@/components/custom-sites/cleanyzer/journey"
import { VisitVideo } from "@/components/custom-sites/cleanyzer/visit-video"
import { BookingV2 } from "@/components/booking-v2/booking-v2"

const R = CLZ_BOOKING_HREF

describe("L55 — liens de formule", () => {
  it("chaque formule intérieure/extérieure → ?service=<id réel> ; Diamond → demande", () => {
    const expected: Record<FormulaRef, string> = {
      eco_int: `${R}?service=143`,
      premium: `${R}?service=144`,
      excellence: `${R}?service=145`,
      eco_ext: `${R}?service=146`,
      exc_ext: `${R}?service=147`,
      diamond: CLZ_DEMANDE_HREF,
    }
    for (const k of Object.keys(expected) as FormulaRef[]) expect(JOURNEY_FORMULAS[k].action.href, k).toBe(expected[k])
    expect(CLZ_SERVICE_IDS.exterieur.premium).toBe(157)
    expect(clzBookingHref("exterieur", "premium")).toBe(`${R}?service=157`)
    expect(clzBookingHref("interieur", "diamond")).toBe(R)
    expect(clzBookingHref("interieur", "inconnue")).toBe(R)
  })

  it("films : formule unique présélectionnée, plusieurs formules → réservation générique", () => {
    const href = (id: Parameters<typeof filmIndex>[0]) => FILM_SEQUENCES[filmIndex(id)].action.href
    expect(href("jantes")).toBe(`${R}?service=147`)
    expect(href("sieges")).toBe(`${R}?service=145`)
    expect(href("exterieur")).toBe(R)
    expect(href("habitacle")).toBe(R)
    expect(href("tapis")).toBe(R)
    expect(href("moteur")).toBe(CLZ_DEMANDE_HREF)
    expect(href("diamond")).toBe(CLZ_DEMANDE_HREF)
  })

  it("panneaux de zone : une seule formule → présélection ; plusieurs → générique ; aucune → demande", () => {
    expect(zoneAction("rims").href).toBe(`${R}?service=147`)
    expect(zoneAction("seats").href).toBe(R)
    expect(zoneAction("engine").href).toBe(CLZ_DEMANDE_HREF)
    expect(zoneAction("optics").href).toBe("/p/cleanyzer/prestations/renovation-optiques-phares-annecy")
  })

  it("boîte finale de la visite : « Réserver » présélectionné + « Voir la formule »", () => {
    const h = renderToStaticMarkup(createElement(VisitVideo)).replace(/&amp;/g, "&")
    // Formule par défaut : Intérieur Excellence.
    expect(h).toMatch(new RegExp(`href="${R}\\?service=145"[^>]*>Réserver`))
    expect(h).toMatch(/href="\/p\/cleanyzer\/prestations\/nettoyage-interieur-voiture-annecy"[^>]*>Voir la formule</)
  })
})

describe("L55 — BookingV2 lit ?service=", () => {
  const svc = (id: number, name: string) => ({ id, categoryId: null, name, slug: `s${id}`, description: null, image: null, basePriceCents: 5000, durationMin: 60 })
  const props = {
    services: [svc(143, "Nettoyage intérieur Éco"), svc(145, "Nettoyage intérieur Excellence")],
    vehicleTypes: [{ id: 1, name: "Citadine", slug: "citadine", description: null, examples: null }],
    options: [],
    priceMap: {},
    depositType: "none",
    depositValue: 0,
    roundTrip: false,
    freeDistanceKm: 0,
    paymentPlan: "on_site" as const,
    maxVehicles: 1,
    location: { mobile: true, workshop: false, workshopAddress: null },
  }
  const render = (q: string) => {
    search = new URLSearchParams(q)
    return renderToStaticMarkup(createElement(BookingV2, props))
  }

  it("?service=145 → l'étape 1 (choix de prestation) est passée, formule retenue", () => {
    const h = render("service=145")
    expect(h).toContain("Votre véhicule")
    expect(h).not.toContain("Choisissez votre prestation")
    expect(h).toContain("Nettoyage intérieur Excellence")
  })

  it("id inconnu ou d'un autre tenant → aucune présélection", () => {
    for (const q of ["service=999", "service=abc", ""]) {
      const h = render(q)
      expect(h, q).toContain("Choisissez votre prestation")
    }
  })

  it("BookingV2 n'est pas modifié par ce lot (lecture existante conservée)", () => {
    const src = readFileSync(path.join(process.cwd(), "components/booking-v2/booking-v2.tsx"), "utf8")
    expect(src).toContain('Number(searchParams.get("service"))')
    expect(src).toContain("services.some((s) => s.id === requested)")
  })
})
