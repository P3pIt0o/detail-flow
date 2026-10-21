import { describe, expect, it } from "vitest"
import { priceBooking, trustedVehicleKeys, vehicleUidOfKey, type LineIdentity } from "@/lib/booking/promotions-apply"
import type { EquivalenceRule } from "@/lib/booking/promotions"
import type { QuoteLine } from "@/lib/booking/types"
import { CLZ, multiServices } from "./helpers/promotions-fixtures"

/**
 * L22 — regroupement de CONFIANCE des lignes d'un même véhicule : même préfixe
 * d'identifiant ET même identité (type, marque, modèle, immatriculation).
 */
const line = (uid: string, serviceId: number, priceCents: number, durationMin: number, options: [number, number, number][] = [], vehicleTypeId = 1): QuoteLine => ({
  uid, serviceId, serviceName: `S${serviceId}`, vehicleTypeId, vehicleTypeName: "Citadine", priceCents, durationMin,
  options: options.map(([optionId, p, d]) => ({ optionId, optionName: `O${optionId}`, priceCents: p, durationMin: d })),
  lineTotalCents: priceCents + options.reduce((s, o) => s + o[1], 0),
  lineDurationMin: durationMin + options.reduce((s, o) => s + o[2], 0),
})
const id = (uid: string, over: Partial<LineIdentity> = {}): LineIdentity => ({ uid, vehicleTypeId: 1, brand: "Peugeot", model: "308", ...over })
const quoteOf = (lines: QuoteLine[]) => {
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  return { lines, subtotalCents, eligibleSubtotalCents: subtotalCents, totalDurationMin: lines.reduce((s, l) => s + l.lineDurationMin, 0) }
}
const phares: EquivalenceRule = { id: 1, a: { type: "service", id: CLZ.pharesService }, b: { type: "option", id: CLZ.pharesOption }, reason: "Même rénovation des phares" }
const NOW = new Date("2026-11-10T10:00:00Z")

describe("L22 — clés de véhicule", () => {
  it("même préfixe et même identité (casse et espaces ignorés) : un seul véhicule", () => {
    const lines = [line("a:main", 143, 3000, 60), line("a:x158", 158, 6500, 45)]
    const k = trustedVehicleKeys(lines, [id("a:main"), id("a:x158", { brand: " peugeot ", model: "308 " })])
    expect(k[0]).toBe(k[1])
    expect(vehicleUidOfKey(k[0])).toBe("a")
  })
  it("même préfixe mais immatriculation, modèle ou type différent : véhicules distincts", () => {
    for (const other of [id("a:x158", { plate: "AB-123-CD" }), id("a:x158", { model: "208" }), id("a:x158", { vehicleTypeId: 2 })]) {
      const lines = [line("a:main", 143, 3000, 60), line("a:x158", 158, 6500, 45, [], other.vehicleTypeId)]
      const k = trustedVehicleKeys(lines, [id("a:main"), other])
      expect(k[0]).not.toBe(k[1])
    }
  })
  it("identifiant sans préfixe, identité absente ou uid répété : une ligne = un véhicule", () => {
    expect(new Set(trustedVehicleKeys([line("a", 143, 1, 1), line("b", 143, 1, 1)], [id("a"), id("b")])).size).toBe(2)
    expect(new Set(trustedVehicleKeys([line("a:1", 143, 1, 1), line("a:2", 143, 1, 1)], [])).size).toBe(2)
    expect(new Set(trustedVehicleKeys([line("a:1", 143, 1, 1), line("a:1", 158, 1, 1)], [id("a:1"), id("a:1")])).size).toBe(2)
  })
  it("le type annoncé doit être celui recalculé par le serveur", () => {
    const k = trustedVehicleKeys([line("a:main", 143, 1, 1, [], 1), line("a:x158", 158, 1, 1, [], 1)], [id("a:main"), id("a:x158", { vehicleTypeId: 2 })])
    expect(k[0]).not.toBe(k[1])
  })
  it("ancien tunnel (« véhicule:ligne », Spirit ACS / Rozan) : jamais regroupé, comportement L20 inchangé", () => {
    const lines = [line("a:l1", CLZ.lavageExterieurEco, 3000, 60, [[CLZ.pharesOption, 5000, 30]]), line("a:l2", CLZ.pharesService, 6500, 45)]
    const keys = trustedVehicleKeys(lines, [id("a:l1"), id("a:l2")])
    expect(new Set(keys).size).toBe(2)
    expect(priceBooking({ quote: quoteOf(lines), promotions: [], equivalences: [phares], code: null, vehicleKeys: keys, now: NOW }).subtotalCents).toBe(14500)
  })
})

describe("L22 — même traitement facturé une fois sur un véhicule multi-prestations", () => {
  it("lavage + option phares et prestation phares sur la même voiture : prestation phares retirée, durée comprise", () => {
    const lines = [line("a:main", CLZ.lavageExterieurEco, 3000, 60, [[CLZ.pharesOption, 5000, 30]]), line(`a:x${CLZ.pharesService}`, CLZ.pharesService, 6500, 45)]
    const keys = trustedVehicleKeys(lines, [id("a:main"), id(`a:x${CLZ.pharesService}`)])
    const p = priceBooking({ quote: quoteOf(lines), promotions: [], equivalences: [phares], code: null, vehicleKeys: keys, now: NOW })
    expect(p.lines.map((l) => l.serviceId)).toEqual([CLZ.lavageExterieurEco])
    expect(p).toMatchObject({ subtotalCents: 8000, totalDurationMin: 90 })
  })
  it("anti-fraude : deux voitures différentes (identités distinctes) gardent leurs deux prestations", () => {
    const lines = [line("a:main", CLZ.lavageExterieurEco, 3000, 60, [[CLZ.pharesOption, 5000, 30]]), line(`a:x${CLZ.pharesService}`, CLZ.pharesService, 6500, 45)]
    const keys = trustedVehicleKeys(lines, [id("a:main"), id(`a:x${CLZ.pharesService}`, { brand: "Renault", model: "Clio" })])
    expect(priceBooking({ quote: quoteOf(lines), promotions: [], equivalences: [phares], code: null, vehicleKeys: keys, now: NOW }).subtotalCents).toBe(14500)
  })
  it("prestation en double sur un même véhicule : facturée une fois (offre active)", () => {
    const lines = [line("a:main", 143, 3000, 60), line("a:x143", 143, 3000, 60)]
    const keys = trustedVehicleKeys(lines, [id("a:main"), id("a:x143")])
    const p = priceBooking({ quote: quoteOf(lines), promotions: [multiServices()], equivalences: [], code: null, vehicleKeys: keys, now: NOW })
    expect(p.subtotalCents).toBe(3000)
    expect(p.lines).toHaveLength(1)
  })
  it("remise multi-prestations comptée sur un seul véhicule à 2 prestations", () => {
    const lines = [line("a:main", 143, 3000, 60), line("a:x146", 146, 4000, 60)]
    const keys = trustedVehicleKeys(lines, [id("a:main"), id("a:x146")])
    expect(priceBooking({ quote: quoteOf(lines), promotions: [multiServices()], equivalences: [], code: null, vehicleKeys: keys, now: NOW }).discountCents).toBe(700)
  })
  it("clés absentes ou de mauvaise longueur : une ligne = un véhicule (comportement L20)", () => {
    const lines = [line("a:main", 143, 3000, 60), line("a:x143", 143, 3000, 60)]
    expect(priceBooking({ quote: quoteOf(lines), promotions: [multiServices()], equivalences: [], code: null, vehicleKeys: ["x"], now: NOW }).subtotalCents).toBe(6000)
  })
})
