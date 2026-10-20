import { describe, expect, it } from "vitest"
import { suggestUpsells, type CatalogPrices, type EquivalenceRule } from "@/lib/booking/promotions"
import { CLZ, cart, multiOptions, multiServices, serviceOption, veh } from "./helpers/promotions-fixtures"

const catalog = (options: Record<number, number>, services: Record<number, number> = {}): CatalogPrices => ({
  optionPriceCents: (id) => options[id],
  servicePriceCents: (_v, id) => services[id],
})
const PHARES: EquivalenceRule = { id: 1, a: { type: "service", id: CLZ.pharesService }, b: { type: "option", id: CLZ.pharesOption }, reason: "Même traitement." }

describe("suggestions de ventes additionnelles", () => {
  it("palier suivant : « encore 1 prestation pour −10 % »", () => {
    const s = suggestUpsells({ cart: cart(veh("v1", [[1, 8000]])), promotions: [multiServices()], catalog: catalog({}) })
    expect(s).toEqual([{ kind: "next_tier", promotionId: 1, name: "Plusieurs prestations", missingQuantity: 1, itemType: "service", nextTier: { minQuantity: 2, value: { type: "percent", bps: 1000 } } }])
  })
  it("palier suivant pour les options", () => {
    const s = suggestUpsells({ cart: cart(veh("v1", [[1, 8000]], [[100, 1000]])), promotions: [multiOptions()], catalog: catalog({}) })
    expect(s[0]).toMatchObject({ kind: "next_tier", itemType: "option", missingQuantity: 1 })
  })
  it("dernier palier atteint : plus rien à suggérer", () => {
    const four = cart(veh("v1", [[1, 1000], [2, 1000], [3, 1000], [4, 1000]]))
    expect(suggestUpsells({ cart: four, promotions: [multiServices()], catalog: catalog({}) })).toEqual([])
  })
  it("compléter une combinaison prestation + option", () => {
    const s = suggestUpsells({ cart: cart(veh("v1", [[10, 8000]])), promotions: [serviceOption()], catalog: catalog({ 100: 3000 }) })
    expect(s[0]).toMatchObject({ kind: "complete_combination", vehicleKey: "v1", add: { type: "option", id: 100 } })
  })
  it("élément indisponible au catalogue du client : jamais proposé", () => {
    expect(suggestUpsells({ cart: cart(veh("v1", [[10, 8000]])), promotions: [serviceOption()], catalog: catalog({}) })).toEqual([])
  })
  it("Cleanyzer : phares 158 avec un lavage → proposer l'option 98, 15 € d'économie", () => {
    const s = suggestUpsells({
      cart: cart(veh("v1", [[CLZ.lavageInterieurEco, 5000], [CLZ.pharesService, 6500]])),
      equivalences: [PHARES],
      catalog: catalog({ [CLZ.pharesOption]: 5000 }),
    })
    expect(s).toEqual([
      { kind: "cheaper_equivalent", ruleId: 1, vehicleKey: "v1", replace: { type: "service", id: CLZ.pharesService }, by: { type: "option", id: CLZ.pharesOption }, savingCents: 1500, reason: "Même traitement." },
    ])
  })
  it("Cleanyzer : phares 158 seule → pas de bascule (une option ne peut pas rester seule)", () => {
    expect(suggestUpsells({ cart: cart(veh("v1", [[CLZ.pharesService, 6500]])), equivalences: [PHARES], catalog: catalog({ [CLZ.pharesOption]: 5000 }) })).toEqual([])
  })
  it("au plus 2 suggestions par défaut, panier jamais modifié", () => {
    const c = cart(veh("v1", [[1, 8000], [10, 5000]], [[100, 3000]]), veh("v2", [[10, 5000]]))
    const copy = JSON.parse(JSON.stringify(c))
    const s = suggestUpsells({ cart: c, promotions: [multiServices({ tiers: [{ minQuantity: 9, value: { type: "percent", bps: 1000 } }] }), multiOptions(), serviceOption()], catalog: catalog({ 100: 3000 }) })
    expect(s.length <= 2).toBe(true)
    expect(c).toEqual(copy)
  })
})
