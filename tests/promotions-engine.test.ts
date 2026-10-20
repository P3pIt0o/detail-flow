import { describe, expect, it } from "vitest"
import { evaluatePromotion, cartUnits, previewPromotion, priceCart, type Promotion } from "@/lib/booking/promotions"
import { cart, fixedTotal, multiOptions, multiServices, serviceOption, veh } from "./helpers/promotions-fixtures"

const units = (c: ReturnType<typeof cart>) => cartUnits(c)
// Panier du CDC §7.3 : 145 € de prestations (80 € + 65 €).
const cdc = cart(veh("v1", [[1, 8000], [2, 6500]], [[100, 3000]]))

describe("multi-prestations — pourcentage par paliers", () => {
  it("CDC : 145 € −10 % → économie 14,50 €, prix 130,50 € (options exclues par défaut)", () => {
    const r = priceCart({ cart: cdc, promotions: [multiServices()] })
    expect(r.promotions[0].discountCents).toBe(1450)
    expect(r.promotions[0].eligibleCents).toBe(14500)
    expect(r.normalCents).toBe(17500)
    expect(r.finalCents).toBe(17500 - 1450)
  })
  it("1 prestation : aucun palier", () => {
    expect(priceCart({ cart: cart(veh("v1", [[1, 8000]])), promotions: [multiServices()] }).totalDiscountCents).toBe(0)
  })
  it("3 → −15 % ; 4 « ou plus » → −20 % (5 prestations)", () => {
    expect(priceCart({ cart: cart(veh("v1", [[1, 1000], [2, 1000], [3, 1000]])), promotions: [multiServices()] }).totalDiscountCents).toBe(450)
    const five = cart(veh("v1", [[1, 1000], [2, 1000], [3, 1000], [4, 1000], [5, 1000]]))
    expect(priceCart({ cart: five, promotions: [multiServices()] }).totalDiscountCents).toBe(1000)
  })
  it("comptage sur TOUTE la réservation (plusieurs véhicules)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000]]), veh("v2", [[2, 6500]])), promotions: [multiServices()] })
    expect(r.promotions[0].quantity).toBe(2)
    expect(r.totalDiscountCents).toBe(1450)
  })
  it("seules les prestations réellement facturées (prix > 0) comptent", () => {
    expect(priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 0]])), promotions: [multiServices()] }).totalDiscountCents).toBe(0)
  })
  it("prestations éligibles uniquement : les autres restent au tarif normal", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 6500], [3, 5000]])), promotions: [multiServices({ eligibleServiceIds: [1, 2] })] })
    expect(r.promotions[0].quantity).toBe(2)
    expect(r.promotions[0].eligibleCents).toBe(14500)
    expect(r.promotions[0].allocations["v1|s|3"]).toBeUndefined()
  })
  it("options incluses sur demande : montant remisé + options, comptage inchangé", () => {
    const r = priceCart({ cart: cdc, promotions: [multiServices({ includeOptions: true })] })
    expect(r.promotions[0].quantity).toBe(2)
    expect(r.promotions[0].eligibleCents).toBe(17500)
    expect(r.totalDiscountCents).toBe(1750)
  })
  it("options incluses : seulement celles des véhicules qui portent une prestation éligible", () => {
    const c = cart(veh("v1", [[1, 8000], [2, 6500]]), veh("v2", [[9, 5000]], [[100, 3000]]))
    const r = priceCart({ cart: c, promotions: [multiServices({ eligibleServiceIds: [1, 2], includeOptions: true })] })
    expect(r.promotions[0].eligibleCents).toBe(14500)
  })
})

describe("multi-prestations — prix total fixe", () => {
  it("CDC : 145 € pour 2 prestations → prix 100 €, économie 45 €", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 6500]])), promotions: [fixedTotal()] })
    expect(r.totalDiscountCents).toBe(4500)
    expect(r.finalCents).toBe(10000)
  })
  it("prix normal inférieur au prix fixe : prix normal conservé (jamais d'augmentation)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 4000], [2, 5000]])), promotions: [fixedTotal()] })
    expect(r.totalDiscountCents).toBe(0)
    expect(r.finalCents).toBe(9000)
  })
  it("le prix fixe ne porte que sur les éléments éligibles ; le reste est ajouté au tarif normal", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 6500], [3, 5000]], [[100, 3000]])), promotions: [fixedTotal({ eligibleServiceIds: [1, 2] })] })
    expect(r.finalCents).toBe(10000 + 5000 + 3000)
  })
  it("4 ou plus → 190 €", () => {
    const c = cart(veh("v1", [[1, 6000], [2, 6000], [3, 6000], [4, 6000], [5, 6000]]))
    expect(priceCart({ cart: c, promotions: [fixedTotal()] }).finalCents).toBe(19000)
  })
})

describe("prestation + option", () => {
  const c = cart(veh("v1", [[10, 8000]], [[100, 3000]]))
  it("combinaison présente : −15 € ventilés sur la prestation et l'option", () => {
    const r = priceCart({ cart: c, promotions: [serviceOption()] })
    expect(r.totalDiscountCents).toBe(1500)
    expect(r.promotions[0].allocations).toEqual({ "v1|s|10": 1091, "v1|o|100": 409 })
  })
  it("combinaison absente (option sur un autre véhicule) : rien", () => {
    const r = priceCart({ cart: cart(veh("v1", [[10, 8000]]), veh("v2", [[11, 5000]], [[100, 3000]])), promotions: [serviceOption()] })
    expect(r.totalDiscountCents).toBe(0)
  })
  it("réduction plafonnée à l'élément visé (option seule)", () => {
    const r = priceCart({ cart: c, promotions: [serviceOption({ trigger: { serviceId: 10, optionId: 100, appliesTo: "option" }, tiers: [{ minQuantity: 1, value: { type: "amount", cents: 5000 } }] })] })
    expect(r.totalDiscountCents).toBe(3000)
  })
  it("une remise par véhicule qui remplit la combinaison", () => {
    const r = priceCart({ cart: cart(veh("v1", [[10, 8000]], [[100, 3000]]), veh("v2", [[10, 8000]], [[100, 3000]])), promotions: [serviceOption()] })
    expect(r.promotions[0].quantity).toBe(2)
    expect(r.totalDiscountCents).toBe(3000)
  })
  it("pourcentage sur la prestation seule", () => {
    const r = priceCart({ cart: c, promotions: [serviceOption({ trigger: { serviceId: 10, optionId: 100, appliesTo: "service" }, tiers: [{ minQuantity: 1, value: { type: "percent", bps: 1000 } }] })] })
    expect(r.totalDiscountCents).toBe(800)
  })
})

describe("multi-options", () => {
  it("2 options → −5 % ; 3 → −10 %", () => {
    expect(priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 4900], [101, 3100]])), promotions: [multiOptions()] }).totalDiscountCents).toBe(400)
    expect(priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 4000], [101, 3000], [102, 3000]])), promotions: [multiOptions()] }).totalDiscountCents).toBe(1000)
  })
  it("réduction fixe en euros, plafonnée", () => {
    const p = multiOptions({ tiers: [{ minQuantity: 2, value: { type: "amount", cents: 99900 } }] })
    expect(priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 900], [101, 1100]])), promotions: [p] }).totalDiscountCents).toBe(2000)
  })
  it("option identique en double sur un véhicule : comptée une fois", () => {
    expect(priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 4900], [100, 4900]])), promotions: [multiOptions()] }).totalDiscountCents).toBe(0)
  })
  it("même option sur deux véhicules : deux achats réels", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 4000]]), veh("v2", [[1, 5000]], [[100, 4000]])), promotions: [multiOptions()] })
    expect(r.promotions[0].quantity).toBe(2)
  })
  it("options non éligibles exclues", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 4000], [101, 3000], [102, 3000]])), promotions: [multiOptions({ eligibleOptionIds: [100, 101] })] })
    expect(r.promotions[0].quantity).toBe(2)
    expect(r.totalDiscountCents).toBe(350)
  })
})

describe("cumul et priorité", () => {
  const c = cart(veh("v1", [[1, 8000], [2, 6500]], [[100, 4000], [101, 3000]]))
  it("non cumulables : la meilleure offre seule", () => {
    const r = priceCart({ cart: c, promotions: [multiServices(), fixedTotal(), multiOptions()] })
    expect(r.promotions.map((p) => p.promotionId)).toEqual([2])
    expect(r.totalDiscountCents).toBe(4500)
  })
  it("une offre non cumulable n'est jamais combinée, même avec une offre cumulable", () => {
    const r = priceCart({ cart: c, promotions: [fixedTotal(), multiOptions({ stackable: true })] })
    expect(r.promotions).toHaveLength(1)
    expect(r.promotions[0].promotionId).toBe(2)
  })
  it("meilleure offre non cumulable > total des offres cumulables : l'offre seule est retenue", () => {
    const r = priceCart({ cart: c, promotions: [fixedTotal(), multiServices({ stackable: true }), multiOptions({ stackable: true })] })
    expect(r.promotions.map((p) => p.promotionId)).toEqual([2])
    expect(r.totalDiscountCents).toBe(4500)
  })
  it("total des offres cumulables > meilleure offre non cumulable : les cumulables sont retenues, jamais l'autre", () => {
    const small = fixedTotal({ id: 6, tiers: [{ minQuantity: 2, value: { type: "fixed_total", cents: 14000 } }] })
    const r = priceCart({ cart: c, promotions: [small, multiServices({ stackable: true }), multiOptions({ stackable: true })] })
    expect(r.promotions.map((p) => p.promotionId).sort()).toEqual([1, 4])
    expect(r.totalDiscountCents).toBe(1800)
  })
  it("offres cumulables sur des éléments différents : additionnées", () => {
    const r = priceCart({ cart: c, promotions: [multiServices({ stackable: true }), multiOptions({ stackable: true })] })
    expect(r.promotions.map((p) => p.promotionId).sort()).toEqual([1, 4])
    expect(r.totalDiscountCents).toBe(1450 + 350)
  })
  it("offres cumulables sur les mêmes éléments : la seconde s'applique sur le reste (pas de double remise)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 6500]])), promotions: [multiServices({ stackable: true }), fixedTotal({ stackable: true })] })
    expect(r.promotions.map((p) => p.promotionId)).toEqual([2, 1])
    expect(r.totalDiscountCents).toBe(4500 + 1000)
    for (const u of r.units) {
      const used = r.promotions.reduce((s, p) => s + (p.allocations[u.key] ?? 0), 0)
      expect(used <= u.priceCents).toBe(true)
    }
  })
  it("égalité : la priorité la plus haute, puis le plus petit identifiant", () => {
    const a = multiServices({ id: 7, priority: 0 })
    const b = multiServices({ id: 5, priority: 0 })
    const hi = multiServices({ id: 9, priority: 3 })
    expect(priceCart({ cart: c, promotions: [a, b] }).promotions[0].promotionId).toBe(5)
    expect(priceCart({ cart: c, promotions: [a, b, hi] }).promotions[0].promotionId).toBe(9)
  })
  it("offres désactivées, hors dates ou invalides ignorées", () => {
    const now = new Date("2026-10-20T12:00:00Z")
    const promos: Promotion[] = [fixedTotal({ active: false }), fixedTotal({ id: 8, endsAt: "2026-10-01T00:00:00Z" }), fixedTotal({ id: 9, tiers: [] })]
    expect(priceCart({ cart: c, promotions: promos, now }).totalDiscountCents).toBe(0)
  })
})

describe("codes promo", () => {
  const c = cart(veh("v1", [[1, 8000], [2, 6500]]))
  const code = (discountCents: number, targetServiceIds: number[] | null = null) => ({ code: "TEST", discountCents, targetServiceIds })

  it("sans offre : code appliqué", () => {
    const r = priceCart({ cart: c, promoCode: code(1000) })
    expect(r.promoCode).toMatchObject({ status: "applied", discountCents: 1000 })
    expect(r.finalCents).toBe(13500)
  })
  it("offre non cumulable plus avantageuse : code écarté explicitement", () => {
    const r = priceCart({ cart: c, promotions: [fixedTotal()], promoCode: code(1000) })
    expect(r.promoCode).toMatchObject({ status: "rejected_not_combinable", promotionDiscountCents: 4500 })
    expect(r.totalDiscountCents).toBe(4500)
  })
  it("égalité stricte : l'offre est conservée, le code écarté", () => {
    expect(priceCart({ cart: c, promotions: [fixedTotal()], promoCode: code(4500) }).promoCode.status).toBe("rejected_not_combinable")
  })
  it("code plus avantageux : il remplace l'offre non cumulable", () => {
    const r = priceCart({ cart: c, promotions: [fixedTotal()], promoCode: code(6000) })
    expect(r.promotions).toEqual([])
    expect(r.promoCode).toMatchObject({ status: "applied", discountCents: 6000 })
  })
  it("offre autorisant les codes : cumul, code plafonné au reste", () => {
    const r = priceCart({ cart: c, promotions: [fixedTotal({ stackableWithPromoCode: true })], promoCode: code(20000) })
    expect(r.promotionDiscountCents).toBe(4500)
    expect(r.promoCode).toMatchObject({ status: "applied", discountCents: 10000 })
    expect(r.finalCents).toBe(0)
  })
  it("code visant une prestation absente : écarté pour « aucun montant », pas pour conflit d'offres", () => {
    expect(priceCart({ cart: c, promoCode: code(1000, [99]) }).promoCode).toEqual({ status: "rejected_no_eligible_amount", code: "TEST" })
    expect(priceCart({ cart: c, promotions: [fixedTotal()], promoCode: code(1000, [99]) }).promoCode.status).toBe("rejected_no_eligible_amount")
  })
  it("code ciblé : seulement sur les prestations visées, sur leur reste", () => {
    const r = priceCart({ cart: c, promotions: [multiServices({ stackableWithPromoCode: true })], promoCode: code(99999, [2]) })
    expect(r.promoCode.status).toBe("applied")
    if (r.promoCode.status === "applied") expect(Object.keys(r.promoCode.allocations)).toEqual(["v1|s|2"])
    expect(r.totalDiscountCents).toBe(8000 + 6500 - 7200)
  })
})

describe("aperçu admin", () => {
  it("offre en brouillon (inactive) prévisualisée sur un panier d'exemple", () => {
    const r = previewPromotion(fixedTotal({ active: false }), cart(veh("v1", [[1, 8000], [2, 6500]])))
    expect([r.normalCents, r.totalDiscountCents, r.finalCents]).toEqual([14500, 4500, 10000])
  })
  it("evaluatePromotion isolée", () => {
    expect(evaluatePromotion(multiServices(), units(cart(veh("v1", [[1, 8000]]))))).toBeNull()
  })
})

describe("invariants (paniers et offres aléatoires, graine fixe)", () => {
  let seed = 7
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
  const kinds = [multiServices, fixedTotal, serviceOption, multiOptions]

  it("1 000 cas : total ≥ 0, remise ≤ prix normal, ventilation ≤ prix de chaque élément, déterministe", () => {
    for (let i = 0; i < 1000; i++) {
      const vehicles = Array.from({ length: 1 + rnd(3) }, (_, k) =>
        veh(
          `v${k}`,
          Array.from({ length: rnd(4) }, () => [1 + rnd(12), rnd(15000)] as [number, number]),
          Array.from({ length: rnd(4) }, () => [100 + rnd(4), rnd(6000)] as [number, number]),
        ),
      )
      const promos = Array.from({ length: rnd(4) }, (_, k) =>
        kinds[rnd(4)]({ id: k + 1, stackable: rnd(2) === 1, stackableWithPromoCode: rnd(2) === 1, priority: rnd(3) }),
      )
      const input = { cart: cart(...vehicles), promotions: promos, promoCode: rnd(2) ? { code: "X", discountCents: rnd(20000), targetServiceIds: null } : null }
      const r = priceCart(input)
      expect(r.finalCents >= 0).toBe(true)
      expect(r.totalDiscountCents <= r.normalCents).toBe(true)
      expect(r.finalCents).toBe(r.normalCents - r.totalDiscountCents)
      const code = r.promoCode.status === "applied" ? r.promoCode.allocations : {}
      for (const u of r.units) {
        const used = r.promotions.reduce((s, p) => s + (p.allocations[u.key] ?? 0), 0) + (code[u.key] ?? 0)
        expect(used <= u.priceCents).toBe(true)
      }
      const nonStack = r.promotions.filter((p) => !promos.find((x) => x.id === p.promotionId)!.stackable)
      if (nonStack.length > 0) expect(r.promotions).toHaveLength(1)
      expect(priceCart(input)).toEqual(r)
    }
  })
})
