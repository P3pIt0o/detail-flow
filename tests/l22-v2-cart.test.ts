import { describe, expect, it } from "vitest"
import {
  addExtraService,
  bookingEstimate,
  extraServiceCandidates,
  fromVehicleSelections,
  removeExtraService,
  toSelectionsPayload,
  toVehicleSelections,
  type V2Vehicle,
} from "@/lib/booking/v2"
import type { OptionRow, ServiceRow } from "@/components/booking/shared"

/** L22 — panier libre Booking V2 : plusieurs prestations par véhicule. */
const svc = (id: number, basePriceCents: number, durationMin: number): ServiceRow => ({ id, categoryId: null, name: `S${id}`, slug: `s${id}`, description: null, image: null, basePriceCents, durationMin })
const services = [svc(143, 3000, 60), svc(146, 4000, 60), svc(158, 6500, 45)]
const options: OptionRow[] = [{ id: 98, name: "Phares", slug: "phares", description: null, priceCents: 5000, durationMin: 30 }]
const priceMap = { "158-2": { priceCents: 7000, durationMin: 50 } }
const vehicle = (patch: Partial<V2Vehicle> = {}): V2Vehicle => ({ uid: "a", vehicleTypeId: 2, brand: " Peugeot ", model: "308", optionIds: [], extraServiceIds: [], ...patch })

describe("L22 — prestations ajoutées", () => {
  it("ajout sans doublon et jamais la prestation principale ; retrait", () => {
    let v = addExtraService(vehicle(), 158, 143)
    v = addExtraService(v, 158, 143)
    v = addExtraService(v, 143, 143)
    expect(v.extraServiceIds).toEqual([158])
    expect(removeExtraService(v, 158).extraServiceIds).toEqual([])
    expect(extraServiceCandidates(services, v, 143).map((s) => s.id)).toEqual([146])
  })
  it("véhicule d'un ancien brouillon (sans champ) : traité comme aucune prestation ajoutée", () => {
    const old = { uid: "a", vehicleTypeId: 2, brand: "P", model: "3", optionIds: [] } as V2Vehicle
    expect(addExtraService(old, 158, 143).extraServiceIds).toEqual([158])
    expect(toSelectionsPayload([old], 143)).toHaveLength(1)
  })
})

describe("L22 — lignes envoyées au serveur", () => {
  it("une ligne par prestation, même identité de véhicule sur toutes les lignes", () => {
    const lines = toSelectionsPayload([vehicle({ optionIds: [98], extraServiceIds: [158] }), vehicle({ uid: "b", brand: "Renault", model: "Clio" })], 143)
    expect(lines).toEqual([
      { uid: "a:main", serviceId: 143, optionIds: [98], vehicleTypeId: 2, brand: "Peugeot", model: "308" },
      { uid: "a:x158", serviceId: 158, optionIds: [], vehicleTypeId: 2, brand: "Peugeot", model: "308" },
      { uid: "b:main", serviceId: 143, optionIds: [], vehicleTypeId: 2, brand: "Renault", model: "Clio" },
    ])
  })
  it("sans prestation choisie : rien n'est envoyé", () => {
    expect(toSelectionsPayload([vehicle()], null)).toEqual([])
  })
})

describe("L22 — brouillons", () => {
  it("aller-retour multi-prestations", () => {
    const back = fromVehicleSelections(toVehicleSelections([vehicle({ optionIds: [98], extraServiceIds: [158, 146] })], 143))
    expect(back.serviceId).toBe(143)
    expect(back.vehicles[0]).toMatchObject({ optionIds: [98], extraServiceIds: [158, 146] })
  })
  it("brouillon antérieur (une prestation par véhicule) : repris à l'identique", () => {
    const back = fromVehicleSelections([{ uid: "a", vehicleTypeId: 2, brand: "P", model: "3", services: [{ lid: "l", serviceId: 143, optionIds: [98] }] }])
    expect(back.vehicles[0]).toMatchObject({ optionIds: [98], extraServiceIds: [] })
  })
})

describe("L22 — estimation (indicative, le serveur fait foi)", () => {
  it("inclut les prestations ajoutées au tarif du type de véhicule", () => {
    const e = bookingEstimate([vehicle({ optionIds: [98], extraServiceIds: [158] })], 143, services, options, priceMap)
    expect(e).toEqual({ priceCents: 3000 + 5000 + 7000, durationMin: 60 + 30 + 50 })
  })
})
