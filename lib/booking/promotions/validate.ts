/**
 * Validation des promotions et des règles de panier (PURE).
 * Utilisée par l'admin (messages en français) ET par le moteur : une règle
 * invalide n'est JAMAIS appliquée.
 */

import { BPS_SCALE, isPosInt } from "./money"
import type { EquivalenceRule, ItemRef, Promotion, PromotionValue } from "./types"

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

const ALLOWED_MODES: Record<Promotion["kind"], PromotionValue["type"][]> = {
  multi_services: ["percent", "fixed_total"],
  service_option: ["percent", "amount"],
  multi_options: ["percent", "amount"],
}

const MODE_LABEL: Record<PromotionValue["type"], string> = {
  percent: "pourcentage",
  amount: "réduction en euros",
  fixed_total: "prix total fixe",
}

/** Date seule « AAAA-MM-JJ » : ambiguë (fuseau, fin de journée exclue) → refusée. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function toTime(d: string | Date | null | undefined): number | null {
  if (d == null || d === "") return null
  if (typeof d === "string" && DATE_ONLY.test(d.trim())) return Number.NaN
  const t = d instanceof Date ? d.getTime() : Date.parse(d)
  return Number.isNaN(t) ? Number.NaN : t
}

function validIdList(v: unknown): boolean {
  return v === null || (Array.isArray(v) && v.length > 0 && v.every(isPosInt))
}

export function validateValue(value: PromotionValue): string | null {
  switch (value?.type) {
    case "percent":
      return Number.isInteger(value.bps) && value.bps >= 1 && value.bps <= BPS_SCALE
        ? null
        : "Le pourcentage doit être compris entre 0,01 % et 100 %."
    case "amount":
      return isPosInt(value.cents) ? null : "Le montant de la réduction doit être supérieur à 0 €."
    case "fixed_total":
      return isPosInt(value.cents) ? null : "Le prix total doit être supérieur à 0 €."
    default:
      return "Type de réduction inconnu."
  }
}

export function validatePromotion(p: Promotion): ValidationResult {
  const errors: string[] = []
  if (!p || typeof p !== "object") return { ok: false, errors: ["Offre invalide."] }
  if (!isPosInt(p.id)) errors.push("Identifiant d'offre invalide.")
  if (typeof p.name !== "string" || !p.name.trim()) errors.push("Donnez un nom à l'offre.")
  if (!Number.isInteger(p.priority)) errors.push("Priorité invalide.")

  const start = toTime(p.startsAt)
  const end = toTime(p.endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) {
    errors.push("Date de validité invalide : indiquez une date ET une heure (fuseau de l'entreprise), par exemple 2026-10-31T23:59:59+01:00.")
  }
  else if (start != null && end != null && end < start) errors.push("La date de fin doit suivre la date de début.")

  const allowed = ALLOWED_MODES[p.kind]
  if (!allowed) return { ok: false, errors: [...errors, "Type d'offre inconnu."] }

  if (!Array.isArray(p.tiers) || p.tiers.length === 0) {
    errors.push("Ajoutez au moins un palier.")
  } else {
    const seen = new Set<number>()
    for (const t of p.tiers) {
      if (!isPosInt(t?.minQuantity)) {
        errors.push("Chaque palier doit indiquer un nombre minimal (1 ou plus).")
        continue
      }
      if (seen.has(t.minQuantity)) errors.push(`Deux paliers portent sur ${t.minQuantity} élément(s).`)
      seen.add(t.minQuantity)
      const vErr = validateValue(t.value)
      if (vErr) errors.push(vErr)
      else if (!allowed.includes(t.value.type)) {
        errors.push(`Le mode « ${MODE_LABEL[t.value.type]} » n'est pas disponible pour ce type d'offre.`)
      }
    }
    // Paliers du prix total fixe : un prix total plus élevé pour plus de
    // prestations est cohérent (ex. 2 → 100 €, 3 → 150 €) ; on n'impose rien de plus.
  }

  switch (p.kind) {
    case "multi_services":
      if (!validIdList(p.eligibleServiceIds)) errors.push("Choisissez « toutes les prestations » ou au moins une prestation.")
      if (typeof p.includeOptions !== "boolean") errors.push("Réglage « options incluses » invalide.")
      break
    case "multi_options":
      if (!validIdList(p.eligibleOptionIds)) errors.push("Choisissez « toutes les options » ou au moins une option.")
      break
    case "service_option":
      if (!p.trigger || !isPosInt(p.trigger.serviceId) || !isPosInt(p.trigger.optionId)) {
        errors.push("Choisissez la prestation et l'option qui déclenchent l'offre.")
      } else if (!["service", "option", "both"].includes(p.trigger.appliesTo)) {
        errors.push("Indiquez sur quoi porte la réduction.")
      }
      if (Array.isArray(p.tiers) && (p.tiers.length !== 1 || p.tiers[0]?.minQuantity !== 1)) {
        errors.push("Une offre prestation + option comporte une seule réduction.")
      }
      break
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}

const sameRef = (x: ItemRef, y: ItemRef) => x.type === y.type && x.id === y.id
const validRef = (r: ItemRef) => !!r && (r.type === "service" || r.type === "option") && isPosInt(r.id)

export function validateEquivalence(rule: EquivalenceRule): ValidationResult {
  const errors: string[] = []
  if (!isPosInt(rule?.id)) errors.push("Identifiant de règle invalide.")
  if (!validRef(rule?.a) || !validRef(rule?.b)) errors.push("Choisissez les deux éléments équivalents.")
  else if (sameRef(rule.a, rule.b)) errors.push("Les deux éléments doivent être différents.")
  if (typeof rule?.reason !== "string" || !rule.reason.trim()) errors.push("Indiquez le motif de la règle.")
  return errors.length ? { ok: false, errors } : { ok: true }
}

/** Offre en vigueur à la date donnée (active, valide, dans ses dates). */
export function isPromotionLive(p: Promotion, now: Date): boolean {
  if (!p.active || !validatePromotion(p).ok) return false
  const t = now.getTime()
  const start = toTime(p.startsAt)
  const end = toTime(p.endsAt)
  if (start != null && t < start) return false
  if (end != null && t > end) return false
  return true
}
