import { describe, expect, it } from "vitest"
import {
  bookingEstimate,
  buildBookingIcs,
  dateWindow,
  fromVehicleSelections,
  groupSlots,
  isV2VehicleComplete,
  newV2Vehicle,
  previewDeposit,
  resolvePaymentPlan,
  servicePriceRange,
  splitName,
  joinName,
  toVehicleSelections,
  type V2Vehicle,
} from "@/lib/booking/v2"
import type { OptionRow, ServiceRow } from "@/components/booking/shared"

const services: ServiceRow[] = [
  { id: 1, categoryId: null, name: "Complet", slug: "c", description: null, image: null, basePriceCents: 10000, durationMin: 120 },
]
const options: OptionRow[] = [{ id: 9, name: "Cuir", slug: "cuir", description: null, priceCents: 2500, durationMin: 30 }]
const priceMap = { "1-2": { priceCents: 14000, durationMin: 150 } }
const types = [{ id: 1 }, { id: 2 }]

const vehicle = (patch: Partial<V2Vehicle> = {}): V2Vehicle => ({
  uid: "a",
  vehicleTypeId: 2,
  brand: "Peugeot",
  model: "308",
  optionIds: [],
  ...patch,
})

describe("booking v2 — véhicules", () => {
  it("présélectionne le type seulement quand un seul est configuré", () => {
    expect(newV2Vehicle([{ id: 7 }]).vehicleTypeId).toBe(7)
    expect(newV2Vehicle(types).vehicleTypeId).toBeNull()
  })

  it("exige type, marque et modèle", () => {
    expect(isV2VehicleComplete(vehicle())).toBe(true)
    expect(isV2VehicleComplete(vehicle({ brand: " " }))).toBe(false)
    expect(isV2VehicleComplete(vehicle({ vehicleTypeId: null }))).toBe(false)
  })

  it("aller-retour avec le format brouillon partagé", () => {
    const sel = toVehicleSelections([vehicle({ optionIds: [9] })], 1)
    expect(sel[0].services[0]).toMatchObject({ serviceId: 1, optionIds: [9] })
    const back = fromVehicleSelections(sel)
    expect(back.serviceId).toBe(1)
    expect(back.vehicles[0]).toMatchObject({ brand: "Peugeot", model: "308", optionIds: [9] })
  })
})

describe("booking v2 — prix et durée", () => {
  it("utilise le tarif par type puis ajoute les options", () => {
    const e = bookingEstimate([vehicle({ optionIds: [9] })], 1, services, options, priceMap)
    expect(e).toEqual({ priceCents: 16500, durationMin: 180 })
  })

  it("affiche le prix de base tant que le type n'est pas choisi", () => {
    const e = bookingEstimate([vehicle({ vehicleTypeId: null })], 1, services, options, priceMap)
    expect(e.priceCents).toBe(10000)
  })

  it("calcule la fourchette sur les types configurés", () => {
    expect(servicePriceRange(services[0], types, services, priceMap)).toMatchObject({ minCents: 10000, maxCents: 14000 })
  })

  it("aperçu d'acompte identique à computeDeposit", () => {
    expect(previewDeposit(20000, "percent", 30)).toBe(6000)
    expect(previewDeposit(1000, "fixed", 5000)).toBe(1000)
    expect(previewDeposit(1000, "none", 0)).toBe(0)
  })
})

describe("booking v2 — modes de paiement issus de la config tenant", () => {
  it("n'affiche jamais un paiement en ligne si le tenant n'est pas prêt", () => {
    expect(resolvePaymentPlan({ paymentsReady: false, mode: "full", depositType: "none", depositValue: 0 })).toBe("on_site")
    expect(resolvePaymentPlan({ paymentsReady: false, mode: "full", depositType: "percent", depositValue: 30 })).toBe(
      "offline_deposit",
    )
  })

  it("reflète le mode Stripe configuré", () => {
    const base = { paymentsReady: true, depositType: "percent", depositValue: 30 }
    expect(resolvePaymentPlan({ ...base, mode: "full" })).toBe("online_full")
    expect(resolvePaymentPlan({ ...base, mode: "deposit" })).toBe("online_deposit")
    expect(resolvePaymentPlan({ ...base, mode: "choice" })).toBe("choice")
  })
})

describe("booking v2 — dates, créneaux, coordonnées, calendrier", () => {
  it("fenêtre de dates consécutives", () => {
    expect(dateWindow(new Date(2026, 0, 30), 0, 3)).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"])
  })

  it("répartit matin / après-midi", () => {
    expect(groupSlots(["09:00", "11:30", "12:00", "14:00"])).toEqual({
      morning: ["09:00", "11:30"],
      afternoon: ["12:00", "14:00"],
    })
  })

  it("nom complet ↔ prénom / nom", () => {
    expect(joinName(" Jean ", "Dupont ")).toBe("Jean Dupont")
    expect(splitName("Jean de la Tour")).toEqual({ firstName: "Jean", lastName: "de la Tour" })
  })

  it("génère un .ics valide", () => {
    const ics = buildBookingIcs({
      uid: "DF-1@detailflow",
      title: "Complet, intérieur",
      date: "2026-03-04",
      startTime: "09:30",
      endTime: "11:30",
      now: new Date("2026-01-01T00:00:00Z"),
    })
    expect(ics).toContain("DTSTART:20260304T093000")
    expect(ics).toContain("DTEND:20260304T113000")
    expect(ics).toContain("SUMMARY:Complet\\, intérieur")
  })
})
