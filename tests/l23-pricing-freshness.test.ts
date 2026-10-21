import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { bookingCta, canConfirmBooking, currentPricing, pricingKey, toSelectionsPayload, type PricingState, type V2Vehicle } from "@/lib/booking/v2"

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
  it("l'écran délègue le bouton et l'envoi à ces fonctions (câblage)", () => {
    expect(src).toContain("canConfirmBooking(contactValid, pricing),")
    expect(src).toMatch(/async function submit\(\) \{[\s\S]{0,200}!canConfirmBooking\(contactValid, pricing\)\) return/)
    expect(src).toContain("const cta = bookingCta(")
    expect(src).toMatch(/if \(cta\.action === "retry"\) \{\s*setPricingState\(null\)\s*setPricingRetry/)
    expect(src).toContain('if (step === 3) setPricingState({ key, status: "error" })')
  })
})

describe("3. Bouton du bas d'écran (bookingCta)", () => {
  const base = { stepValid: true, contactValid: true, online: false }
  const ok = { status: "ok", pricing: {} } as const
  it("étapes 0 à 2 : « Continuer », bloqué tant que l'étape est incomplète", () => {
    expect(bookingCta({ ...base, step: 1, pricing: { status: "pending" } })).toEqual({ action: "next", label: "Continuer", disabled: false })
    expect(bookingCta({ ...base, step: 2, stepValid: false, pricing: { status: "error" } })).toEqual({ action: "next", label: "Continuer", disabled: true })
  })
  it("récapitulatif, prix serveur actuel : confirmation (ou paiement en ligne)", () => {
    expect(bookingCta({ ...base, step: 3, pricing: ok })).toEqual({ action: "submit", label: "Confirmer", disabled: false })
    expect(bookingCta({ ...base, step: 3, online: true, pricing: ok })).toEqual({ action: "submit", label: "Payer et réserver", disabled: false })
  })
  it("récapitulatif, calcul en cours : confirmation bloquée", () => {
    expect(bookingCta({ ...base, step: 3, stepValid: false, pricing: { status: "pending" } })).toEqual({ action: "submit", label: "Confirmer", disabled: true })
  })
  it("récapitulatif, calcul en échec : « Recalculer le prix », jamais bloqué, jamais une confirmation", () => {
    expect(bookingCta({ ...base, step: 3, stepValid: false, pricing: { status: "error" } })).toEqual({ action: "retry", label: "Recalculer le prix", disabled: false })
  })
  it("coordonnées incomplètes : pas de recalcul proposé, confirmation bloquée", () => {
    expect(bookingCta({ ...base, step: 3, stepValid: false, contactValid: false, pricing: { status: "error" } })).toEqual({ action: "submit", label: "Confirmer", disabled: true })
  })
  it("après « Recalculer » (état remis à zéro) : en attente, donc confirmation bloquée", () => {
    const k = key([v()])
    expect(currentPricing(null, k)).toEqual({ status: "pending" })
    expect(canConfirmBooking(true, currentPricing(null, k))).toBe(false)
  })
})
