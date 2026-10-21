import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { canConfirmBooking, currentPricing, pricingKey, toSelectionsPayload, type PricingState, type V2Vehicle } from "@/lib/booking/v2"

/**
 * L23 — garanties du récapitulatif Booking V2 :
 * 1. un prix serveur calculé pour un ancien panier n'est jamais présenté comme actuel ;
 * 2. sans prix serveur du panier affiché (calcul en cours ou en échec), pas de confirmation.
 */
const v = (patch: Partial<V2Vehicle> = {}): V2Vehicle => ({ uid: "a", vehicleTypeId: 2, brand: "Peugeot", model: "308", optionIds: [], extraServiceIds: [], ...patch })
const key = (vs: V2Vehicle[], address?: string, code?: string) => pricingKey(toSelectionsPayload(vs, 143), address, code)
const ok = (k: string, totalCents: number): PricingState<{ totalCents: number }> => ({ key: k, status: "ok", pricing: { totalCents } })
const src = readFileSync(join(process.cwd(), "components/booking-v2/booking-v2.tsx"), "utf8")

describe("1. Aucun ancien prix serveur présenté comme actuel", () => {
  const before = key([v()])
  const state = ok(before, 7000)
  it("même panier : le prix serveur est retenu", () => {
    expect(currentPricing(state, key([v()]))).toEqual({ status: "ok", pricing: { totalCents: 7000 } })
  })
  it("toute modification du panier rend l'ancien prix périmé (en attente du nouveau calcul)", () => {
    const changes = [
      key([v({ extraServiceIds: [158] }), ]),
      key([v({ optionIds: [98] })]),
      key([v(), v({ uid: "b" })]),
      key([v({ vehicleTypeId: 3 })]),
      key([v({ extraServiceIds: [158], plate: "AB123CD" })]),
      key([v()], "12 rue des Lacs, Annecy"),
      key([v()], undefined, "BIENVENUE"),
    ]
    for (const k of changes) {
      expect(k).not.toBe(before)
      expect(currentPricing(state, k)).toEqual({ status: "pending" })
    }
  })
  it("l'écran n'affiche le prix serveur que s'il correspond au panier affiché", () => {
    expect(src).toContain("const pricing = currentPricing(pricingState, priceKey)")
    expect(src).toContain('const serverPricing = step === 3 && pricing.status === "ok" ? pricing.pricing : null')
    expect(src).toContain('setPricingState({ key, status: "ok", pricing: r.pricing })')
    expect(src).not.toMatch(/setServerPricing/)
  })
})

describe("2. Pas de confirmation sur une estimation locale", () => {
  it("prix en cours de calcul ou en échec : confirmation impossible", () => {
    expect(canConfirmBooking(true, { status: "pending" })).toBe(false)
    expect(canConfirmBooking(true, { status: "error" })).toBe(false)
    expect(canConfirmBooking(false, { status: "ok", pricing: {} })).toBe(false)
    expect(canConfirmBooking(true, { status: "ok", pricing: {} })).toBe(true)
  })
  it("échec du calcul : l'état est lié au panier, jamais confondu avec un succès", () => {
    const k = key([v()])
    expect(currentPricing({ key: k, status: "error" }, k)).toEqual({ status: "error" })
  })
  it("le bouton et l'envoi exigent le prix serveur du panier affiché ; en échec, le bouton recalcule", () => {
    expect(src).toContain("canConfirmBooking(contactValid, pricing),")
    expect(src).toMatch(/async function submit\(\) \{[\s\S]{0,200}!canConfirmBooking\(contactValid, pricing\)\) return/)
    expect(src).toContain('pricingFailed ? "Recalculer le prix"')
    expect(src).toMatch(/if \(pricingFailed\) \{\s*setPricingState\(null\)\s*setPricingRetry/)
    expect(src).toContain('if (step === 3) setPricingState({ key, status: "error" })')
  })
})
