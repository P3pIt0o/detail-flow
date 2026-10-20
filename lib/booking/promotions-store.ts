import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { usesLegacyBookingWizard } from "@/lib/company/publication-shared"
import {
  validateEquivalence,
  validatePromotion,
  type EquivalenceRule,
  type ItemRef,
  type Promotion,
  type PromotionKind,
  type PromotionTier,
} from "@/lib/booking/promotions"

/**
 * ============================================================================
 *  L19 — STOCKAGE DES PROMOTIONS (tolérant à l'absence de migration)
 * ============================================================================
 *  Tables `promotions`, `cart_rules`, `upsell_suggestions` (scripts/
 *  l19-promotions-migration.sql), volontairement NON déclarées dans le schéma
 *  Drizzle (même méthode que lib/services/highlight-store.ts) :
 *   - avant migration : aucune requête sur ces tables, aucune offre ;
 *   - base indisponible : lecture stricte refusée (`{ ok: false }`), lecture
 *     tolérante vide ; une panne n'est jamais mise en cache.
 *  TOUTES les requêtes filtrent par "companyId". Une ligne invalide (jsonb
 *  malformé, palier incohérent…) n'est jamais renvoyée au moteur.
 * ============================================================================
 */

type Row = Record<string, unknown>
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? []
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/* -------------------------------------------------------------------------- */
/*  État du schéma                                                             */
/* -------------------------------------------------------------------------- */

export type PromotionsSchemaState = "ready" | "absent" | "error"
let readyCache: { value: boolean; at: number } | null = null
/** Toute erreur de requête invalide l'état mis en cache (tables supprimées, retour arrière). */
export function resetPromotionsSchemaCache(): void {
  readyCache = null
}
const NEGATIVE_TTL_MS = 30_000

export async function promotionsSchemaState(): Promise<PromotionsSchemaState> {
  const now = Date.now()
  if (readyCache && (readyCache.value || now - readyCache.at < NEGATIVE_TTL_MS)) return readyCache.value ? "ready" : "absent"
  try {
    const [t, c] = await Promise.all([
      db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('promotions', 'cart_rules', 'upsell_suggestions')
      `),
      db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'bookings'
          AND column_name IN ('promotionDiscountCents', 'promotionSnapshot')
      `),
    ])
    const value = rowsOf(t).length >= 3 && rowsOf(c).length >= 2
    readyCache = { value, at: now }
    return value ? "ready" : "absent"
  } catch {
    return "error"
  }
}

/* -------------------------------------------------------------------------- */
/*  Conversions ligne SQL ↔ moteur (pures, exportées pour les tests)           */
/* -------------------------------------------------------------------------- */

const posInt = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null
}
/**
 * Liste d'ids du périmètre. SEUL un `null` JSON explicite vaut « tous » ; clé
 * absente, mauvais type ou élément invalide → `undefined` (ligne rejetée).
 */
const idList = (v: unknown): number[] | null | undefined => {
  if (v === null) return null
  if (!Array.isArray(v) || v.length === 0) return undefined
  const out = v.map(posInt)
  return out.every((n): n is number => n !== null) ? out : undefined
}
const iso = (v: unknown): string | null => {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const asObject = (v: unknown): Record<string, unknown> | null => {
  const x = typeof v === "string" ? safeJson(v) : v
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}
const asArray = (v: unknown): unknown[] | null => {
  const x = typeof v === "string" ? safeJson(v) : v
  return Array.isArray(x) ? x : null
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Ligne `promotions` → offre du moteur, ou `null` si la ligne est invalide. */
export function rowToPromotion(r: Row): Promotion | null {
  const id = posInt(r.id)
  const scope = asObject(r.scope)
  const tiers = asArray(r.tiers) as PromotionTier[] | null
  if (!id || !scope || !tiers) return null
  const base = {
    id,
    name: String(r.name ?? ""),
    active: r.active === true,
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    priority: Number.isInteger(Number(r.priority)) ? Number(r.priority) : 0,
    stackable: r.stackable === true,
    stackableWithPromoCode: r.stackableWithPromoCode === true,
    tiers,
  }
  let p: Promotion
  switch (r.kind as PromotionKind) {
    case "multi_services": {
      const eligibleServiceIds = idList(scope.eligibleServiceIds)
      if (eligibleServiceIds === undefined) return null
      p = { ...base, kind: "multi_services", eligibleServiceIds, includeOptions: scope.includeOptions === true }
      break
    }
    case "multi_options": {
      const eligibleOptionIds = idList(scope.eligibleOptionIds)
      if (eligibleOptionIds === undefined) return null
      p = { ...base, kind: "multi_options", eligibleOptionIds }
      break
    }
    case "service_option": {
      const t = asObject(scope.trigger)
      if (!t) return null
      const appliesTo = t.appliesTo === "service" || t.appliesTo === "option" || t.appliesTo === "both" ? t.appliesTo : null
      const serviceId = posInt(t.serviceId)
      const optionId = posInt(t.optionId)
      if (!appliesTo || !serviceId || !optionId) return null
      p = { ...base, kind: "service_option", trigger: { serviceId, optionId, appliesTo } }
      break
    }
    default:
      return null
  }
  return validatePromotion(p).ok ? p : null
}

/** Offre → colonnes à écrire (le moteur reste la seule définition des types). */
export function promotionToColumns(p: Promotion): {
  name: string
  kind: PromotionKind
  active: boolean
  startsAt: string | null
  endsAt: string | null
  priority: number
  stackable: boolean
  stackableWithPromoCode: boolean
  scope: string
  tiers: string
} {
  const scope =
    p.kind === "multi_services"
      ? { eligibleServiceIds: p.eligibleServiceIds, includeOptions: p.includeOptions }
      : p.kind === "multi_options"
        ? { eligibleOptionIds: p.eligibleOptionIds }
        : { trigger: p.trigger }
  return {
    name: p.name.trim(),
    kind: p.kind,
    active: p.active,
    startsAt: iso(p.startsAt),
    endsAt: iso(p.endsAt),
    priority: p.priority,
    stackable: p.stackable,
    stackableWithPromoCode: p.stackableWithPromoCode,
    scope: JSON.stringify(scope),
    tiers: JSON.stringify(p.tiers),
  }
}

const itemRef = (v: unknown): ItemRef | null => {
  const o = asObject(v)
  const id = posInt(o?.id)
  return o && id && (o.type === "service" || o.type === "option") ? { type: o.type, id } : null
}

/** Ligne `cart_rules` → équivalence du moteur, ou `null` si invalide. */
export function rowToEquivalence(r: Row): EquivalenceRule | null {
  const id = posInt(r.id)
  const a = itemRef(r.itemA)
  const b = itemRef(r.itemB)
  if (!id || !a || !b || r.kind !== "equivalence") return null
  const rule: EquivalenceRule = { id, a, b, reason: String(r.reason ?? "") }
  return validateEquivalence(rule).ok ? rule : null
}

export type UpsellSuggestion = { id: number; whenServiceId: number; suggest: ItemRef[]; message: string | null; active: boolean }

export function rowToUpsell(r: Row): UpsellSuggestion | null {
  const id = posInt(r.id)
  const whenServiceId = posInt(r.whenServiceId)
  const suggest = (asArray(r.suggest) ?? []).map(itemRef).filter((x): x is ItemRef => x !== null)
  if (!id || !whenServiceId || suggest.length === 0) return null
  return { id, whenServiceId, suggest, message: typeof r.message === "string" && r.message.trim() ? r.message.trim() : null, active: r.active === true }
}

/* -------------------------------------------------------------------------- */
/*  Fuseau de l'entreprise : jour saisi dans l'admin → horodatage absolu       */
/* -------------------------------------------------------------------------- */

function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - (instant - (instant % 1000))
}

/**
 * Début (00:00:00.000) ou fin (23:59:59.999) d'un jour « AAAA-MM-JJ » dans le
 * fuseau de l'entreprise, en ISO UTC. Fuseau invalide → Europe/Paris.
 * `null` si la date est illisible.
 */
export function zonedDayBoundary(day: string, timeZone: string | null | undefined, edge: "start" | "end"): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? "").trim())
  if (!m) return null
  let tz = timeZone || "Europe/Paris"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
  } catch {
    tz = "Europe/Paris"
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const wall = edge === "start" ? Date.UTC(y, mo, d, 0, 0, 0, 0) : Date.UTC(y, mo, d, 23, 59, 59, 999)
  const check = new Date(Date.UTC(y, mo, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null
  let instant = wall - tzOffsetMs(wall, tz)
  instant = wall - tzOffsetMs(instant, tz) // second passage : changements d'heure
  return new Date(instant).toISOString()
}

/* -------------------------------------------------------------------------- */
/*  Lecture (réservation, lot suivant) — stricte                               */
/* -------------------------------------------------------------------------- */

export type PromotionData = { promotions: Promotion[]; equivalences: EquivalenceRule[]; upsells: UpsellSuggestion[] }
const EMPTY: PromotionData = { promotions: [], equivalences: [], upsells: [] }

/**
 * Données actives d'un tenant pour le moteur. Spirit ACS / Rozan : rien, sans
 * requête. Migration absente : rien. Base indisponible : `{ ok: false }` (la
 * réservation doit refuser plutôt que facturer un autre montant que l'aperçu).
 */
export async function loadPromotionData(
  tenant: { id: number; customSiteKey: string | null },
): Promise<({ ok: true } & PromotionData) | { ok: false }> {
  if (!Number.isInteger(tenant.id) || tenant.id <= 0 || usesLegacyBookingWizard(tenant.customSiteKey)) return { ok: true, ...EMPTY }
  const state = await promotionsSchemaState()
  if (state === "absent") return { ok: true, ...EMPTY }
  if (state === "error") return { ok: false }
  try {
    const [p, e, u] = await Promise.all([
      db.execute(sql`SELECT * FROM "promotions" WHERE "companyId" = ${tenant.id} AND "active" = true ORDER BY "priority" DESC, "id" ASC`),
      db.execute(sql`SELECT * FROM "cart_rules" WHERE "companyId" = ${tenant.id} AND "active" = true ORDER BY "id" ASC`),
      db.execute(sql`SELECT * FROM "upsell_suggestions" WHERE "companyId" = ${tenant.id} AND "active" = true ORDER BY "id" ASC`),
    ])
    return {
      ok: true,
      promotions: rowsOf(p).map(rowToPromotion).filter((x): x is Promotion => x !== null),
      equivalences: rowsOf(e).map(rowToEquivalence).filter((x): x is EquivalenceRule => x !== null),
      upsells: rowsOf(u).map(rowToUpsell).filter((x): x is UpsellSuggestion => x !== null),
    }
  } catch {
    resetPromotionsSchemaCache()
    return { ok: false }
  }
}

/** Variante tolérante (affichage) : toute indisponibilité → aucune offre. */
export async function getPromotionData(tenant: { id: number; customSiteKey: string | null }): Promise<PromotionData> {
  const r = await loadPromotionData(tenant)
  return r.ok ? { promotions: r.promotions, equivalences: r.equivalences, upsells: r.upsells } : EMPTY
}

/* -------------------------------------------------------------------------- */
/*  Admin (companyId fourni par l'action, issu de la session)                  */
/* -------------------------------------------------------------------------- */

export type AdminLists = { ready: boolean; promotions: (Promotion | { id: number; invalid: true; name: string })[]; equivalences: EquivalenceRule[]; upsells: UpsellSuggestion[] }

export async function listForAdmin(companyId: number): Promise<AdminLists> {
  const notReady: AdminLists = { ready: false, promotions: [], equivalences: [], upsells: [] }
  if ((await promotionsSchemaState()) !== "ready") return notReady
  let p: unknown, e: unknown, u: unknown
  try {
    ;[p, e, u] = await Promise.all([
      db.execute(sql`SELECT * FROM "promotions" WHERE "companyId" = ${companyId} ORDER BY "priority" DESC, "id" ASC`),
      db.execute(sql`SELECT * FROM "cart_rules" WHERE "companyId" = ${companyId} ORDER BY "id" ASC`),
      db.execute(sql`SELECT * FROM "upsell_suggestions" WHERE "companyId" = ${companyId} ORDER BY "id" ASC`),
    ])
  } catch {
    resetPromotionsSchemaCache()
    return notReady
  }
  return {
    ready: true,
    // Une ligne invalide reste visible du pro (pour la corriger), jamais transmise au moteur.
    promotions: rowsOf(p).map((r) => rowToPromotion(r) ?? { id: Number(r.id), invalid: true as const, name: String(r.name ?? "") }),
    equivalences: rowsOf(e).map(rowToEquivalence).filter((x): x is EquivalenceRule => x !== null),
    upsells: rowsOf(u).map(rowToUpsell).filter((x): x is UpsellSuggestion => x !== null),
  }
}

export async function insertPromotion(companyId: number, p: Promotion): Promise<number | null> {
  if ((await promotionsSchemaState()) !== "ready") return null
  const c = promotionToColumns(p)
  const res = await db.execute(sql`
    INSERT INTO "promotions"
      ("companyId", "name", "kind", "active", "startsAt", "endsAt", "priority", "stackable", "stackableWithPromoCode", "scope", "tiers")
    VALUES
      (${companyId}, ${c.name}, ${c.kind}, ${c.active}, ${c.startsAt}, ${c.endsAt}, ${c.priority}, ${c.stackable},
       ${c.stackableWithPromoCode}, ${c.scope}::jsonb, ${c.tiers}::jsonb)
    RETURNING "id"
  `)
  return posInt(rowsOf(res)[0]?.id)
}

/**
 * Mise à jour bornée au tenant. `false` si l'offre n'existe pas pour ce tenant.
 * L'état actif n'est JAMAIS modifié ici (action dédiée) : pas de réactivation
 * involontaire si l'offre a été désactivée pendant l'édition.
 */
export async function updatePromotion(companyId: number, id: number, p: Promotion): Promise<boolean> {
  if ((await promotionsSchemaState()) !== "ready") return false
  const c = promotionToColumns(p)
  const res = await db.execute(sql`
    UPDATE "promotions" SET
      "name" = ${c.name}, "kind" = ${c.kind}, "startsAt" = ${c.startsAt}, "endsAt" = ${c.endsAt},
      "priority" = ${c.priority}, "stackable" = ${c.stackable}, "stackableWithPromoCode" = ${c.stackableWithPromoCode},
      "scope" = ${c.scope}::jsonb, "tiers" = ${c.tiers}::jsonb, "updatedAt" = now()
    WHERE "id" = ${id} AND "companyId" = ${companyId}
    RETURNING "id"
  `)
  return rowsOf(res).length === 1
}

/** Copie DÉSACTIVÉE d'une offre du même tenant. */
export async function duplicatePromotion(companyId: number, id: number): Promise<number | null> {
  if ((await promotionsSchemaState()) !== "ready") return null
  const res = await db.execute(sql`
    INSERT INTO "promotions"
      ("companyId", "name", "kind", "active", "startsAt", "endsAt", "priority", "stackable", "stackableWithPromoCode", "scope", "tiers")
    SELECT "companyId", "name" || ' (copie)', "kind", false, "startsAt", "endsAt", "priority", "stackable", "stackableWithPromoCode", "scope", "tiers"
    FROM "promotions" WHERE "id" = ${id} AND "companyId" = ${companyId}
    RETURNING "id"
  `)
  return posInt(rowsOf(res)[0]?.id)
}

type Table = "promotions" | "cart_rules" | "upsell_suggestions"
const TABLE_SQL: Record<Table, ReturnType<typeof sql.raw>> = {
  promotions: sql.raw(`"promotions"`),
  cart_rules: sql.raw(`"cart_rules"`),
  upsell_suggestions: sql.raw(`"upsell_suggestions"`),
}

export async function setActive(table: Table, companyId: number, id: number, active: boolean): Promise<boolean> {
  if ((await promotionsSchemaState()) !== "ready") return false
  const res = await db.execute(sql`
    UPDATE ${TABLE_SQL[table]} SET "active" = ${active === true}, "updatedAt" = now()
    WHERE "id" = ${id} AND "companyId" = ${companyId} RETURNING "id"
  `)
  return rowsOf(res).length === 1
}

export async function deleteRow(table: Table, companyId: number, id: number): Promise<boolean> {
  if ((await promotionsSchemaState()) !== "ready") return false
  const res = await db.execute(sql`DELETE FROM ${TABLE_SQL[table]} WHERE "id" = ${id} AND "companyId" = ${companyId} RETURNING "id"`)
  return rowsOf(res).length === 1
}

export async function insertEquivalence(companyId: number, rule: Omit<EquivalenceRule, "id">): Promise<number | null> {
  if ((await promotionsSchemaState()) !== "ready") return null
  const res = await db.execute(sql`
    INSERT INTO "cart_rules" ("companyId", "kind", "itemA", "itemB", "reason", "active")
    VALUES (${companyId}, 'equivalence', ${JSON.stringify({ type: rule.a.type, id: rule.a.id })}::jsonb,
            ${JSON.stringify({ type: rule.b.type, id: rule.b.id })}::jsonb, ${rule.reason.trim()}, false)
    RETURNING "id"
  `)
  return posInt(rowsOf(res)[0]?.id)
}

export async function insertUpsell(
  companyId: number,
  u: { whenServiceId: number; suggest: ItemRef[]; message: string | null },
): Promise<number | null> {
  if ((await promotionsSchemaState()) !== "ready") return null
  const res = await db.execute(sql`
    INSERT INTO "upsell_suggestions" ("companyId", "whenServiceId", "suggest", "message", "active")
    VALUES (${companyId}, ${u.whenServiceId}, ${JSON.stringify(u.suggest.map((i) => ({ type: i.type, id: i.id })))}::jsonb, ${u.message}, false)
    RETURNING "id"
  `)
  return posInt(rowsOf(res)[0]?.id)
}

/** Réservé au lot de branchement (détail figé sur la réservation). Borné au tenant. */
export async function setBookingPromotionSnapshot(tx: Tx, companyId: number, bookingId: number, cents: number, snapshot: unknown): Promise<void> {
  // Colonnes absentes (migration non appliquée) : rien à écrire, jamais d'échec de la réservation.
  if ((await promotionsSchemaState()) !== "ready") return
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("promotionDiscountCents invalide")
  await tx.execute(sql`
    UPDATE "bookings" SET "promotionDiscountCents" = ${cents}, "promotionSnapshot" = ${JSON.stringify(snapshot)}::jsonb
    WHERE "id" = ${bookingId} AND "companyId" = ${companyId}
  `)
}
