import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  addExtraService,
  bookingEstimate,
  codeNotAppliedMessage,
  displayedDurationMin,
  hasPlaceLeft,
  isV2VehicleComplete,
  placesUsed,
  promoRejectionMessage,
  withMainService,
  type V2Vehicle,
} from "@/lib/booking/v2"
import type { OptionRow, ServiceRow } from "@/components/booking/shared"

/**
 * L22 — logique de l'écran Booking V2 extraite en fonctions pures (retours du
 * vérificateur) : capacité, durée affichée, messages de code, prestation principale.
 */
const svc = (id: number, basePriceCents: number, durationMin: number): ServiceRow => ({ id, categoryId: null, name: `S${id}`, slug: `s${id}`, description: null, image: null, basePriceCents, durationMin })
const services = [svc(143, 3000, 60), svc(146, 4000, 60), svc(158, 6500, 45)]
const options: OptionRow[] = []
const v = (patch: Partial<V2Vehicle> = {}): V2Vehicle => ({ uid: "a", vehicleTypeId: 2, brand: "Peugeot", model: "308", optionIds: [], extraServiceIds: [], ...patch })
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

describe("Type de véhicule non choisi + prestation ajoutée (M4)", () => {
  it("véhicule incomplet : on ne peut pas continuer, même avec une immatriculation valide", () => {
    const x = addExtraService(v({ vehicleTypeId: null, plate: "AB123CD" }), 158, 143)
    expect(x.extraServiceIds).toEqual([158])
    expect(isV2VehicleComplete(x, 143)).toBe(false)
    expect(isV2VehicleComplete({ ...x, vehicleTypeId: 2 }, 143)).toBe(true)
  })
  it("l'estimation ne plante pas et compte la prestation ajoutée au prix de base", () => {
    const e = bookingEstimate([addExtraService(v({ vehicleTypeId: null }), 158, 143)], 143, services, options, {})
    expect(Number.isFinite(e.priceCents) && e.priceCents >= 3000 + 6500).toBe(true)
  })
})

describe("Capacité : une prestation = une place (M2)", () => {
  it("places occupées = véhicules + prestations ajoutées (la principale n'est jamais comptée deux fois)", () => {
    const vs = [v({ extraServiceIds: [158, 143] }), v({ uid: "b" })]
    expect(placesUsed(vs, 143)).toBe(3)
    expect(hasPlaceLeft(vs, 143, 4)).toBe(true)
    expect(hasPlaceLeft(vs, 143, 3)).toBe(false)
  })
  it("capacité invalide ou nulle : une place minimum (réservation classique toujours possible)", () => {
    expect(hasPlaceLeft([], 143, 0)).toBe(true)
    expect(hasPlaceLeft([v()], 143, 0)).toBe(false)
  })
  it("l'écran et l'acceptation d'une suggestion utilisent ce contrôle", () => {
    expect(read("components/booking-v2/step-vehicle.tsx")).toContain("hasPlaceLeft(vehicles, serviceId, maxVehicles)")
    expect(read("components/booking-v2/step-vehicle.tsx")).toContain('suggestions.filter((sg) => canAdd || sg.add?.type !== "service")')
    expect(read("components/booking-v2/booking-v2.tsx")).toMatch(/add\.type === "service" && !hasPlaceLeft\(vehicles, serviceId, props\.maxVehicles\)\) return/)
  })
})

describe("Durée affichée (M3)", () => {
  it("durée du serveur dès qu'elle est connue (doublons retirés), sinon estimation", () => {
    expect(displayedDurationMin(105, 150)).toBe(105)
    expect(displayedDurationMin(0, 150)).toBe(0)
    expect(displayedDurationMin(null, 150)).toBe(150)
    expect(displayedDurationMin(undefined, 150)).toBe(150)
    expect(read("components/booking-v2/booking-v2.tsx")).toContain("displayedDurationMin(serverPricing?.totalDurationMin, estimate.durationMin)")
  })
})

describe("Messages de code promo (m5)", () => {
  it("un message par motif, jamais vide", () => {
    expect(promoRejectionMessage("not_applicable_services")).toMatch(/prestation sélectionnée/)
    expect(promoRejectionMessage("not_combinable")).toMatch(/ne se cumule pas/)
    expect(promoRejectionMessage("no_eligible_amount")).toMatch(/votre sélection/)
    expect(promoRejectionMessage("expired")).toBe("Code promo invalide ou indisponible.")
  })
  it("récapitulatif : code écarté, invalide ou hors sélection", () => {
    expect(codeNotAppliedMessage("DIX", "rejected_not_combinable")).toMatch(/DIX n'est pas appliqué.*ne se cumule pas/)
    expect(codeNotAppliedMessage("DIX", "invalid")).toBe("Le code DIX est invalide ou indisponible.")
    expect(codeNotAppliedMessage("DIX", "not_applicable")).toBe("Le code DIX ne s'applique pas à votre sélection.")
    expect(read("components/booking-v2/step-contact.tsx")).toContain("codeNotAppliedMessage(serverPricing.code.code, serverPricing.code.status)")
  })
})

describe("Changement de prestation principale (m6)", () => {
  it("la nouvelle principale est retirée des prestations ajoutées, les autres restent", () => {
    const vs = withMainService([v({ extraServiceIds: [158, 146] }), v({ uid: "b", extraServiceIds: [146] })], 146)
    expect(vs.map((x) => x.extraServiceIds)).toEqual([[158], []])
    expect(read("components/booking-v2/booking-v2.tsx")).toContain("withMainService(vs, id)")
  })
})
