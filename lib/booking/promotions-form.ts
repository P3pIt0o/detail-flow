/**
 * ============================================================================
 *  L21 — FORMULAIRE « OFFRES & RÉDUCTIONS » (module PUR, client + serveur)
 * ============================================================================
 *  Saisie en euros et en pourcentages à l'écran ; envoi au serveur en CENTIMES
 *  et en POINTS DE BASE entiers (10 % = 1000). Aucun flottant ne quitte ce
 *  module. Le serveur revalide tout (validatePromotion, propriété du tenant).
 * ============================================================================
 */
import type { Promotion, PromotionKind, PromotionTier, PromotionValue } from "@/lib/booking/promotions"

export type ValueMode = PromotionValue["type"]

/** Modes autorisés par type d'offre (identiques au moteur L17-B). */
export const MODES_BY_KIND: Record<PromotionKind, ValueMode[]> = {
  multi_services: ["percent", "fixed_total"],
  service_option: ["percent", "amount"],
  multi_options: ["percent", "amount"],
}

export const KIND_LABEL: Record<PromotionKind, string> = {
  multi_services: "Plusieurs prestations",
  service_option: "Prestation + option",
  multi_options: "Plusieurs options",
}

export const MODE_LABEL: Record<ValueMode, string> = {
  percent: "Réduction en %",
  amount: "Réduction en €",
  fixed_total: "Prix total fixe",
}

export type TierForm = { minQuantity: string; value: string }

export type PromotionFormState = {
  name: string
  kind: PromotionKind
  mode: ValueMode
  tiers: TierForm[]
  /** multi_services / multi_options : vrai = toutes les prestations / options. */
  allItems: boolean
  serviceIds: number[]
  optionIds: number[]
  includeOptions: boolean
  trigger: { serviceId: number | null; optionId: number | null; appliesTo: "service" | "option" | "both" }
  startDate: string
  endDate: string
  stackable: boolean
  stackableWithPromoCode: boolean
}

/** Données envoyées à `savePromotion` (même forme que `PromotionInput` côté serveur). */
export type PromotionPayload = {
  name: string
  kind: PromotionKind
  stackable: boolean
  stackableWithPromoCode: boolean
  startDate: string | null
  endDate: string | null
  tiers: PromotionTier[]
  eligibleServiceIds?: number[] | null
  includeOptions?: boolean
  eligibleOptionIds?: number[] | null
  trigger?: { serviceId: number; optionId: number; appliesTo: "service" | "option" | "both" }
}

export function emptyForm(kind: PromotionKind = "multi_services"): PromotionFormState {
  return {
    name: "",
    kind,
    mode: "percent",
    tiers: kind === "service_option" ? [{ minQuantity: "1", value: "" }] : [{ minQuantity: "2", value: "" }],
    allItems: true,
    serviceIds: [],
    optionIds: [],
    includeOptions: false,
    trigger: { serviceId: null, optionId: null, appliesTo: "option" },
    startDate: "",
    endDate: "",
    stackable: false,
    stackableWithPromoCode: false,
  }
}

/* -------------------------------------------------------------------------- */
/*  Conversions (sans flottant transmis)                                       */
/* -------------------------------------------------------------------------- */

/**
 * « 19,90 » / « 19.9 » / « 19 » → 1990 centimes. Au plus 2 décimales ; null si
 * illisible, négatif ou trop grand. Calcul sur les chiffres, sans flottant.
 */
export function eurosToCents(input: string): number | null {
  const s = String(input ?? "").trim().replace(/\s|€/g, "").replace(",", ".")
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"))
}

/** « 12,5 » → 1250 points de base ; 2 décimales au plus ; ]0 ; 100]. */
export function percentToBps(input: string): number | null {
  const s = String(input ?? "").trim().replace(/\s|%/g, "").replace(",", ".")
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"))
  return bps >= 1 && bps <= 10000 ? bps : null
}

/** 1990 → « 19,90 » (saisie). */
export function centsToInput(cents: number): string {
  const c = Math.max(0, Math.trunc(cents))
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`
}

/** 1250 → « 12,5 » (saisie). */
export function bpsToInput(bps: number): string {
  const b = Math.max(0, Math.trunc(bps))
  const rest = b % 100
  return rest === 0 ? String(Math.floor(b / 100)) : `${Math.floor(b / 100)},${String(rest).padStart(2, "0").replace(/0$/, "")}`
}

/** « AAAA-MM-JJ » d'une date ISO, dans le fuseau donné (affichage des bornes saisies). */
export function isoToDay(iso: string | Date | null | undefined, timeZone = "Europe/Paris"): string {
  if (!iso) return ""
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/* -------------------------------------------------------------------------- */
/*  Formulaire ↔ offre                                                         */
/* -------------------------------------------------------------------------- */

export type FormResult = { ok: true; payload: PromotionPayload } | { ok: false; errors: string[] }

/** Vérifie la saisie et produit les données à envoyer (le serveur revalide tout). */
export function formToPayload(f: PromotionFormState): FormResult {
  const errors: string[] = []
  const name = f.name.trim()
  if (!name) errors.push("Donnez un nom à l'offre.")
  if (!MODES_BY_KIND[f.kind]?.includes(f.mode)) errors.push("Ce mode de réduction n'est pas disponible pour ce type d'offre.")

  const tiers: PromotionTier[] = []
  const rows = f.kind === "service_option" ? f.tiers.slice(0, 1) : f.tiers
  rows.forEach((t, i) => {
    const n = f.kind === "service_option" ? 1 : Number(t.minQuantity)
    const label = rows.length > 1 ? ` (palier ${i + 1})` : ""
    if (!Number.isSafeInteger(n) || n < 1 || n > 99) {
      errors.push(`Indiquez un nombre minimal entre 1 et 99${label}.`)
      return
    }
    if (f.mode === "percent") {
      const bps = percentToBps(t.value)
      if (bps == null) errors.push(`Indiquez un pourcentage entre 0,01 et 100${label}.`)
      else tiers.push({ minQuantity: n, value: { type: "percent", bps } })
    } else {
      const cents = eurosToCents(t.value)
      if (cents == null || cents <= 0) errors.push(`Indiquez un montant en euros supérieur à 0${label}.`)
      else tiers.push({ minQuantity: n, value: { type: f.mode, cents } })
    }
  })
  if (rows.length === 0) errors.push("Ajoutez au moins un palier.")

  if (f.startDate && f.endDate && f.endDate < f.startDate) errors.push("La date de fin doit suivre la date de début.")

  const base = {
    name,
    kind: f.kind,
    stackable: f.stackable,
    stackableWithPromoCode: f.stackableWithPromoCode,
    startDate: f.startDate || null,
    endDate: f.endDate || null,
    tiers,
  }
  let payload: PromotionPayload
  if (f.kind === "multi_services") {
    if (!f.allItems && f.serviceIds.length === 0) errors.push("Choisissez « toutes les prestations » ou au moins une prestation.")
    payload = { ...base, eligibleServiceIds: f.allItems ? null : [...f.serviceIds], includeOptions: f.includeOptions }
  } else if (f.kind === "multi_options") {
    if (!f.allItems && f.optionIds.length === 0) errors.push("Choisissez « toutes les options » ou au moins une option.")
    payload = { ...base, eligibleOptionIds: f.allItems ? null : [...f.optionIds] }
  } else {
    const { serviceId, optionId, appliesTo } = f.trigger
    if (serviceId == null || optionId == null) errors.push("Choisissez la prestation et l'option qui déclenchent l'offre.")
    payload = { ...base, trigger: { serviceId: serviceId ?? 0, optionId: optionId ?? 0, appliesTo } }
  }
  return errors.length ? { ok: false, errors } : { ok: true, payload }
}

/** Offre enregistrée → formulaire (modification). */
export function promotionToForm(p: Promotion, timeZone?: string): PromotionFormState {
  const mode = (p.tiers[0]?.value.type ?? "percent") as ValueMode
  const tiers = p.tiers.map((t) => ({
    minQuantity: String(t.minQuantity),
    value: t.value.type === "percent" ? bpsToInput(t.value.bps) : centsToInput(t.value.cents),
  }))
  const f: PromotionFormState = {
    ...emptyForm(p.kind),
    name: p.name,
    mode,
    tiers,
    startDate: isoToDay(p.startsAt ?? null, timeZone),
    endDate: isoToDay(p.endsAt ?? null, timeZone),
    stackable: p.stackable,
    stackableWithPromoCode: p.stackableWithPromoCode,
  }
  if (p.kind === "multi_services") return { ...f, allItems: p.eligibleServiceIds === null, serviceIds: p.eligibleServiceIds ?? [], includeOptions: p.includeOptions }
  if (p.kind === "multi_options") return { ...f, allItems: p.eligibleOptionIds === null, optionIds: p.eligibleOptionIds ?? [] }
  return { ...f, trigger: { ...p.trigger } }
}

/* -------------------------------------------------------------------------- */
/*  Affichage                                                                  */
/* -------------------------------------------------------------------------- */

const euros = (cents: number) => `${centsToInput(cents).replace(/,00$/, "")} €`

/** « 2 prestations ou plus : −10 % » / « 3 options ou plus : 150 € au total ». */
export function tierLabel(kind: PromotionKind, t: PromotionTier): string {
  const v = t.value
  const value = v.type === "percent" ? `−${bpsToInput(v.bps)} %` : v.type === "amount" ? `−${euros(v.cents)}` : `${euros(v.cents)} au total`
  if (kind === "service_option") return value
  const unit = kind === "multi_services" ? "prestation" : "option"
  return `${t.minQuantity} ${unit}${t.minQuantity > 1 ? "s" : ""} ou plus : ${value}`
}

/**
 * Panier d'exemple pour l'aperçu admin : un véhicule par prestation éligible,
 * les moins chères d'abord (cas le plus courant), jusqu'au plus haut palier.
 */
export function sampleCartFor(
  p: Promotion,
  catalog: { services: { id: number; priceCents: number }[]; options: { id: number; priceCents: number }[] },
): { vehicles: { key: string; services: { serviceId: number; priceCents: number }[]; options: { optionId: number; priceCents: number }[] }[] } {
  const maxQty = Math.max(1, ...p.tiers.map((t) => t.minQuantity))
  const byPrice = <T extends { priceCents: number }>(a: T[]) => [...a].sort((x, y) => x.priceCents - y.priceCents)
  if (p.kind === "service_option") {
    const s = catalog.services.find((x) => x.id === p.trigger.serviceId)
    const o = catalog.options.find((x) => x.id === p.trigger.optionId)
    if (!s || !o) return { vehicles: [] }
    return { vehicles: [{ key: "v1", services: [{ serviceId: s.id, priceCents: s.priceCents }], options: [{ optionId: o.id, priceCents: o.priceCents }] }] }
  }
  if (p.kind === "multi_options") {
    const pool = byPrice(p.eligibleOptionIds ? catalog.options.filter((o) => p.eligibleOptionIds!.includes(o.id)) : catalog.options).slice(0, maxQty)
    const s = byPrice(catalog.services)[0]
    if (!s || pool.length === 0) return { vehicles: [] }
    return { vehicles: [{ key: "v1", services: [{ serviceId: s.id, priceCents: s.priceCents }], options: pool.map((o) => ({ optionId: o.id, priceCents: o.priceCents })) }] }
  }
  const pool = byPrice(p.eligibleServiceIds ? catalog.services.filter((s) => p.eligibleServiceIds!.includes(s.id)) : catalog.services)
  const picked = Array.from({ length: pool.length ? maxQty : 0 }, (_, i) => pool[i % pool.length])
  return { vehicles: picked.map((s, i) => ({ key: `v${i + 1}`, services: [{ serviceId: s.id, priceCents: s.priceCents }], options: [] })) }
}
