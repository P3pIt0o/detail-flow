import "server-only"
import { sql } from "drizzle-orm"
import { CustomerSubscriptionError } from "./errors"
import type { Executor } from "./engine"
import type { PlanVehicleTypeView } from "./plan-groups"

/**
 * L36 — Catégorie de véhicule d'une formule (`maintenance_plans."vehicleTypeId"`).
 * Colonne ajoutée par scripts/maintenance-plans-vehicle-type-migration.sql, volontairement
 * NON déclarée dans le schéma Drizzle (sinon tout `select()` de maintenance_plans casserait
 * avant migration) : lue/écrite uniquement ici, comme lib/services/highlight-store.ts.
 * Avant migration : lecture = aucune catégorie, écriture = ignorée.
 * Toute requête est filtrée par le companyId du tenant (fourni par l'appelant serveur).
 */

// Seul le positif est mis en cache : la fonctionnalité s'active d'elle-même après migration.
let columnKnown = false

type Rows = { rows?: Record<string, unknown>[] }
const rowsOf = (res: unknown) => (res as Rows).rows ?? []

export async function planVehicleTypeColumnExists(db: Executor): Promise<boolean> {
  if (columnKnown) return true
  const res = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_plans' AND column_name = 'vehicleTypeId'
  `)
  columnKnown = rowsOf(res).length > 0
  return columnKnown
}

/** Catégories ACTIVES du tenant, dans l'ordre du pro. Vide si la colonne n'existe pas (champ masqué). */
export async function listPlanVehicleTypeOptions(db: Executor, companyId: number): Promise<{ id: number; name: string }[]> {
  if (!(await planVehicleTypeColumnExists(db))) return []
  const res = await db.execute(sql`
    SELECT "id", "name" FROM "vehicle_types"
    WHERE "companyId" = ${companyId} AND "active" = true
    ORDER BY "sortOrder" ASC, "name" ASC, "id" ASC
  `)
  return rowsOf(res).map((r) => ({ id: Number(r.id), name: String(r.name) }))
}

export async function readPlanVehicleTypeId(db: Executor, companyId: number, planId: number): Promise<number | null> {
  if (!(await planVehicleTypeColumnExists(db))) return null
  const res = await db.execute(sql`
    SELECT "vehicleTypeId" FROM "maintenance_plans" WHERE "id" = ${planId} AND "companyId" = ${companyId}
  `)
  const v = rowsOf(res)[0]?.vehicleTypeId
  return v == null ? null : Number(v)
}

const invalid = () => new CustomerSubscriptionError("INVALID_PLAN", [{ field: "vehicleTypeId", code: "INVALID_PLAN" }])

/**
 * `undefined` = inchangé, `null` = toutes catégories, entier = catégorie ACTIVE du tenant,
 * sinon INVALID_PLAN (l'appelant est dans la transaction de la formule : rien n'est écrit).
 */
export async function writePlanVehicleType(db: Executor, companyId: number, planId: number, vehicleTypeId: unknown): Promise<void> {
  if (vehicleTypeId === undefined) return
  if (vehicleTypeId !== null && !(typeof vehicleTypeId === "number" && Number.isInteger(vehicleTypeId) && vehicleTypeId > 0 && vehicleTypeId <= 2_147_483_647)) throw invalid()
  if (!(await planVehicleTypeColumnExists(db))) return
  if (vehicleTypeId !== null) {
    const owned = await db.execute(sql`
      SELECT 1 FROM "vehicle_types" WHERE "id" = ${vehicleTypeId} AND "companyId" = ${companyId} AND "active" = true
    `)
    if (!rowsOf(owned).length) throw invalid()
  }
  await db.execute(sql`
    UPDATE "maintenance_plans" SET "vehicleTypeId" = ${vehicleTypeId} WHERE "id" = ${planId} AND "companyId" = ${companyId}
  `)
}

/** Vue publique : libellé + rang (ordre du pro) des catégories ACTIVES, jamais leur id. */
export async function loadPlanVehicleTypes(db: Executor, companyId: number, planIds: number[]): Promise<Map<number, PlanVehicleTypeView>> {
  const map = new Map<number, PlanVehicleTypeView>()
  if (!planIds.length || !(await planVehicleTypeColumnExists(db))) return map
  const types = await listPlanVehicleTypeOptions(db, companyId)
  const rank = new Map(types.map((t, i) => [t.id, { label: t.name, rank: i }]))
  const res = await db.execute(sql`
    SELECT "id", "vehicleTypeId" FROM "maintenance_plans"
    WHERE "companyId" = ${companyId} AND "vehicleTypeId" IS NOT NULL
      AND "id" IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})
  `)
  for (const r of rowsOf(res)) {
    const vt = rank.get(Number(r.vehicleTypeId))
    if (vt) map.set(Number(r.id), vt)
  }
  return map
}

/** Tests uniquement : oublie le contrôle de schéma mis en cache. */
export function resetPlanVehicleTypeColumnCacheForTests(): void {
  columnKnown = false
}
