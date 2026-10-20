/**
 * Ventes additionnelles (PURE). Ne modifie JAMAIS le panier : renvoie des
 * propositions que le client accepte ou ignore.
 */

import { cartUnits, normalizeCart } from "./cart"
import { evaluatePromotion } from "./engine"
import { isPromotionLive, validateEquivalence } from "./validate"
import type { Cart, EquivalenceRule, ItemRef, Promotion, Suggestion } from "./types"

/** Prix catalogue connus côté appelant (le serveur reste la vérité au moment de réserver). */
export type CatalogPrices = {
  optionPriceCents: (optionId: number) => number | undefined
  /** Prix d'une prestation pour un véhicule donné (dépend de son type). */
  servicePriceCents: (vehicleKey: string, serviceId: number) => number | undefined
}

export function suggestUpsells(input: {
  cart: Cart
  promotions?: Promotion[]
  equivalences?: EquivalenceRule[]
  catalog: CatalogPrices
  now?: Date
  /** Nombre maximal de suggestions (défaut 2, CDC mobile). */
  limit?: number
}): Suggestion[] {
  const now = input.now ?? new Date()
  const { cart } = normalizeCart(input.cart, input.equivalences ?? [])
  const units = cartUnits(cart)
  const live = (input.promotions ?? []).filter((p) => isPromotionLive(p, now))
  const out: { s: Suggestion; score: number }[] = []

  for (const p of live) {
    if (p.kind === "multi_services" || p.kind === "multi_options") {
      const type = p.kind === "multi_services" ? "service" : "option"
      const ids = p.kind === "multi_services" ? p.eligibleServiceIds : p.eligibleOptionIds
      const quantity = units.filter((u) => u.type === type && u.priceCents > 0 && (ids === null || ids.includes(u.id))).length
      const reached = p.tiers.filter((t) => t.minQuantity <= quantity)
      // Paliers incohérents (D-B1 a) : on ne suggère un palier en pourcentage ou en
      // euros que s'il est réellement plus avantageux que le meilleur déjà atteint.
      const bestBps = Math.max(0, ...reached.map((t) => (t.value.type === "percent" ? t.value.bps : 0)))
      const bestCents = Math.max(0, ...reached.map((t) => (t.value.type === "amount" ? t.value.cents : 0)))
      const next = [...p.tiers]
        .filter((t) => t.minQuantity > quantity)
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .find((t) => (t.value.type === "percent" ? t.value.bps > bestBps : t.value.type === "amount" ? t.value.cents > bestCents : true))
      if (next) {
        out.push({
          s: { kind: "next_tier", promotionId: p.id, name: p.name.trim(), missingQuantity: next.minQuantity - quantity, itemType: type, nextTier: next },
          score: 1000 - (next.minQuantity - quantity),
        })
      }
    } else if (p.kind === "service_option") {
      const { serviceId, optionId } = p.trigger
      for (const v of cart.vehicles) {
        const hasS = v.services.some((s) => s.serviceId === serviceId)
        const hasO = v.options.some((o) => o.optionId === optionId)
        if (hasS === hasO) continue
        const add: ItemRef = hasS ? { type: "option", id: optionId } : { type: "service", id: serviceId }
        const price = add.type === "option" ? input.catalog.optionPriceCents(add.id) : input.catalog.servicePriceCents(v.key, add.id)
        if (price === undefined) continue // élément indisponible pour ce client : on ne le propose pas
        // Gain réel simulé avec le moteur (même calcul que la réservation).
        const simulated: Cart = {
          vehicles: cart.vehicles.map((x) =>
            x.key !== v.key
              ? x
              : add.type === "option"
                ? { ...x, options: [...x.options, { optionId: add.id, priceCents: price }] }
                : { ...x, services: [...x.services, { serviceId: add.id, priceCents: price }] },
          ),
        }
        const r = evaluatePromotion(p, cartUnits(simulated))
        if (r && r.discountCents > 0) {
          out.push({ s: { kind: "complete_combination", promotionId: p.id, name: p.name.trim(), vehicleKey: v.key, add, value: p.tiers[0].value }, score: 500 + r.discountCents / 100 })
        }
      }
    }
  }

  // Forme moins chère d'un même traitement (ex. phares en option d'un lavage).
  for (const rule of (input.equivalences ?? []).filter((r) => validateEquivalence(r).ok)) {
    for (const v of cart.vehicles) {
      for (const [have, other] of [[rule.a, rule.b], [rule.b, rule.a]] as [ItemRef, ItemRef][]) {
        const hasHave = have.type === "service" ? v.services.some((s) => s.serviceId === have.id) : v.options.some((o) => o.optionId === have.id)
        const hasOther = other.type === "service" ? v.services.some((s) => s.serviceId === other.id) : v.options.some((o) => o.optionId === other.id)
        if (!hasHave || hasOther) continue
        const havePrice =
          have.type === "service" ? v.services.find((s) => s.serviceId === have.id)!.priceCents : v.options.find((o) => o.optionId === have.id)!.priceCents
        const otherPrice = other.type === "option" ? input.catalog.optionPriceCents(other.id) : input.catalog.servicePriceCents(v.key, other.id)
        if (otherPrice === undefined || otherPrice >= havePrice) continue
        // Une option a besoin d'une prestation restante sur le véhicule.
        const servicesLeft = v.services.filter((s) => !(have.type === "service" && s.serviceId === have.id)).length + (other.type === "service" ? 1 : 0)
        if (other.type === "option" && servicesLeft === 0) continue
        out.push({
          s: { kind: "cheaper_equivalent", ruleId: rule.id, vehicleKey: v.key, replace: have, by: other, savingCents: havePrice - otherPrice, reason: rule.reason.trim() },
          score: 2000 + (havePrice - otherPrice) / 100,
        })
      }
    }
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, input.limit ?? 2))
    .map((x) => x.s)
}
