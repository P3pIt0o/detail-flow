import { describe, expect, it } from "vitest"
import { isPromotionLive, validateEquivalence, validatePromotion } from "@/lib/booking/promotions"
import { fixedTotal, multiOptions, multiServices, serviceOption } from "./helpers/promotions-fixtures"

const errs = (r: ReturnType<typeof validatePromotion>) => (r.ok ? [] : r.errors)

describe("validatePromotion", () => {
  it("offres d'exemple valides", () => {
    for (const p of [multiServices(), fixedTotal(), serviceOption(), multiOptions()]) expect(validatePromotion(p)).toEqual({ ok: true })
  })
  it("nom obligatoire", () => expect(errs(validatePromotion(multiServices({ name: "  " })))).toContain("Donnez un nom à l'offre."))
  it("au moins un palier", () => expect(errs(validatePromotion(multiServices({ tiers: [] })))).toContain("Ajoutez au moins un palier."))
  it("paliers en double refusés", () => {
    const p = multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }, { minQuantity: 2, value: { type: "percent", bps: 1500 } }] })
    expect(errs(validatePromotion(p)).join(" ")).toMatch(/Deux paliers/)
  })
  it("quantité minimale ≥ 1, entière", () => {
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 0, value: { type: "percent", bps: 1000 } }] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 1.5, value: { type: "percent", bps: 1000 } }] })).ok).toBe(false)
  })
  it("pourcentage entre 1 et 10000 points de base", () => {
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 0 } }] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 10001 } }] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 10000 } }] })).ok).toBe(true)
  })
  it("montants en centimes entiers > 0", () => {
    expect(validatePromotion(fixedTotal({ tiers: [{ minQuantity: 2, value: { type: "fixed_total", cents: 0 } }] })).ok).toBe(false)
    expect(validatePromotion(fixedTotal({ tiers: [{ minQuantity: 2, value: { type: "fixed_total", cents: 99.5 } }] })).ok).toBe(false)
  })
  it("modes par type : réduction en euros interdite en multi-prestations, prix fixe interdit en prestation + option", () => {
    expect(validatePromotion(multiServices({ tiers: [{ minQuantity: 2, value: { type: "amount", cents: 1000 } }] })).ok).toBe(false)
    expect(validatePromotion(serviceOption({ tiers: [{ minQuantity: 1, value: { type: "fixed_total", cents: 1000 } }] })).ok).toBe(false)
    expect(validatePromotion(multiOptions({ tiers: [{ minQuantity: 2, value: { type: "amount", cents: 1000 } }] })).ok).toBe(true)
  })
  it("périmètre : null = tout, liste vide refusée", () => {
    expect(validatePromotion(multiServices({ eligibleServiceIds: [] })).ok).toBe(false)
    expect(validatePromotion(multiServices({ eligibleServiceIds: [1, 2] })).ok).toBe(true)
    expect(validatePromotion(multiOptions({ eligibleOptionIds: [0] })).ok).toBe(false)
  })
  it("prestation + option : déclencheurs obligatoires, une seule réduction", () => {
    expect(validatePromotion(serviceOption({ trigger: { serviceId: 0, optionId: 1, appliesTo: "both" } })).ok).toBe(false)
    expect(
      validatePromotion(serviceOption({ tiers: [{ minQuantity: 1, value: { type: "amount", cents: 1 } }, { minQuantity: 2, value: { type: "amount", cents: 2 } }] })).ok,
    ).toBe(false)
  })
  it("dates seules (sans heure) refusées : ambiguës, la fin de journée serait exclue", () => {
    expect(validatePromotion(multiServices({ endsAt: "2026-10-31" })).ok).toBe(false)
    expect(validatePromotion(multiServices({ endsAt: "2026-10-31T23:59:59+01:00" })).ok).toBe(true)
    // Le 31 à 10 h (Paris), une offre valable « jusqu'au 31 inclus » est bien en vigueur.
    expect(isPromotionLive(multiServices({ endsAt: "2026-10-31T23:59:59+01:00" }), new Date("2026-10-31T10:00:00+01:00"))).toBe(true)
  })
  it("dates : fin après début, dates illisibles refusées", () => {
    expect(validatePromotion(multiServices({ startsAt: "2026-11-02T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" })).ok).toBe(false)
    expect(validatePromotion(multiServices({ startsAt: "pas une date" })).ok).toBe(false)
  })
})

describe("isPromotionLive", () => {
  const now = new Date("2026-10-20T12:00:00Z")
  it("active et dans ses dates", () => expect(isPromotionLive(multiServices({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-31T23:59:59Z" }), now)).toBe(true))
  it("désactivée", () => expect(isPromotionLive(multiServices({ active: false }), now)).toBe(false))
  it("pas encore commencée / terminée", () => {
    expect(isPromotionLive(multiServices({ startsAt: "2026-10-21T00:00:00Z" }), now)).toBe(false)
    expect(isPromotionLive(multiServices({ endsAt: "2026-10-19T23:59:59Z" }), now)).toBe(false)
  })
  it("invalide → jamais en vigueur", () => expect(isPromotionLive(multiServices({ tiers: [] }), now)).toBe(false))
})

describe("validateEquivalence", () => {
  it("motif obligatoire", () => {
    expect(validateEquivalence({ id: 1, a: { type: "service", id: 158 }, b: { type: "option", id: 98 }, reason: " " }).ok).toBe(false)
    expect(validateEquivalence({ id: 1, a: { type: "service", id: 158 }, b: { type: "option", id: 98 }, reason: "Même traitement" }).ok).toBe(true)
  })
  it("deux éléments différents", () => {
    expect(validateEquivalence({ id: 1, a: { type: "option", id: 98 }, b: { type: "option", id: 98 }, reason: "x" }).ok).toBe(false)
  })
})
