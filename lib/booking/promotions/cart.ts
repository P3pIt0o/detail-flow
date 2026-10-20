/**
 * Normalisation du panier (PURE). Panier libre : AUCUNE restriction par
 * catégorie. Deux corrections seulement, jamais un blocage :
 *  1. doublon exact (même prestation / même option deux fois sur un véhicule)
 *     → fusionné ;
 *  2. équivalence configurée par le pro (même traitement sous deux formes sur
 *     un même véhicule) → une seule forme facturée, la moins chère quand c'est
 *     possible (une option a toujours besoin d'une prestation sur le véhicule).
 */

import { isNonNegInt } from "./money"
import { validateEquivalence } from "./validate"
import type { Cart, CartAdjustment, CartUnit, CartVehicle, EquivalenceRule, ItemRef } from "./types"

export class InvalidCartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidCartError"
  }
}

export const unitKey = (vehicleKey: string, ref: ItemRef) => `${vehicleKey}|${ref.type === "service" ? "s" : "o"}|${ref.id}`

function assertCart(cart: Cart): void {
  if (!cart || !Array.isArray(cart.vehicles)) throw new InvalidCartError("Panier invalide.")
  const keys = new Set<string>()
  for (const v of cart.vehicles) {
    if (typeof v?.key !== "string" || !v.key || v.key.includes("|")) throw new InvalidCartError("Véhicule sans identifiant valide.")
    if (keys.has(v.key)) throw new InvalidCartError(`Véhicule en double : ${v.key}.`)
    keys.add(v.key)
    if (!Array.isArray(v.services) || !Array.isArray(v.options)) throw new InvalidCartError("Véhicule incomplet.")
    for (const s of v.services) {
      if (!Number.isInteger(s?.serviceId) || s.serviceId <= 0 || !isNonNegInt(s.priceCents)) {
        throw new InvalidCartError("Prestation invalide (identifiant ou prix en centimes).")
      }
    }
    for (const o of v.options) {
      if (!Number.isInteger(o?.optionId) || o.optionId <= 0 || !isNonNegInt(o.priceCents)) {
        throw new InvalidCartError("Option invalide (identifiant ou prix en centimes).")
      }
    }
  }
}

function has(v: CartVehicle, ref: ItemRef): boolean {
  return ref.type === "service" ? v.services.some((s) => s.serviceId === ref.id) : v.options.some((o) => o.optionId === ref.id)
}

function priceOf(v: CartVehicle, ref: ItemRef): number {
  return ref.type === "service"
    ? (v.services.find((s) => s.serviceId === ref.id)?.priceCents ?? 0)
    : (v.options.find((o) => o.optionId === ref.id)?.priceCents ?? 0)
}

function without(v: CartVehicle, ref: ItemRef): CartVehicle {
  return ref.type === "service"
    ? { ...v, services: v.services.filter((s) => s.serviceId !== ref.id) }
    : { ...v, options: v.options.filter((o) => o.optionId !== ref.id) }
}

/**
 * Choisit la forme conservée : la moins chère, sauf si cela laisserait une
 * option sans aucune prestation sur le véhicule. Égalité → la prestation
 * (puis `a`), pour un résultat déterministe.
 */
function chooseKept(v: CartVehicle, a: ItemRef, b: ItemRef): { kept: ItemRef; removed: ItemRef } {
  const pa = priceOf(v, a)
  const pb = priceOf(v, b)
  const order: [ItemRef, ItemRef][] =
    pa < pb ? [[a, b], [b, a]] : pb < pa ? [[b, a], [a, b]] : a.type === "service" || b.type !== "service" ? [[a, b], [b, a]] : [[b, a], [a, b]]
  for (const [kept, removed] of order) {
    const after = without(v, removed)
    const optionWithoutService = after.services.length === 0 && after.options.length > 0
    if (!optionWithoutService) return { kept, removed }
  }
  return { kept: order[0][0], removed: order[0][1] }
}

export function normalizeCart(
  cart: Cart,
  equivalences: EquivalenceRule[] = [],
): { cart: Cart; adjustments: CartAdjustment[] } {
  assertCart(cart)
  const adjustments: CartAdjustment[] = []
  const rules = equivalences.filter((r) => validateEquivalence(r).ok).sort((x, y) => x.id - y.id)

  const vehicles = cart.vehicles.map((v) => {
    // 1. Doublons exacts : on garde la première occurrence.
    const services: CartVehicle["services"] = []
    for (const s of v.services) {
      if (services.some((x) => x.serviceId === s.serviceId)) {
        adjustments.push({ kind: "duplicate_merged", vehicleKey: v.key, item: { type: "service", id: s.serviceId }, removedPriceCents: s.priceCents })
      } else services.push({ serviceId: s.serviceId, priceCents: s.priceCents })
    }
    const options: CartVehicle["options"] = []
    for (const o of v.options) {
      if (options.some((x) => x.optionId === o.optionId)) {
        adjustments.push({ kind: "duplicate_merged", vehicleKey: v.key, item: { type: "option", id: o.optionId }, removedPriceCents: o.priceCents })
      } else options.push({ optionId: o.optionId, priceCents: o.priceCents })
    }
    let current: CartVehicle = { key: v.key, services, options }

    // 2. Équivalences : jamais deux fois le même traitement sur un même véhicule.
    for (const rule of rules) {
      if (has(current, rule.a) && has(current, rule.b)) {
        const { kept, removed } = chooseKept(current, rule.a, rule.b)
        const keptPriceCents = priceOf(current, kept)
        const removedPriceCents = priceOf(current, removed)
        current = without(current, removed)
        adjustments.push({
          kind: "equivalence_resolved",
          vehicleKey: v.key,
          ruleId: rule.id,
          kept,
          removed,
          keptPriceCents,
          removedPriceCents,
          reason: rule.reason.trim(),
        })
      }
    }
    return current
  })

  return { cart: { vehicles }, adjustments }
}

/** 6500 → « 65 € », 6550 → « 65,50 € » (espaces simples, résultat identique serveur/client). */
export function formatEuros(cents: number): string {
  const sign = cents < 0 ? "−" : ""
  const abs = Math.abs(Math.trunc(cents))
  const euros = Math.floor(abs / 100)
  const rest = abs % 100
  const int = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${sign}${int}${rest ? `,${String(rest).padStart(2, "0")}` : ""} €`
}

/**
 * Explication en français d'une correction automatique, à afficher au client
 * AVANT validation (récapitulatif) et au pro (détail de la réservation).
 * `label` fournit le nom de l'élément tel qu'affiché dans le catalogue.
 */
export function describeAdjustment(adj: CartAdjustment, label: (ref: ItemRef) => string): string {
  if (adj.kind === "duplicate_merged") {
    return `« ${label(adj.item)} » était ajouté deux fois pour le même véhicule : il n'est compté et facturé qu'une seule fois.`
  }
  const saving = adj.removedPriceCents > 0 ? ` Vous ne payez pas ${formatEuros(adj.removedPriceCents)} en double.` : ""
  return `« ${label(adj.removed)} » et « ${label(adj.kept)} » correspondent au même traitement (${adj.reason.replace(/[.\s]+$/, "")}). Il est réalisé une seule fois et facturé ${formatEuros(adj.keptPriceCents)} au titre de « ${label(adj.kept)} ».${saving}`
}

/** Liste à plat des éléments facturables, dans un ordre stable. */
export function cartUnits(cart: Cart): CartUnit[] {
  const units: CartUnit[] = []
  for (const v of cart.vehicles) {
    for (const s of v.services) {
      units.push({ key: unitKey(v.key, { type: "service", id: s.serviceId }), vehicleKey: v.key, type: "service", id: s.serviceId, priceCents: s.priceCents })
    }
    for (const o of v.options) {
      units.push({ key: unitKey(v.key, { type: "option", id: o.optionId }), vehicleKey: v.key, type: "option", id: o.optionId, priceCents: o.priceCents })
    }
  }
  return units
}
