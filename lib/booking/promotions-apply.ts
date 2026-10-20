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

/** Véhicule d'une ligne : l'ancien tunnel envoie `véhicule:ligne`, Booking V2 un uid par véhicule. */
export function vehicleKeyOf(uid: string): string {
  const k = String(uid ?? "").split(":")[0].replace(/\|/g, "-").trim()
  return k || "v"
}

/** Devis → panier du moteur, véhicule par véhicule, dans l'ordre des lignes. */
export function quoteToCart(lines: QuoteLine[]): Cart {
  const byKey = new Map<string, Cart["vehicles"][number]>()
  for (const l of lines) {
    const key = vehicleKeyOf(l.uid)
    let v = byKey.get(key)
    if (!v) byKey.set(key, (v = { key, services: [], options: [] }))
    v.services.push({ serviceId: l.serviceId, priceCents: l.priceCents })
    for (const o of l.options) v.options.push({ optionId: o.optionId, priceCents: o.priceCents })
  }
  return { vehicles: [...byKey.values()] }
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
 * moteur (doublon, équivalence) n'est ni enregistré, ni facturé, ni compté
 * dans la durée. Une option dont la ligne a disparu est rattachée à la
 * première ligne conservée du même véhicule.
 */
export function normalizedLines(lines: QuoteLine[], cart: Cart): QuoteLine[] {
  const out: QuoteLine[] = []
  for (const v of cart.vehicles) {
    const services = new Map<number, number>()
    const options = new Map<number, number>()
    for (const s of v.services) services.set(s.serviceId, (services.get(s.serviceId) ?? 0) + 1)
    for (const o of v.options) options.set(o.optionId, (options.get(o.optionId) ?? 0) + 1)
    const kept: QuoteLine[] = []
    const orphans: QuoteLine["options"] = []
    for (const l of lines.filter((x) => vehicleKeyOf(x.uid) === v.key)) {
      const opts = l.options.filter((o) => take(options, o.optionId))
      if (take(services, l.serviceId)) kept.push(withTotals(l, opts))
      else orphans.push(...opts)
    }
    if (orphans.length && kept.length) kept[0] = withTotals(kept[0], [...kept[0].options, ...orphans])
    out.push(...kept)
  }
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

/**
 * Prix d'une réservation avec offres, équivalences et code promo (déjà validé
 * par lib/promo/service.ts, montant calculé sur le prix catalogue).
 */
export function priceBooking(input: {
  quote: Pick<Quote, "lines" | "subtotalCents" | "eligibleSubtotalCents" | "totalDurationMin">
  promotions: Promotion[]
  equivalences: EquivalenceRule[]
  code: PromoCodeInput | null
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

  const r = priceCart({ cart: quoteToCart(quote.lines), promotions: input.promotions, equivalences: input.equivalences, promoCode: code, now })
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
