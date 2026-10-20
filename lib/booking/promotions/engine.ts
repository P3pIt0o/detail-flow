/**
 * ============================================================================
 *  MOTEUR DE PROMOTIONS (L17-B) — calcul PUR, centimes entiers
 * ============================================================================
 *  Entrée : un panier normalisé (prix déjà recalculés par le serveur), les
 *  promotions du tenant, ses équivalences et un éventuel code promo validé.
 *  Sortie : prix normal, offres retenues, remises ventilées, total final.
 *
 *  Garanties (testées) :
 *   - aucune remise ne dépasse le montant éligible ; total final ≥ 0 ;
 *   - un prix total fixe n'augmente jamais le prix normal ;
 *   - une offre non cumulable n'est JAMAIS combinée à une autre ;
 *   - un code promo ne se cumule qu'avec des offres qui l'autorisent ;
 *   - un même centime n'est remisé qu'une seule fois (ventilation par élément) ;
 *   - résultat déterministe (égalités : priorité, puis identifiant).
 *  Le déplacement n'entre jamais dans ce calcul.
 * ============================================================================
 */

import { allocate, percentOf, sumValues } from "./money"
import { cartUnits, normalizeCart } from "./cart"
import { isPromotionLive } from "./validate"
import type {
  AppliedPromotion,
  Cart,
  CartUnit,
  EquivalenceRule,
  PricingResult,
  PromoCodeInput,
  PromoCodeOutcome,
  Promotion,
  PromotionTier,
} from "./types"

type Amounts = Record<string, number>

const amountsOf = (units: CartUnit[]): Amounts => Object.fromEntries(units.map((u) => [u.key, u.priceCents]))

/** Palier atteint : le plus grand `minQuantity` ≤ quantité. */
export function tierFor(tiers: PromotionTier[], quantity: number): PromotionTier | null {
  let best: PromotionTier | null = null
  for (const t of tiers) if (t.minQuantity <= quantity && (!best || t.minQuantity > best.minQuantity)) best = t
  return best
}

function result(
  p: Promotion,
  tier: PromotionTier,
  quantity: number,
  base: CartUnit[],
  amounts: Amounts,
  discount: number,
): AppliedPromotion | null {
  const weights = base.map((u) => ({ key: u.key, cents: amounts[u.key] ?? 0 }))
  const eligibleCents = weights.reduce((s, w) => s + w.cents, 0)
  const allocations = allocate(Math.min(discount, eligibleCents), weights)
  const discountCents = sumValues(allocations)
  if (discountCents <= 0) return null
  return { promotionId: p.id, name: p.name.trim(), kind: p.kind, tier, quantity, eligibleCents, discountCents, allocations }
}

/**
 * Remise d'UNE promotion sur le panier, calculée sur `amounts` (montants encore
 * remisables). Le comptage se fait toujours sur les prix normaux : seuls les
 * éléments réellement facturés (prix > 0) et éligibles comptent.
 */
export function evaluatePromotion(p: Promotion, units: CartUnit[], amounts: Amounts = amountsOf(units)): AppliedPromotion | null {
  switch (p.kind) {
    case "multi_services": {
      const eligible = units.filter(
        (u) => u.type === "service" && u.priceCents > 0 && (p.eligibleServiceIds === null || p.eligibleServiceIds.includes(u.id)),
      )
      const tier = tierFor(p.tiers, eligible.length)
      if (!tier) return null
      const vehicles = new Set(eligible.map((u) => u.vehicleKey))
      const base = p.includeOptions
        ? [...eligible, ...units.filter((u) => u.type === "option" && u.priceCents > 0 && vehicles.has(u.vehicleKey))]
        : eligible
      const eligibleCents = base.reduce((s, u) => s + (amounts[u.key] ?? 0), 0)
      let discount = 0
      if (tier.value.type === "percent") discount = percentOf(eligibleCents, tier.value.bps)
      else if (tier.value.type === "fixed_total") discount = Math.max(0, eligibleCents - tier.value.cents)
      return result(p, tier, eligible.length, base, amounts, discount)
    }

    case "multi_options": {
      const eligible = units.filter(
        (u) => u.type === "option" && u.priceCents > 0 && (p.eligibleOptionIds === null || p.eligibleOptionIds.includes(u.id)),
      )
      const tier = tierFor(p.tiers, eligible.length)
      if (!tier) return null
      const eligibleCents = eligible.reduce((s, u) => s + (amounts[u.key] ?? 0), 0)
      let discount = 0
      if (tier.value.type === "percent") discount = percentOf(eligibleCents, tier.value.bps)
      else if (tier.value.type === "amount") discount = Math.min(tier.value.cents, eligibleCents)
      return result(p, tier, eligible.length, eligible, amounts, discount)
    }

    case "service_option": {
      const tier = p.tiers[0]
      if (!tier) return null
      const { serviceId, optionId, appliesTo } = p.trigger
      const byVehicle = new Map<string, CartUnit[]>()
      for (const u of units) byVehicle.set(u.vehicleKey, [...(byVehicle.get(u.vehicleKey) ?? []), u])
      const allocations: Amounts = {}
      const baseAll: CartUnit[] = []
      let occurrences = 0
      for (const vUnits of byVehicle.values()) {
        const svc = vUnits.find((u) => u.type === "service" && u.id === serviceId)
        const opt = vUnits.find((u) => u.type === "option" && u.id === optionId)
        if (!svc || !opt) continue
        occurrences += 1
        const base = appliesTo === "service" ? [svc] : appliesTo === "option" ? [opt] : [svc, opt]
        baseAll.push(...base)
        const weights = base.map((u) => ({ key: u.key, cents: amounts[u.key] ?? 0 }))
        const vBase = weights.reduce((s, w) => s + w.cents, 0)
        const vDiscount =
          tier.value.type === "percent" ? percentOf(vBase, tier.value.bps) : tier.value.type === "amount" ? Math.min(tier.value.cents, vBase) : 0
        Object.assign(allocations, allocate(vDiscount, weights))
      }
      if (occurrences === 0) return null
      const discountCents = sumValues(allocations)
      if (discountCents <= 0) return null
      const eligibleCents = baseAll.reduce((s, u) => s + (amounts[u.key] ?? 0), 0)
      return { promotionId: p.id, name: p.name.trim(), kind: p.kind, tier, quantity: occurrences, eligibleCents, discountCents, allocations }
    }
  }
}

const better = (a: { total: number; priority: number; id: number }, b: { total: number; priority: number; id: number }) =>
  a.total > b.total || (a.total === b.total && (a.priority > b.priority || (a.priority === b.priority && a.id < b.id)))

/**
 * Sélection des offres :
 *  (A) la meilleure offre seule (cumulable ou non) ;
 *  (B) toutes les offres CUMULABLES, appliquées successivement sur le reste.
 * On garde B seulement si elle est strictement plus avantageuse que A.
 */
export function selectPromotions(units: CartUnit[], promotions: Promotion[]): { applied: AppliedPromotion[]; remaining: Amounts } {
  const full = amountsOf(units)
  const standalone = promotions
    .map((p) => ({ p, r: evaluatePromotion(p, units, full) }))
    .filter((x): x is { p: Promotion; r: AppliedPromotion } => x.r !== null)
  if (standalone.length === 0) return { applied: [], remaining: full }

  let best = standalone[0]
  for (const x of standalone.slice(1)) {
    if (better({ total: x.r.discountCents, priority: x.p.priority, id: x.p.id }, { total: best.r.discountCents, priority: best.p.priority, id: best.p.id })) best = x
  }
  const single = { applied: [best.r], remaining: subtract(full, best.r.allocations) }

  const stackables = standalone
    .filter((x) => x.p.stackable)
    .sort((a, b) => b.r.discountCents - a.r.discountCents || b.p.priority - a.p.priority || a.p.id - b.p.id)
  if (stackables.length < 2) return single

  let remaining = full
  const applied: AppliedPromotion[] = []
  for (const { p } of stackables) {
    const r = evaluatePromotion(p, units, remaining)
    if (!r) continue
    applied.push(r)
    remaining = subtract(remaining, r.allocations)
  }
  const stackTotal = applied.reduce((s, r) => s + r.discountCents, 0)
  return stackTotal > best.r.discountCents ? { applied, remaining } : single
}

function subtract(amounts: Amounts, allocations: Amounts): Amounts {
  const out: Amounts = { ...amounts }
  for (const [k, v] of Object.entries(allocations)) out[k] = Math.max(0, (out[k] ?? 0) - v)
  return out
}

function codeEligibleKeys(units: CartUnit[], code: PromoCodeInput): string[] {
  if (!code.targetServiceIds || code.targetServiceIds.length === 0) return units.map((u) => u.key)
  const t = new Set(code.targetServiceIds)
  return units.filter((u) => u.type === "service" && t.has(u.id)).map((u) => u.key)
}

function applyCode(code: PromoCodeInput, keys: string[], amounts: Amounts): Amounts {
  const weights = keys.map((k) => ({ key: k, cents: amounts[k] ?? 0 }))
  return allocate(Math.max(0, Math.trunc(code.discountCents)), weights)
}

export type PriceCartInput = {
  cart: Cart
  promotions?: Promotion[]
  equivalences?: EquivalenceRule[]
  promoCode?: PromoCodeInput | null
  now?: Date
}

/**
 * Point d'entrée unique. Les promotions inactives, hors dates ou invalides sont
 * ignorées. Avec un code promo :
 *  (A) promotions seules ;
 *  (B) promotions autorisant les codes + code appliqué sur le reste.
 * Le code n'est retenu que si B est strictement plus avantageuse ; sinon il est
 * écarté explicitement (`rejected_not_combinable`).
 */
export function priceCart(input: PriceCartInput): PricingResult {
  const now = input.now ?? new Date()
  const { cart, adjustments } = normalizeCart(input.cart, input.equivalences ?? [])
  const units = cartUnits(cart)
  const normalCents = units.reduce((s, u) => s + u.priceCents, 0)
  const live = (input.promotions ?? []).filter((p) => isPromotionLive(p, now))

  const A = selectPromotions(units, live)
  const aTotal = A.applied.reduce((s, r) => s + r.discountCents, 0)

  let promotions = A.applied
  let promoCode: PromoCodeOutcome = { status: "none" }
  let codeCents = 0

  const code = input.promoCode
  if (code && code.discountCents > 0) {
    const B = selectPromotions(units, live.filter((p) => p.stackableWithPromoCode))
    const codeAlloc = applyCode(code, codeEligibleKeys(units, code), B.remaining)
    const bCode = sumValues(codeAlloc)
    const bTotal = B.applied.reduce((s, r) => s + r.discountCents, 0) + bCode
    if (bCode > 0 && bTotal > aTotal) {
      promotions = B.applied
      codeCents = bCode
      promoCode = { status: "applied", code: code.code, discountCents: bCode, allocations: codeAlloc }
    } else if (bCode === 0) {
      // Rien à remiser pour ce code (aucun élément visé facturé, ou déjà
      // entièrement remisé) : ce n'est pas un conflit d'offres.
      promoCode = { status: "rejected_no_eligible_amount", code: code.code }
    } else {
      promoCode = { status: "rejected_not_combinable", code: code.code, promotionDiscountCents: aTotal, codeDiscountCents: bCode }
    }
  }

  const promotionDiscountCents = promotions.reduce((s, r) => s + r.discountCents, 0)
  const totalDiscountCents = Math.min(normalCents, promotionDiscountCents + codeCents)
  return {
    cart,
    adjustments,
    units,
    normalCents,
    promotions,
    promotionDiscountCents,
    promoCode,
    totalDiscountCents,
    savingsCents: totalDiscountCents,
    finalCents: normalCents - totalDiscountCents,
  }
}

/**
 * Aperçu admin (CDC §7.3) : applique UNE offre, même inactive ou hors dates
 * (brouillon), sur un panier d'exemple.
 */
export function previewPromotion(p: Promotion, sampleCart: Cart): PricingResult {
  return priceCart({ cart: sampleCart, promotions: [{ ...p, active: true, startsAt: null, endsAt: null }] })
}
