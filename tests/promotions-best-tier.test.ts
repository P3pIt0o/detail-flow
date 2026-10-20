import { describe, expect, it } from "vitest"
import { analyzeTiers, priceCart, suggestUpsells, type MultiServicesPromotion } from "@/lib/booking/promotions"
import { formatPercent } from "@/lib/booking/promotions/tiers"
import { cart, fixedTotal, multiOptions, multiServices, serviceOption, veh } from "./helpers/promotions-fixtures"

/**
 * D-B1 (a), décidé le 20/10/2026 : parmi les paliers ATTEINTS, le moteur applique
 * celui qui donne le meilleur prix au client. Un prix total fixe d'un palier
 * inférieur ne couvre que son nombre de prestations (les plus chères) ; les
 * autres restent au tarif normal.
 */

const pct = (...t: [number, number][]) => multiServices({ tiers: t.map(([minQuantity, bps]) => ({ minQuantity, value: { type: "percent" as const, bps } })) })
const fixed = (...t: [number, number][]) => fixedTotal({ tiers: t.map(([minQuantity, cents]) => ({ minQuantity, value: { type: "fixed_total" as const, cents } })) })

describe("D-B1 — prix total fixe", () => {
  it("paliers incohérents : ajouter une prestation à 20 € ne coûte que 20 € (120 € et non 150 €)", () => {
    const p = fixed([2, 10000], [3, 15000])
    expect(priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 8000]])), promotions: [p] }).finalCents).toBe(10000)
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 8000], [3, 2000]])), promotions: [p] })
    expect(r.finalCents).toBe(12000)
    expect(r.promotions[0].tier.minQuantity).toBe(2)
    // Le palier « 2 prestations » ne couvre que les deux plus chères.
    expect(Object.keys(r.promotions[0].allocations).sort()).toEqual(["v1|s|1", "v1|s|2"])
  })
  it("paliers cohérents : comportement inchangé (palier du nombre réel)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 8000], [2, 8000], [3, 8000]])), promotions: [fixed([2, 10000], [3, 15000])] })
    expect(r.finalCents).toBe(15000)
    expect(r.promotions[0].tier.minQuantity).toBe(3)
    const five = cart(veh("v1", [[1, 6000], [2, 6000], [3, 6000], [4, 6000], [5, 6000]]))
    expect(priceCart({ cart: five, promotions: [fixedTotal()] }).finalCents).toBe(19000)
  })
  it("un palier inférieur ne s'applique jamais à plus de prestations que sa tranche (2 pour 100 € ≠ 3 pour 100 €)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 9000], [2, 9000], [3, 9000]])), promotions: [fixed([2, 10000], [3, 25000])] })
    // Palier 3 : 250 € ; palier 2 : 100 € + 90 € = 190 € → 190 €.
    expect(r.finalCents).toBe(19000)
  })
  it("le dernier palier reste ouvert (« ou plus »)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 9000], [2, 9000], [3, 9000], [4, 9000]])), promotions: [fixed([2, 10000])] })
    expect(r.finalCents).toBe(10000)
  })
  it("options incluses : seules celles des véhicules des prestations couvertes", () => {
    const p: MultiServicesPromotion = { ...fixed([2, 10000], [3, 30000]), includeOptions: true }
    const c = cart(veh("v1", [[1, 8000]], [[100, 2000]]), veh("v2", [[2, 8000]]), veh("v3", [[3, 1000]], [[101, 3000]]))
    const r = priceCart({ cart: c, promotions: [p] })
    // Palier 2 sur v1 + v2 (8000 + 2000 + 8000 = 18000 → 10000) ; v3 au tarif normal (4000).
    expect(r.finalCents).toBe(14000)
  })
})

describe("D-B1 — pourcentages et euros", () => {
  it("pourcentages décroissants : le client garde −10 % avec 3 prestations", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 10000], [2, 10000], [3, 10000]])), promotions: [pct([2, 1000], [3, 500])] })
    expect(r.totalDiscountCents).toBe(3000)
    expect(r.promotions[0].tier.minQuantity).toBe(2)
  })
  it("multi-options en euros décroissants : le client garde −10 €", () => {
    const p = multiOptions({ tiers: [{ minQuantity: 2, value: { type: "amount", cents: 1000 } }, { minQuantity: 3, value: { type: "amount", cents: 500 } }] })
    expect(priceCart({ cart: cart(veh("v1", [[1, 5000]], [[100, 3000], [101, 3000], [102, 3000]])), promotions: [p] }).totalDiscountCents).toBe(1000)
  })
  it("égalité : le palier du nombre réel est indiqué", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 10000], [2, 10000], [3, 10000]])), promotions: [pct([2, 1000], [3, 1000])] })
    expect(r.promotions[0].tier.minQuantity).toBe(3)
  })
})

describe("D-B1 — propriété : ajouter une prestation ne coûte jamais plus que son prix", () => {
  it("2 000 configurations aléatoires (cohérentes ou non), pourcentages et prix fixes", () => {
    let seed = 2026
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
    for (let i = 0; i < 2000; i++) {
      const mins = [...new Set(Array.from({ length: 1 + rnd(4) }, () => 1 + rnd(5)))]
      const p = rnd(2)
        ? pct(...mins.map((m) => [m, 1 + rnd(10000)] as [number, number]))
        : fixed(...mins.map((m) => [m, 1 + rnd(40000)] as [number, number]))
      const items = Array.from({ length: 1 + rnd(6) }, (_, k) => [k + 1, rnd(15000)] as [number, number])
      const before = priceCart({ cart: cart(veh("v1", items)), promotions: [p] })
      const added: [number, number] = [99, rnd(15000)]
      const after = priceCart({ cart: cart(veh("v1", [...items, added])), promotions: [p] })
      expect(after.finalCents <= before.finalCents + added[1]).toBe(true)
      expect(after.finalCents <= after.normalCents).toBe(true)
    }
  })
})

describe("suggestions cohérentes avec D-B1", () => {
  it("pas de suggestion vers un palier moins avantageux", () => {
    const s = suggestUpsells({ cart: cart(veh("v1", [[1, 5000], [2, 5000]])), promotions: [pct([2, 1000], [3, 500])], catalog: { optionPriceCents: () => undefined, servicePriceCents: () => undefined } })
    expect(s).toEqual([])
  })
  it("suggestion vers le prochain palier réellement plus avantageux", () => {
    const s = suggestUpsells({ cart: cart(veh("v1", [[1, 5000], [2, 5000]])), promotions: [pct([2, 1000], [3, 500], [4, 2000])], catalog: { optionPriceCents: () => undefined, servicePriceCents: () => undefined } })
    expect(s[0]).toMatchObject({ kind: "next_tier", missingQuantity: 2, nextTier: { minQuantity: 4 } })
  })
})

describe("alerte admin : paliers incohérents (analyzeTiers)", () => {
  it("formatPercent sans dépendance à la locale", () => {
    expect([formatPercent(1000), formatPercent(1250), formatPercent(1005), formatPercent(10000)]).toEqual(["10 %", "12,5 %", "10,05 %", "100 %"])
  })
  it("paliers cohérents en pourcentage : aucune alerte", () => expect(analyzeTiers(multiServices())).toEqual([]))
  it("pourcentage pas plus avantageux : alerte claire", () => {
    const w = analyzeTiers(pct([2, 1000], [3, 500]))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ severity: "warning", code: "not_more_advantageous", minQuantity: 3 })
    expect(w[0].message).toBe(
      "Le palier « 3 prestations ou plus : −5 % » n'est pas plus avantageux que « 2 prestations : −10 % ». Vos clients garderont automatiquement « 2 prestations : −10 % » : augmentez la réduction de ce palier ou supprimez-le.",
    )
  })
  it("euros (multi-options) pas plus avantageux", () => {
    const p = multiOptions({ tiers: [{ minQuantity: 2, value: { type: "amount", cents: 1000 } }, { minQuantity: 3, value: { type: "amount", cents: 1000 } }] })
    expect(analyzeTiers(p)[0]).toMatchObject({ code: "not_more_advantageous", minQuantity: 3 })
  })
  it("prix total qui baisse ou stagne : alerte", () => {
    expect(analyzeTiers(fixed([2, 10000], [3, 9000]))[0]).toMatchObject({ severity: "warning", code: "total_decreases" })
    expect(analyzeTiers(fixed([2, 10000], [3, 10000]))[0].message).toContain("reste identique")
  })
  it("prix total : écart supérieur au prix de toutes les prestations → palier inutile", () => {
    const w = analyzeTiers(fixed([2, 10000], [3, 15000]), { minEligiblePriceCents: 2000, maxEligiblePriceCents: 4000 })
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ severity: "warning", code: "tier_never_used", minQuantity: 3 })
  })
  it("prix total : information sur l'écart entre paliers, sans alerte si toutes les prestations le dépassent", () => {
    const info = analyzeTiers(fixedTotal())
    expect(info.map((x) => x.code)).toEqual(["tier_step", "tier_step"])
    expect(info[0].message).toBe(
      "Entre « 2 prestations : 100 € au total » et « 3 prestations : 150 € au total », le prix total augmente de 50 €. Ce palier ne s'applique que si la prestation supplémentaire la moins chère vaut plus de 50 € ; sinon le client garde automatiquement « 2 prestations : 100 € au total », plus avantageux.",
    )
    expect(analyzeTiers(fixedTotal(), { minEligiblePriceCents: 6000, maxEligiblePriceCents: 12000 })).toEqual([])
  })
  it("gratuit et remise dès 1 prestation signalés", () => {
    expect(analyzeTiers(pct([1, 10000])).map((x) => x.code)).toEqual(["free", "starts_at_one"])
  })
  it("prestation + option : non concernée", () => expect(analyzeTiers(serviceOption())).toEqual([]))
})
