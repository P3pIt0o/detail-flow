import { describe, expect, it } from "vitest"
import { InvalidCartError, normalizeCart, priceCart, type EquivalenceRule } from "@/lib/booking/promotions"
import { CLZ, cart, veh } from "./helpers/promotions-fixtures"

/** Équivalence que Tom configurera dans son admin (non créée automatiquement). */
const PHARES: EquivalenceRule = {
  id: 1,
  a: { type: "service", id: CLZ.pharesService },
  b: { type: "option", id: CLZ.pharesOption },
  reason: "Même rénovation des phares : une seule fois par véhicule.",
}

describe("panier libre — aucune restriction par défaut", () => {
  it("toutes catégories combinées sur un véhicule, sans règle : tout est facturé", () => {
    const c = cart(veh("v1", [[CLZ.lavageInterieurEco, 5000], [CLZ.lavageExterieurEco, 3000], [CLZ.pharesService, 6500]], [[CLZ.pharesOption, 5000], [7, 4900]]))
    const r = priceCart({ cart: c })
    expect(r.adjustments).toEqual([])
    expect(r.normalCents).toBe(5000 + 3000 + 6500 + 5000 + 4900)
    expect(r.finalCents).toBe(r.normalCents)
  })

  it("option phares 98 avec un lavage intérieur ET avec un lavage extérieur", () => {
    for (const lavage of [CLZ.lavageInterieurEco, CLZ.lavageExterieurEco]) {
      const r = priceCart({ cart: cart(veh("v1", [[lavage, 5000]], [[CLZ.pharesOption, 5000]])), equivalences: [PHARES] })
      expect(r.adjustments).toEqual([])
      expect(r.finalCents).toBe(10000)
    }
  })

  it("prestation phares 158 combinée à d'autres prestations", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.pharesService, 6500], [CLZ.lavageInterieurEco, 5000]])), equivalences: [PHARES] })
    expect(r.adjustments).toEqual([])
    expect(r.finalCents).toBe(11500)
  })

  it("158 sur un véhicule, lavage + 98 sur un autre : rien n'est retiré", () => {
    const r = priceCart({
      cart: cart(veh("v1", [[CLZ.pharesService, 6500]]), veh("v2", [[CLZ.lavageExterieurEco, 3000]], [[CLZ.pharesOption, 5000]])),
      equivalences: [PHARES],
    })
    expect(r.adjustments).toEqual([])
    expect(r.finalCents).toBe(14500)
  })
})

describe("doublons exacts — fusion, jamais de blocage", () => {
  it("même prestation et même option deux fois sur un véhicule", () => {
    const { cart: c, adjustments } = normalizeCart(cart(veh("v1", [[1, 5000], [1, 5000]], [[7, 900], [7, 900]])))
    expect(c.vehicles[0].services).toHaveLength(1)
    expect(c.vehicles[0].options).toHaveLength(1)
    expect(adjustments).toEqual([
      { kind: "duplicate_merged", vehicleKey: "v1", item: { type: "service", id: 1 } },
      { kind: "duplicate_merged", vehicleKey: "v1", item: { type: "option", id: 7 } },
    ])
  })
  it("même prestation sur deux véhicules : deux ventes légitimes", () => {
    const r = priceCart({ cart: cart(veh("v1", [[1, 5000]]), veh("v2", [[1, 5000]])) })
    expect(r.adjustments).toEqual([])
    expect(r.normalCents).toBe(10000)
  })
})

describe("équivalence phares 158 ↔ 98 — jamais facturée deux fois sur un véhicule", () => {
  it("158 + 98 + lavage : on garde l'option (50 €), la moins chère", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.lavageInterieurEco, 5000], [CLZ.pharesService, 6500]], [[CLZ.pharesOption, 5000]])), equivalences: [PHARES] })
    expect(r.finalCents).toBe(10000)
    expect(r.adjustments).toEqual([
      {
        kind: "equivalence_resolved",
        vehicleKey: "v1",
        ruleId: 1,
        kept: { type: "option", id: CLZ.pharesOption },
        removed: { type: "service", id: CLZ.pharesService },
        reason: "Même rénovation des phares : une seule fois par véhicule.",
      },
    ])
  })
  it("158 + 98 sans autre prestation : on garde la prestation (une option ne peut pas rester seule)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.pharesService, 6500]], [[CLZ.pharesOption, 5000]])), equivalences: [PHARES] })
    expect(r.finalCents).toBe(6500)
    expect(r.cart.vehicles[0].options).toEqual([])
  })
  it("règle sans motif : ignorée (aucune règle invalide appliquée)", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.pharesService, 6500], [1, 5000]], [[CLZ.pharesOption, 5000]])), equivalences: [{ ...PHARES, reason: "" }] })
    expect(r.adjustments).toEqual([])
  })
})

describe("panier invalide (erreur de programmation côté serveur)", () => {
  it("prix non entier ou négatif refusé", () => {
    expect(() => normalizeCart(cart(veh("v1", [[1, 10.5]])))).toThrow(InvalidCartError)
    expect(() => normalizeCart(cart(veh("v1", [], [[1, -1]])))).toThrow(InvalidCartError)
  })
  it("véhicule en double ou clé invalide refusé", () => {
    expect(() => normalizeCart(cart(veh("v1"), veh("v1")))).toThrow(InvalidCartError)
    expect(() => normalizeCart(cart(veh("a|b")))).toThrow(InvalidCartError)
  })
  it("le panier d'entrée n'est jamais modifié", () => {
    const c = cart(veh("v1", [[1, 5000], [1, 5000]]))
    const copy = JSON.parse(JSON.stringify(c))
    priceCart({ cart: c })
    expect(c).toEqual(copy)
  })
})
