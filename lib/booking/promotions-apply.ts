/**
 * ============================================================================
 *  L20 — PROMOTIONS APPLIQUÉES À UNE RÉSERVATION (module PUR)
 * ============================================================================
 *  Pont entre le devis serveur (`buildQuote`, prix catalogue) et le moteur
 *  L17-B (`priceCart`). Aucune base de données, aucun Next : testable seul.
 *
 *  - Sans offre ni équivalence : le moteur n'est PAS utilisé, les montants sont
 *    strictement ceux d'aujourd'hui (code promo compris).
 *  - Sinon : panier par véhicule → moteur → lignes NORMALISÉES (doublons
 *    fusionnés, même traitement facturé une seule fois), remise totale
 *    (offres + code), instantané figé pour la réservation.
 *  Centimes entiers uniquement ; le déplacement n'est jamais remisé.
 * ============================================================================
 */
import {
  priceCart,
  type Cart,
  type CartAdjustment,
  type EquivalenceRule,
  type PricingResult,
  type PromoCodeInput,
  type Promotion,
} from "@/lib/booking/promotions"
import type { Quote, QuoteLine } from "@/lib/booking/types"

/** Statut du code promo après arbitrage. */
export type CodeStatus = "none" | "applied" | "rejected_not_combinable" | "rejected_no_eligible_amount"

/** Instantané figé sur la réservation (`bookings.promotionSnapshot`). */
export type PromotionSnapshot = {
  v: 1
  at: string
  normalCents: number
  promotions: { id: number; name: string; kind: Promotion["kind"]; quantity: number; discountCents: number }[]
  promotionDiscountCents: number
  promoCode: { code: string; status: CodeStatus; discountCents: number } | null
  adjustments: CartAdjustment[]
  totalDiscountCents: number
  /** Unité (`<véhicule>|s|<id>` ou `<véhicule>|o|<id>`) → centimes remisés (offres + code). */
  allocations: Record<string, number>
}

export type BookingPricing = {
  /** Faux : aucune offre ni équivalence, comportement historique exact. */
  engineUsed: boolean
  /** Lignes à enregistrer (normalisées si le moteur a été utilisé). */
  lines: QuoteLine[]
  /** Prestations + options facturées avant remise. */
  subtotalCents: number
  totalDurationMin: number
  promotionDiscountCents: number
  codeDiscountCents: number
  codeStatus: CodeStatus
  /** Remise totale (offres + code), ≤ subtotalCents. */
  discountCents: number
  snapshot: PromotionSnapshot | null
  adjustments: CartAdjustment[]
}

/**
 * Clé véhicule d'une ligne : son RANG dans le devis, jamais l'identifiant envoyé
 * par le navigateur. Un client ne peut donc pas déclarer deux voitures comme une
 * seule pour faire disparaître une prestation (doublon, équivalence). Booking V2
 * envoie une ligne par véhicule ; l'ancien tunnel (plusieurs lignes par véhicule)
 * ne reçoit aucune offre (Spirit ACS, Rozan). Le regroupement de plusieurs
 * prestations sur un même véhicule (L17-E) exigera une identité de véhicule
 * contrôlée côté serveur.
 */
export const vehicleKeyAt = (index: number): string => `l${index + 1}`

/** Devis → panier du moteur : une ligne = un véhicule. */
export function quoteToCart(lines: QuoteLine[]): Cart {
  return {
    vehicles: lines.map((l, i) => ({
      key: vehicleKeyAt(i),
      services: [{ serviceId: l.serviceId, priceCents: l.priceCents }],
      options: l.options.map((o) => ({ optionId: o.optionId, priceCents: o.priceCents })),
    })),
  }
}

const take = (bag: Map<number, number>, id: number): boolean => {
  const n = bag.get(id) ?? 0
  if (n <= 0) return false
  bag.set(id, n - 1)
  return true
}

const withTotals = (l: QuoteLine, options: QuoteLine["options"]): QuoteLine => ({
  ...l,
  options,
  lineTotalCents: l.priceCents + options.reduce((s, o) => s + o.priceCents, 0),
  lineDurationMin: l.durationMin + options.reduce((s, o) => s + o.durationMin, 0),
})

/**
 * Lignes du devis réduites au panier normalisé : un élément retiré par le
 * moteur (doublon, équivalence) n'est ni enregistré, ni facturé, ni compté dans
 * la durée. Une ligne = un véhicule ; le moteur ne retire jamais la seule
 * prestation d'un véhicule (jamais d'option sans prestation).
 */
export function normalizedLines(lines: QuoteLine[], cart: Cart): QuoteLine[] {
  const byKey = new Map(cart.vehicles.map((v) => [v.key, v]))
  const out: QuoteLine[] = []
  lines.forEach((l, i) => {
    const v = byKey.get(vehicleKeyAt(i))
    if (!v || !v.services.some((x) => x.serviceId === l.serviceId)) return
    const bag = new Map<number, number>()
    for (const o of v.options) bag.set(o.optionId, (bag.get(o.optionId) ?? 0) + 1)
    out.push(withTotals(l, l.options.filter((o) => take(bag, o.optionId))))
  })
  return out
}

function snapshotOf(r: PricingResult, code: PromoCodeInput | null, now: Date): PromotionSnapshot {
  const allocations: Record<string, number> = {}
  const add = (m: Record<string, number>) => {
    for (const [k, c] of Object.entries(m)) if (c > 0) allocations[k] = (allocations[k] ?? 0) + c
  }
  for (const p of r.promotions) add(p.allocations)
  if (r.promoCode.status === "applied") add(r.promoCode.allocations)
  return {
    v: 1,
    at: now.toISOString(),
    normalCents: r.normalCents,
    promotions: r.promotions.map((p) => ({ id: p.promotionId, name: p.name, kind: p.kind, quantity: p.quantity, discountCents: p.discountCents })),
    promotionDiscountCents: r.promotionDiscountCents,
    promoCode: code
      ? { code: code.code, status: r.promoCode.status as CodeStatus, discountCents: r.promoCode.status === "applied" ? r.promoCode.discountCents : 0 }
      : null,
    adjustments: r.adjustments,
    totalDiscountCents: r.totalDiscountCents,
    allocations,
  }
}

/** Code promo validé par lib/promo/service.ts. `percent` : taux 1..100 d'un code en pourcentage (null : montant fixe). */
export type BookingPromoCode = PromoCodeInput & { percent?: number | null }

/**
 * Montant d'un code en POURCENTAGE calculé sur ce qui est réellement facturé :
 * panier normalisé (équivalences, doublons) et après les offres cumulables avec
 * les codes, sur les seuls éléments visés par le code. Même arrondi que
 * lib/promo (à l'euro-centime inférieur). Code fixe : montant inchangé.
 */
function codeCentsOnBilled(cart: Cart, promotions: Promotion[], equivalences: EquivalenceRule[], code: BookingPromoCode, now: Date): number {
  const pct = code.percent
  if (pct == null) return code.discountCents
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return 0
  const pre = priceCart({ cart, promotions: promotions.filter((p) => p.stackableWithPromoCode), equivalences, now })
  const used: Record<string, number> = {}
  for (const p of pre.promotions) for (const [k, c] of Object.entries(p.allocations)) used[k] = (used[k] ?? 0) + c
  const targets = code.targetServiceIds ? new Set(code.targetServiceIds) : null
  const base = pre.units
    .filter((u) => (targets ? u.type === "service" && targets.has(u.id) : true))
    .reduce((s, u) => s + Math.max(0, u.priceCents - (used[u.key] ?? 0)), 0)
  return Math.max(0, Math.min(Math.floor((base * pct) / 100), base))
}

/**
 * Prix d'une réservation avec offres, équivalences et code promo (déjà validé
 * par lib/promo/service.ts sur le prix catalogue ; un code en pourcentage est
 * recalculé ici sur le montant réellement facturé).
 */
export function priceBooking(input: {
  quote: Pick<Quote, "lines" | "subtotalCents" | "eligibleSubtotalCents" | "totalDurationMin">
  promotions: Promotion[]
  equivalences: EquivalenceRule[]
  code: BookingPromoCode | null
  now?: Date
}): BookingPricing {
  const { quote, code } = input
  const now = input.now ?? new Date()

  if (input.promotions.length === 0 && input.equivalences.length === 0) {
    // Comportement historique exact (createBookingAction avant L20).
    const codeCents = code ? Math.max(0, Math.min(Math.trunc(code.discountCents), quote.eligibleSubtotalCents)) : 0
    return {
      engineUsed: false,
      lines: quote.lines,
      subtotalCents: quote.subtotalCents,
      totalDurationMin: quote.totalDurationMin,
      promotionDiscountCents: 0,
      codeDiscountCents: codeCents,
      codeStatus: code ? (codeCents > 0 ? "applied" : "rejected_no_eligible_amount") : "none",
      discountCents: codeCents,
      snapshot: null,
      adjustments: [],
    }
  }

  const cart = quoteToCart(quote.lines)
  const engineCode: PromoCodeInput | null = code
    ? { code: code.code, discountCents: codeCentsOnBilled(cart, input.promotions, input.equivalences, code, now), targetServiceIds: code.targetServiceIds }
    : null
  const r = priceCart({ cart, promotions: input.promotions, equivalences: input.equivalences, promoCode: engineCode, now })
  const lines = normalizedLines(quote.lines, r.cart)
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  const codeDiscountCents = r.promoCode.status === "applied" ? r.promoCode.discountCents : 0
  return {
    engineUsed: true,
    lines,
    subtotalCents,
    totalDurationMin: lines.reduce((s, l) => s + l.lineDurationMin, 0),
    promotionDiscountCents: r.promotionDiscountCents,
    codeDiscountCents,
    codeStatus: code ? (r.promoCode.status as CodeStatus) : "none",
    discountCents: Math.max(0, Math.min(subtotalCents, r.totalDiscountCents)),
    snapshot: snapshotOf(r, code, now),
    adjustments: r.adjustments,
  }
}
