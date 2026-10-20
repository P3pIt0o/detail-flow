import { describe, expect, it } from "vitest"
import { InvalidCartError, describeAdjustment, formatEuros, normalizeCart, priceCart, type EquivalenceRule, type ItemRef } from "@/lib/booking/promotions"
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
      { kind: "duplicate_merged", vehicleKey: "v1", item: { type: "service", id: 1 }, removedPriceCents: 5000 },
      { kind: "duplicate_merged", vehicleKey: "v1", item: { type: "option", id: 7 }, removedPriceCents: 900 },
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
        keptPriceCents: 5000,
        removedPriceCents: 6500,
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

describe("substitutions explicables au client (validation L17-B)", () => {
  const NAMES: Record<string, string> = {
    [`service:${CLZ.pharesService}`]: "Rénovation des phares",
    [`option:${CLZ.pharesOption}`]: "Rénovation des phares (avec un lavage)",
    [`service:${CLZ.lavageInterieurEco}`]: "Lavage intérieur Éco",
  }
  const label = (r: ItemRef) => NAMES[`${r.type}:${r.id}`] ?? `#${r.id}`

  it("formatEuros : montants ronds et centimes, identique serveur et client", () => {
    expect(formatEuros(6500)).toBe("65 €")
    expect(formatEuros(6550)).toBe("65,50 €")
    expect(formatEuros(123456)).toBe("1 234,56 €")
    expect(formatEuros(5)).toBe("0,05 €")
  })

  it("équivalence : message clair, traitement conservé, montant non facturé indiqué", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.lavageInterieurEco, 5000], [CLZ.pharesService, 6500]], [[CLZ.pharesOption, 5000]])), equivalences: [PHARES] })
    expect(describeAdjustment(r.adjustments[0], label)).toBe(
      "« Rénovation des phares » et « Rénovation des phares (avec un lavage) » correspondent au même traitement (Même rénovation des phares : une seule fois par véhicule). Il est réalisé une seule fois et facturé 50 € au titre de « Rénovation des phares (avec un lavage) ». Vous ne payez pas 65 € en double.",
    )
  })

  it("doublon : message clair", () => {
    const r = priceCart({ cart: cart(veh("v1", [[CLZ.lavageInterieurEco, 5000], [CLZ.lavageInterieurEco, 5000]])) })
    expect(describeAdjustment(r.adjustments[0], label)).toBe(
      "« Lavage intérieur Éco » était ajouté deux fois pour le même véhicule : il n'est compté et facturé qu'une seule fois.",
    )
  })

  it("aucune perte de prestation (2 000 paniers aléatoires) : seul un doublon ou une forme équivalente est retiré", () => {
    let seed = 11
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
    const rules: EquivalenceRule[] = [PHARES, { id: 2, a: { type: "option", id: 101 }, b: { type: "option", id: 102 }, reason: "Même traitement" }]
    const SERVICES = [CLZ.pharesService, CLZ.lavageInterieurEco, CLZ.lavageExterieurEco, 1]
    const OPTIONS = [CLZ.pharesOption, 101, 102, 7]
    for (let i = 0; i < 2000; i++) {
      const vehicles = Array.from({ length: 1 + rnd(3) }, (_, k) =>
        veh(
          `v${k}`,
          Array.from({ length: 1 + rnd(3) }, () => [SERVICES[rnd(4)], 1000 + rnd(9000)] as [number, number]),
          Array.from({ length: rnd(4) }, () => [OPTIONS[rnd(4)], 500 + rnd(6000)] as [number, number]),
        ),
      )
      const input = cart(...vehicles)
      const r = priceCart({ cart: input, equivalences: rules })
      for (const v of input.vehicles) {
        const out = r.cart.vehicles.find((x) => x.key === v.key)!
        const before = new Set([...v.services.map((s) => `service:${s.serviceId}`), ...v.options.map((o) => `option:${o.optionId}`)])
        const after = new Set([...out.services.map((s) => `service:${s.serviceId}`), ...out.options.map((o) => `option:${o.optionId}`)])
        // Une prestation demandée reste toujours présente sur le véhicule.
        expect(out.services.length >= 1).toBe(true)
        for (const item of before) {
          if (after.has(item)) continue
          // Retiré UNIQUEMENT si sa forme équivalente est conservée sur le même véhicule.
          const rule = rules.find((x) => [`${x.a.type}:${x.a.id}`, `${x.b.type}:${x.b.id}`].includes(item))
          expect(rule !== undefined).toBe(true)
          const other = `${rule!.a.type}:${rule!.a.id}` === item ? `${rule!.b.type}:${rule!.b.id}` : `${rule!.a.type}:${rule!.a.id}`
          expect(after.has(other)).toBe(true)
        }
      }
      // Toute correction est tracée : prix normal = demandé − montants retirés tracés.
      const requested = input.vehicles.reduce((s, v) => s + v.services.reduce((a, x) => a + x.priceCents, 0) + v.options.reduce((a, x) => a + x.priceCents, 0), 0)
      const removed = r.adjustments.reduce((s, a) => s + a.removedPriceCents, 0)
      expect(r.normalCents).toBe(requested - removed)
    }
  })
})
