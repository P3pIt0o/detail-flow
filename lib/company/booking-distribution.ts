import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { isBookingDistributionMode, type BookingDistributionMode } from "@/lib/admin/primary-action"

/**
 * `companies.bookingDistributionMode`, TOLÉRANT à l'absence de migration
 * (scripts/booking-distribution-mode-migration.sql). Volontairement absent du
 * schéma Drizzle : sinon chaque `select()` de `companies` casserait (42703)
 * tant que la migration n'est pas appliquée. Avant migration → null (historique).
 */

let columnCache: { value: boolean; at: number } | null = null
const NEGATIVE_TTL_MS = 30_000

export async function bookingDistributionColumnExists(): Promise<boolean> {
  const now = Date.now()
  if (columnCache && (columnCache.value || now - columnCache.at < NEGATIVE_TTL_MS)) return columnCache.value
  try {
    const res = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'companies' AND column_name = 'bookingDistributionMode'
    `)
    const value = (((res as unknown as { rows?: unknown[] }).rows ?? []).length) > 0
    columnCache = { value, at: now }
    return value
  } catch {
    columnCache = { value: false, at: now }
    return false
  }
}

/** Mode du tenant (id résolu côté serveur). null si absent / avant migration. */
export async function getBookingDistributionMode(companyId: number): Promise<BookingDistributionMode | null> {
  if (!(await bookingDistributionColumnExists())) return null
  const res = await db.execute(sql`
    SELECT "bookingDistributionMode" AS mode FROM companies WHERE id = ${companyId} LIMIT 1
  `)
  const row = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? [])[0]
  return isBookingDistributionMode(row?.mode) ? row.mode : null
}
