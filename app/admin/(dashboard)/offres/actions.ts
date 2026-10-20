"use server"

/**
 * ============================================================================
 *  ACTIONS ADMIN — OFFRES & RÉDUCTIONS (L19)
 * ============================================================================
 *  - Écritures (créer, modifier, dupliquer, activer, désactiver, supprimer) :
 *    propriétaire et administrateurs uniquement — requireCompanyRole(["OWNER", "ADMIN"]).
 *  - Lecture : tout membre — requireCompanyMember().
 *  - companyId : TOUJOURS issu de la session, jamais de l'entrée.
 *  - Ids de prestations / options revérifiés comme appartenant au tenant.
 *  - Offre validée par le moteur (validatePromotion) avant toute écriture ;
 *    alertes de paliers (analyzeTiers) renvoyées, jamais bloquantes.
 * ============================================================================
 */

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { options, services } from "@/lib/db/schema"
import { requireCompanyMember, requireCompanyRole } from "@/lib/admin"
import {
  analyzeTiers,
  validateEquivalence,
  validatePromotion,
  type ItemRef,
  type Promotion,
  type PromotionKind,
  type PromotionTier,
  type TierWarning,
} from "@/lib/booking/promotions"
import {
  deleteRow,
  duplicatePromotion,
  insertEquivalence,
  insertPromotion,
  insertUpsell,
  listForAdmin,
  setActive,
  updatePromotion,
  zonedDayBoundary,
  type AdminLists,
} from "@/lib/booking/promotions-store"

const WRITE_ROLES = ["OWNER", "ADMIN"] as const

export type OfferActionResult =
  | { ok: true; id?: number; warnings?: TierWarning[] }
  | { ok: false; error: string; errors?: string[] }

const UNAVAILABLE: OfferActionResult = { ok: false, error: "Cette fonctionnalité sera bientôt disponible." }

/** Nombre maximal de compléments suggérés pour une prestation. */
const MAX_UPSELL_ITEMS = 5

/** Palier reconstruit champ par champ : aucune donnée du navigateur n'est stockée telle quelle. */
function cleanTier(t: unknown): PromotionTier {
  const o = (t && typeof t === "object" ? t : {}) as { minQuantity?: unknown; value?: { type?: unknown; bps?: unknown; cents?: unknown } }
  const v = o.value && typeof o.value === "object" ? o.value : {}
  const value =
    v.type === "percent" ? { type: "percent" as const, bps: Number(v.bps) } : { type: (v.type === "fixed_total" ? "fixed_total" : "amount") as "amount" | "fixed_total", cents: Number(v.cents) }
  return { minQuantity: Number(o.minQuantity), value } as PromotionTier
}

function revalidate() {
  revalidatePath("/admin/offres")
}

const ids = (v: unknown): number[] =>
  Array.from(new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0)))

/** Vrai si TOUS les ids appartiennent au tenant (anti-IDOR). */
async function ownsServices(companyId: number, list: number[]): Promise<boolean> {
  if (list.length === 0) return true
  const rows = await db.select({ id: services.id }).from(services).where(and(eq(services.companyId, companyId), inArray(services.id, list)))
  return rows.length === list.length
}
async function ownsOptions(companyId: number, list: number[]): Promise<boolean> {
  if (list.length === 0) return true
  const rows = await db.select({ id: options.id }).from(options).where(and(eq(options.companyId, companyId), inArray(options.id, list)))
  return rows.length === list.length
}
async function ownsItems(companyId: number, items: ItemRef[]): Promise<boolean> {
  return (
    (await ownsServices(companyId, ids(items.filter((i) => i?.type === "service").map((i) => i.id)))) &&
    (await ownsOptions(companyId, ids(items.filter((i) => i?.type === "option").map((i) => i.id))))
  )
}

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                    */
/* -------------------------------------------------------------------------- */

export async function listOffers(): Promise<AdminLists & { warnings: Record<number, TierWarning[]> }> {
  const { tenant } = await requireCompanyMember()
  const lists = await listForAdmin(tenant.id)
  const warnings: Record<number, TierWarning[]> = {}
  for (const p of lists.promotions) if (!("invalid" in p)) warnings[p.id] = analyzeTiers(p)
  return { ...lists, warnings }
}

/* -------------------------------------------------------------------------- */
/*  Offres                                                                     */
/* -------------------------------------------------------------------------- */

export type PromotionInput = {
  name: string
  kind: PromotionKind
  priority?: number
  stackable?: boolean
  stackableWithPromoCode?: boolean
  /** Jour de début / fin « AAAA-MM-JJ » dans le fuseau de l'entreprise (fin de journée incluse). */
  startDate?: string | null
  endDate?: string | null
  /** Paliers : pourcentages en points de base, montants en centimes. */
  tiers: PromotionTier[]
  /** multi_services : null = toutes. */
  eligibleServiceIds?: number[] | null
  includeOptions?: boolean
  /** multi_options : null = toutes. */
  eligibleOptionIds?: number[] | null
  /** service_option */
  trigger?: { serviceId: number; optionId: number; appliesTo: "service" | "option" | "both" }
}

function buildPromotion(input: PromotionInput, id: number, active: boolean, timeZone: string): Promotion | string {
  const startsAt = input.startDate ? zonedDayBoundary(input.startDate, timeZone, "start") : null
  const endsAt = input.endDate ? zonedDayBoundary(input.endDate, timeZone, "end") : null
  if ((input.startDate && !startsAt) || (input.endDate && !endsAt)) return "Date de validité invalide."
  const base = {
    id,
    name: String(input.name ?? ""),
    active,
    startsAt,
    endsAt,
    priority: Number.isInteger(input.priority) ? (input.priority as number) : 0,
    stackable: input.stackable === true,
    stackableWithPromoCode: input.stackableWithPromoCode === true,
    tiers: Array.isArray(input.tiers) ? input.tiers.slice(0, 11).map(cleanTier) : [],
  }
  switch (input.kind) {
    case "multi_services":
      return { ...base, kind: "multi_services", eligibleServiceIds: input.eligibleServiceIds == null ? null : ids(input.eligibleServiceIds), includeOptions: input.includeOptions === true }
    case "multi_options":
      return { ...base, kind: "multi_options", eligibleOptionIds: input.eligibleOptionIds == null ? null : ids(input.eligibleOptionIds) }
    case "service_option":
      if (!input.trigger) return "Choisissez la prestation et l'option qui déclenchent l'offre."
      return { ...base, kind: "service_option", trigger: { serviceId: Number(input.trigger.serviceId), optionId: Number(input.trigger.optionId), appliesTo: input.trigger.appliesTo } }
    default:
      return "Type d'offre inconnu."
  }
}

function referencedIds(p: Promotion): { serviceIds: number[]; optionIds: number[] } {
  if (p.kind === "multi_services") return { serviceIds: p.eligibleServiceIds ?? [], optionIds: [] }
  if (p.kind === "multi_options") return { serviceIds: [], optionIds: p.eligibleOptionIds ?? [] }
  return { serviceIds: [p.trigger.serviceId], optionIds: [p.trigger.optionId] }
}

/**
 * Crée (sans `id`, offre DÉSACTIVÉE) ou modifie (avec `id`, état actif conservé)
 * une offre du tenant courant.
 */
export async function savePromotion(input: PromotionInput, id?: number): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  const editing = id !== undefined
  if (editing && !(Number.isInteger(id) && (id as number) > 0)) return { ok: false, error: "Offre introuvable." }

  // En modification, l'état actif est conservé (activation = action dédiée).
  let active = false
  if (editing) {
    const lists = await listForAdmin(tenant.id)
    if (!lists.ready) return UNAVAILABLE
    const current = lists.promotions.find((p) => p.id === id)
    if (!current) return { ok: false, error: "Offre introuvable." }
    active = !("invalid" in current) && current.active
  }

  const built = buildPromotion(input, editing ? (id as number) : 1, active, tenant.timezone)
  if (typeof built === "string") return { ok: false, error: built }
  const v = validatePromotion(built)
  if (!v.ok) return { ok: false, error: "Offre invalide.", errors: v.errors }

  const refs = referencedIds(built)
  if (!(await ownsServices(tenant.id, ids(refs.serviceIds)))) return { ok: false, error: "Une prestation sélectionnée est invalide." }
  if (!(await ownsOptions(tenant.id, ids(refs.optionIds)))) return { ok: false, error: "Une option sélectionnée est invalide." }

  if (editing) {
    // L'état actif n'est pas réécrit par la modification (voir updatePromotion).
    if (!(await updatePromotion(tenant.id, id as number, built))) return { ok: false, error: "Offre introuvable." }
    revalidate()
    return { ok: true, id, warnings: analyzeTiers(built) }
  }
  const newId = await insertPromotion(tenant.id, built)
  if (!newId) return UNAVAILABLE
  revalidate()
  return { ok: true, id: newId, warnings: analyzeTiers(built) }
}

export async function duplicatePromotionAction(id: number): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Offre introuvable." }
  const newId = await duplicatePromotion(tenant.id, id)
  if (!newId) return { ok: false, error: "Offre introuvable." }
  revalidate()
  return { ok: true, id: newId }
}

export async function setPromotionActiveAction(id: number, active: boolean): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Offre introuvable." }
  if (active) {
    // Jamais d'activation d'une offre que le moteur refuserait.
    const lists = await listForAdmin(tenant.id)
    const current = lists.promotions.find((p) => p.id === id)
    if (!current) return { ok: false, error: "Offre introuvable." }
    if ("invalid" in current) return { ok: false, error: "Cette offre est incomplète : modifiez-la avant de l'activer." }
    // Les prestations et options citées existent toujours dans CE tenant (supprimées entre-temps : refus).
    const refs = referencedIds(current)
    if (!(await ownsServices(tenant.id, ids(refs.serviceIds))) || !(await ownsOptions(tenant.id, ids(refs.optionIds)))) {
      return { ok: false, error: "Une prestation ou une option de cette offre n'existe plus : modifiez l'offre avant de l'activer." }
    }
  }
  if (!(await setActive("promotions", tenant.id, id, active === true))) return { ok: false, error: "Offre introuvable." }
  revalidate()
  return { ok: true, id }
}

export async function deletePromotionAction(id: number): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Offre introuvable." }
  if (!(await deleteRow("promotions", tenant.id, id))) return { ok: false, error: "Offre introuvable." }
  revalidate()
  return { ok: true, id }
}

/* -------------------------------------------------------------------------- */
/*  Équivalences (même traitement)                                             */
/* -------------------------------------------------------------------------- */

export async function saveEquivalence(input: { a: ItemRef; b: ItemRef; reason: string }): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  const ref = (r: unknown): ItemRef => {
    const o = (r && typeof r === "object" ? r : {}) as { type?: unknown; id?: unknown }
    return { type: o.type as ItemRef["type"], id: Number(o.id) } // validé juste après (validateEquivalence)
  }
  const rule = { id: 1, a: ref(input?.a), b: ref(input?.b), reason: String(input?.reason ?? "").trim().slice(0, 200) }
  const v = validateEquivalence(rule)
  if (!v.ok) return { ok: false, error: "Règle invalide.", errors: v.errors }
  if (!(await ownsItems(tenant.id, [rule.a, rule.b]))) return { ok: false, error: "Un élément sélectionné est invalide." }
  const newId = await insertEquivalence(tenant.id, { a: rule.a, b: rule.b, reason: rule.reason })
  if (!newId) return UNAVAILABLE
  revalidate()
  return { ok: true, id: newId }
}

export async function setEquivalenceActiveAction(id: number, active: boolean): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0 || !(await setActive("cart_rules", tenant.id, id, active === true))) return { ok: false, error: "Règle introuvable." }
  revalidate()
  return { ok: true, id }
}

export async function deleteEquivalenceAction(id: number): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0 || !(await deleteRow("cart_rules", tenant.id, id))) return { ok: false, error: "Règle introuvable." }
  revalidate()
  return { ok: true, id }
}

/* -------------------------------------------------------------------------- */
/*  Compléments suggérés                                                       */
/* -------------------------------------------------------------------------- */

export async function saveUpsell(input: { whenServiceId: number; suggest: ItemRef[]; message?: string | null }): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  const whenServiceId = Number(input?.whenServiceId)
  const seen = new Set<string>()
  const suggest: ItemRef[] = []
  for (const i of Array.isArray(input?.suggest) ? input.suggest : []) {
    if (!i || (i.type !== "service" && i.type !== "option") || !Number.isSafeInteger(i.id) || i.id <= 0) continue
    if (i.type === "service" && i.id === whenServiceId) continue
    const key = `${i.type}:${i.id}`
    if (seen.has(key)) continue
    seen.add(key)
    suggest.push({ type: i.type, id: i.id })
  }
  if (suggest.length > MAX_UPSELL_ITEMS) return { ok: false, error: `Choisissez au plus ${MAX_UPSELL_ITEMS} compléments.` }
  if (!Number.isInteger(whenServiceId) || whenServiceId <= 0) return { ok: false, error: "Choisissez la prestation concernée." }
  if (suggest.length === 0) return { ok: false, error: "Choisissez au moins un complément." }
  if (!(await ownsItems(tenant.id, [{ type: "service", id: whenServiceId }, ...suggest]))) return { ok: false, error: "Un élément sélectionné est invalide." }
  const message = typeof input.message === "string" && input.message.trim() ? input.message.trim().slice(0, 140) : null
  const newId = await insertUpsell(tenant.id, { whenServiceId, suggest, message })
  if (!newId) return UNAVAILABLE
  revalidate()
  return { ok: true, id: newId }
}

export async function setUpsellActiveAction(id: number, active: boolean): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0 || !(await setActive("upsell_suggestions", tenant.id, id, active === true))) return { ok: false, error: "Complément introuvable." }
  revalidate()
  return { ok: true, id }
}

export async function deleteUpsellAction(id: number): Promise<OfferActionResult> {
  const { tenant } = await requireCompanyRole([...WRITE_ROLES])
  if (!Number.isInteger(id) || id <= 0 || !(await deleteRow("upsell_suggestions", tenant.id, id))) return { ok: false, error: "Complément introuvable." }
  revalidate()
  return { ok: true, id }
}
