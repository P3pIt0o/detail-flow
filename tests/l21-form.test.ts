import { describe, expect, it } from "vitest"
import { validatePromotion, type Promotion } from "@/lib/booking/promotions"
import {
  bpsToInput,
  centsToInput,
  emptyForm,
  eurosToCents,
  formToPayload,
  percentToBps,
  promotionToForm,
  sampleCartFor,
  tierLabel,
  type PromotionPayload,
} from "@/lib/booking/promotions-form"
import { fixedTotal, multiServices } from "./helpers/promotions-fixtures"

/** L21 — formulaire admin : euros et % à l'écran, centimes et points de base envoyés. */
describe("L21 — conversions sans flottant", () => {
  it("euros → centimes (virgule, point, symbole, espaces)", () => {
    expect(eurosToCents("19,90")).toBe(1990)
    expect(eurosToCents("19.9")).toBe(1990)
    expect(eurosToCents(" 65 € ")).toBe(6500)
    expect(eurosToCents("0,05")).toBe(5)
    expect(eurosToCents("1 234,56")).toBe(123456)
  })
  it("euros invalides refusés", () => {
    for (const v of ["", "abc", "-5", "1,234", "12,5,0", "1e3", "99999999"]) expect(eurosToCents(v)).toBeNull()
  })
  it("pourcentage → points de base, bornes ]0 ; 100]", () => {
    expect(percentToBps("12,5")).toBe(1250)
    expect(percentToBps("10")).toBe(1000)
    expect(percentToBps("0,01")).toBe(1)
    expect(percentToBps("100")).toBe(10000)
    for (const v of ["0", "100,01", "-10", "abc", "10,555"]) expect(percentToBps(v)).toBeNull()
  })
  it("affichage de saisie : aller-retour exact", () => {
    for (const c of [5, 1990, 6500, 123456]) expect(eurosToCents(centsToInput(c))).toBe(c)
    for (const b of [1, 1000, 1250, 1005, 10000]) expect(percentToBps(bpsToInput(b))).toBe(b)
    expect(bpsToInput(1250)).toBe("12,5")
  })
})

describe("L21 — formulaire ↔ offre", () => {
  const asPromotion = (p: PromotionPayload): Promotion => {
    const base = { id: 1, name: p.name, active: false, priority: 0, startsAt: null, endsAt: null, stackable: p.stackable, stackableWithPromoCode: p.stackableWithPromoCode, tiers: p.tiers }
    if (p.kind === "multi_services") return { ...base, kind: "multi_services", eligibleServiceIds: p.eligibleServiceIds ?? null, includeOptions: !!p.includeOptions }
    if (p.kind === "multi_options") return { ...base, kind: "multi_options", eligibleOptionIds: p.eligibleOptionIds ?? null }
    return { ...base, kind: "service_option", trigger: p.trigger! }
  }
  it("plusieurs prestations, paliers en % : données entières, acceptées par le moteur", () => {
    const r = formToPayload({ ...emptyForm(), name: "2 prestations", tiers: [{ minQuantity: "2", value: "10" }, { minQuantity: "3", value: "12,5" }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).toMatchObject({ kind: "multi_services", eligibleServiceIds: null, tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }, { minQuantity: 3, value: { type: "percent", bps: 1250 } }] })
    expect(validatePromotion(asPromotion(r.payload)).ok).toBe(true)
  })
  it("prestation + option en € : un seul palier, déclencheur obligatoire", () => {
    const f = { ...emptyForm("service_option"), name: "Phares", mode: "amount" as const, tiers: [{ minQuantity: "1", value: "15" }] }
    expect(formToPayload(f)).toMatchObject({ ok: false })
    const r = formToPayload({ ...f, trigger: { serviceId: 143, optionId: 98, appliesTo: "option" } })
    expect(r).toMatchObject({ ok: true, payload: { trigger: { serviceId: 143, optionId: 98, appliesTo: "option" }, tiers: [{ minQuantity: 1, value: { type: "amount", cents: 1500 } }] } })
    if (r.ok) expect(validatePromotion(asPromotion(r.payload)).ok).toBe(true)
  })
  it("plusieurs options : liste vide refusée si « toutes » n'est pas coché", () => {
    const f = { ...emptyForm("multi_options"), name: "Options", allItems: false, tiers: [{ minQuantity: "2", value: "10" }] }
    expect(formToPayload(f)).toMatchObject({ ok: false })
    expect(formToPayload({ ...f, optionIds: [98] })).toMatchObject({ ok: true, payload: { eligibleOptionIds: [98] } })
  })
  it("saisies invalides : messages en français, rien n'est envoyé", () => {
    const r = formToPayload({ ...emptyForm(), name: " ", tiers: [{ minQuantity: "0", value: "10" }, { minQuantity: "3", value: "abc" }], startDate: "2026-12-01", endDate: "2026-11-01" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain("Donnez un nom à l'offre.")
      expect(r.errors.join(" ")).toMatch(/nombre minimal/)
      expect(r.errors.join(" ")).toMatch(/pourcentage/)
      expect(r.errors).toContain("La date de fin doit suivre la date de début.")
    }
  })
  it("mode incompatible avec le type refusé (prix total fixe sur des options)", () => {
    expect(formToPayload({ ...emptyForm("multi_options"), name: "x", mode: "fixed_total", tiers: [{ minQuantity: "2", value: "10" }] })).toMatchObject({ ok: false })
  })
  it("aller-retour offre → formulaire → offre identique", () => {
    for (const p of [multiServices({ eligibleServiceIds: [1, 2], includeOptions: true }), fixedTotal(), multiServices({ stackableWithPromoCode: true })]) {
      const r = formToPayload(promotionToForm(p))
      expect(r.ok).toBe(true)
      if (r.ok) expect(asPromotion(r.payload)).toMatchObject({ kind: p.kind, tiers: p.tiers, stackableWithPromoCode: p.stackableWithPromoCode })
    }
  })
  it("libellés de palier", () => {
    expect(tierLabel("multi_services", { minQuantity: 2, value: { type: "percent", bps: 1000 } })).toBe("2 prestations ou plus : −10 %")
    expect(tierLabel("multi_services", { minQuantity: 3, value: { type: "fixed_total", cents: 15000 } })).toBe("3 prestations ou plus : 150 € au total")
    expect(tierLabel("multi_options", { minQuantity: 2, value: { type: "amount", cents: 990 } })).toBe("2 options ou plus : −9,90 €")
  })
  it("panier d'exemple : prestations éligibles les moins chères, jusqu'au plus haut palier", () => {
    const cart = sampleCartFor(multiServices({ eligibleServiceIds: [2, 3] }), { services: [{ id: 1, priceCents: 1000 }, { id: 2, priceCents: 5000 }, { id: 3, priceCents: 3000 }], options: [] })
    expect(cart.vehicles.map((v) => v.services[0].serviceId)).toEqual([3, 2, 3, 2].slice(0, 4))
  })
})
