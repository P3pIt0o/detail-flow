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
import { formatEuros, suggestUpsells, type ItemRef, type CatalogPrices } from "@/lib/booking/promotions"

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

/** Clé par défaut d'une ligne : son RANG dans le devis (une ligne = un véhicule). */
export const vehicleKeyAt = (index: number): string => `l${index + 1}`

/** Identité de véhicule envoyée avec une ligne (type, marque, modèle, immatriculation). */
export type LineIdentity = { uid: string; vehicleTypeId: number; brand?: string; model?: string; plate?: string }

const norm = (v: unknown) => String(v ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Regroupement de CONFIANCE des lignes par véhicule (L22). Deux lignes ne sont un
 * même véhicule que si elles partagent le préfixe d'identifiant (`véhicule:ligne`)
 * ET exactement le même type, la même marque, le même modèle et la même
 * immatriculation. Sinon : véhicules distincts (aucune prestation ne peut être
 * retirée en déclarant deux voitures comme une seule sans que la réservation ne
 * décrive, pour le pro, un seul et même véhicule). Ligne sans préfixe, identité
 * inconnue ou uid répété : clé propre à la ligne.
 */
export function trustedVehicleKeys(lines: Pick<QuoteLine, "uid" | "vehicleTypeId">[], identities: LineIdentity[]): string[] {
  const byUid = new Map<string, LineIdentity | null>()
  for (const id of identities) byUid.set(id.uid, byUid.has(id.uid) ? null : id)
  const seen = new Map<string, string>() // signature → clé
  const perPrefix = new Map<string, number>()
  return lines.map((l, i) => {
    const id = byUid.get(l.uid)
    const sep = l.uid.indexOf(":")
    if (!id || sep <= 0 || id.vehicleTypeId !== l.vehicleTypeId) return vehicleKeyAt(i)
    const prefix = l.uid.slice(0, sep).replace(/[|~]/g, "-")
    const sig = [prefix, l.vehicleTypeId, norm(id.brand), norm(id.model), norm(id.plate)].join("\u0000")
    const known = seen.get(sig)
    if (known) return known
    const n = (perPrefix.get(prefix) ?? 0) + 1
    perPrefix.set(prefix, n)
    const key = n === 1 ? `v-${prefix}` : `v-${prefix}~${n}`
    seen.set(sig, key)
    return key
  })
}

/** Devis → panier du moteur, par véhicule (clés fournies, sinon une ligne = un véhicule). */
export function quoteToCart(lines: QuoteLine[], keys?: string[]): Cart {
  const byKey = new Map<string, Cart["vehicles"][number]>()
  lines.forEach((l, i) => {
    const key = keys?.[i] ?? vehicleKeyAt(i)
    let v = byKey.get(key)
    if (!v) byKey.set(key, (v = { key, services: [], options: [] }))
    v.services.push({ serviceId: l.serviceId, priceCents: l.priceCents })
    for (const o of l.options) v.options.push({ optionId: o.optionId, priceCents: o.priceCents })
  })
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
 * moteur (doublon, équivalence) n'est ni enregistré, ni facturé, ni compté dans
 * la durée. Une option dont la ligne a disparu est rattachée à la première ligne
 * conservée du même véhicule (le moteur garde toujours au moins une prestation).
 */
export function normalizedLines(lines: QuoteLine[], cart: Cart, keys?: string[]): QuoteLine[] {
  const keyOf = (i: number) => keys?.[i] ?? vehicleKeyAt(i)
  const out: QuoteLine[] = []
  for (const v of cart.vehicles) {
    const services = new Map<number, number>()
    const options = new Map<number, number>()
    for (const x of v.services) services.set(x.serviceId, (services.get(x.serviceId) ?? 0) + 1)
    for (const o of v.options) options.set(o.optionId, (options.get(o.optionId) ?? 0) + 1)
    const kept: QuoteLine[] = []
    const orphans: QuoteLine["options"] = []
    lines.forEach((l, i) => {
      if (keyOf(i) !== v.key) return
      const opts = l.options.filter((o) => take(options, o.optionId))
      if (take(services, l.serviceId)) kept.push(withTotals(l, opts))
      else orphans.push(...opts)
    })
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
  /** Clé véhicule de chaque ligne (`trustedVehicleKeys`) ; absente = une ligne par véhicule. */
  vehicleKeys?: string[]
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

  const keys = input.vehicleKeys && input.vehicleKeys.length === quote.lines.length ? input.vehicleKeys : undefined
  const cart = quoteToCart(quote.lines, keys)
  const engineCode: PromoCodeInput | null = code
    ? { code: code.code, discountCents: codeCentsOnBilled(cart, input.promotions, input.equivalences, code, now), targetServiceIds: code.targetServiceIds }
    : null
  const r = priceCart({ cart, promotions: input.promotions, equivalences: input.equivalences, promoCode: engineCode, now })
  const lines = normalizedLines(quote.lines, r.cart, keys)
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

/* -------------------------------------------------------------------------- */
/*  Suggestions affichées au client (L22) — jamais d'ajout automatique         */
/* -------------------------------------------------------------------------- */

export type BookingSuggestion = {
  text: string
  /** Élément à ajouter d'un clic (absent : information seulement). */
  add?: ItemRef
  /** Véhicule concerné (uid du navigateur, tiré de la clé de confiance), si connu. */
  vehicleUid?: string
}

/** Compléments du pro (L19), forme minimale (évite d'importer le stockage serveur). */
export type UpsellInput = { whenServiceId: number; suggest: ItemRef[]; message: string | null }

/** 1250 → « 12,5 % » (sans dépendre de la langue du navigateur). */
function formatPercentFr(bps: number): string {
  const rest = bps % 100
  return `${Math.floor(bps / 100)}${rest ? "," + String(rest).padStart(2, "0").replace(/0$/, "") : ""} %`
}

/** `v-<uid>` / `v-<uid>~2` → `<uid>` ; clé de rang → indéfini. */
export const vehicleUidOfKey = (key: string): string | undefined => (key.startsWith("v-") ? key.slice(2).replace(/~\d+$/, "") : undefined)

/**
 * Au plus `limit` suggestions (2 par défaut) : d'abord celles du moteur (palier
 * suivant, combinaison à compléter, forme moins chère), puis les compléments du
 * pro. Les éléments inconnus du catalogue public (masqués) ne sont jamais proposés.
 */
export function bookingSuggestions(input: {
  cart: Cart
  promotions: Promotion[]
  equivalences: EquivalenceRule[]
  upsells: UpsellInput[]
  catalog: CatalogPrices
  label: (ref: ItemRef) => string | undefined
  now?: Date
  limit?: number
}): BookingSuggestion[] {
  const limit = input.limit ?? 2
  const out: BookingSuggestion[] = []
  const name = (r: ItemRef) => input.label(r) ?? ""
  for (const s of suggestUpsells({ cart: input.cart, promotions: input.promotions, equivalences: input.equivalences, catalog: input.catalog, now: input.now, limit })) {
    if (s.kind === "next_tier") {
      const unit = s.itemType === "service" ? "prestation" : "option"
      const v = s.nextTier.value
      const tier = v.type === "percent" ? `−${formatPercentFr(v.bps)}` : v.type === "amount" ? `−${formatEuros(v.cents)}` : `${formatEuros(v.cents)} au total`
      out.push({ text: `Plus que ${s.missingQuantity} ${unit}${s.missingQuantity > 1 ? "s" : ""} pour profiter de « ${s.name} » (${tier}).` })
    } else if (s.kind === "complete_combination") {
      if (!input.label(s.add)) continue
      out.push({ text: `Ajoutez « ${name(s.add)} » et profitez de « ${s.name} ».`, add: s.add, vehicleUid: vehicleUidOfKey(s.vehicleKey) })
    } else if (s.kind === "cheaper_equivalent") {
      if (!input.label(s.by) || !input.label(s.replace)) continue
      out.push({ text: `« ${name(s.by)} » correspond au même traitement que « ${name(s.replace)} » (${s.reason.replace(/[.\s]+$/, "")}) : ${formatEuros(s.savingCents)} d'économie.` })
    }
  }
  for (const v of input.cart.vehicles) {
    const has = (r: ItemRef) => (r.type === "service" ? v.services.some((x) => x.serviceId === r.id) : v.options.some((x) => x.optionId === r.id))
    for (const u of input.upsells) {
      if (!v.services.some((x) => x.serviceId === u.whenServiceId)) continue
      for (const r of u.suggest) {
        if (has(r) || !input.label(r) || out.some((o) => o.add && o.add.type === r.type && o.add.id === r.id)) continue
        out.push({ text: u.message?.trim() ? `${u.message.trim()} — « ${name(r)} »` : `Ajoutez « ${name(r)} » à votre réservation.`, add: r, vehicleUid: vehicleUidOfKey(v.key) })
      }
    }
  }
  return out.slice(0, limit)
}
