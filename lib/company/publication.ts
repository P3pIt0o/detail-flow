import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { DEFAULT_PUBLICATION_FLAGS, toPublicationFlags, type PublicationFlags } from "./publication-shared"

/**
 * Drapeaux de publication par entreprise, TOLÉRANTS à l'absence de migration
 * (scripts/booking-link-publication-migration.sql). Les colonnes ne sont pas
 * déclarées dans le schéma Drizzle : sinon chaque `select()` de `companies`
 * casserait (42703) tant que la migration n'est pas appliquée.
 * Avant migration : site personnalisé publié (historique), lien /book FERMÉ.
 */

let columnsCache: { value: boolean; at: number } | null = null
const NEGATIVE_TTL_MS = 30_000

export async function publicationColumnsExist(): Promise<boolean> {
  const now = Date.now()
  if (columnsCache && (columnsCache.value || now - columnsCache.at < NEGATIVE_TTL_MS)) return columnsCache.value
  try {
    const res = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'companies'
        AND column_name IN ('customSitePublished', 'bookingLinkEnabled')
    `)
    const rows = (res as unknown as { rows?: unknown[] }).rows ?? []
    const value = rows.length >= 2
    columnsCache = { value, at: now }
    return value
  } catch {
    columnsCache = { value: false, at: now }
    return false
  }
}

export async function getPublicationFlags(companyId: number): Promise<PublicationFlags> {
  if (!(await publicationColumnsExist())) return { ...DEFAULT_PUBLICATION_FLAGS }
  const res = await db.execute(sql`
    SELECT "customSitePublished", "bookingLinkEnabled" FROM companies WHERE id = ${companyId} LIMIT 1
  `)
  const rows = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? [])
  return toPublicationFlags(rows[0])
}

export async function getPublicationFlagsMap(companyIds: number[]): Promise<Map<number, PublicationFlags>> {
  const map = new Map<number, PublicationFlags>()
  const ids = companyIds.filter((id) => Number.isInteger(id) && id > 0)
  if (ids.length === 0) return map
  if (!(await publicationColumnsExist())) {
    for (const id of ids) map.set(id, { ...DEFAULT_PUBLICATION_FLAGS })
    return map
  }
  const res = await db.execute(sql`
    SELECT id, "customSitePublished", "bookingLinkEnabled" FROM companies
    WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `)
  for (const row of ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? [])) {
    map.set(Number(row.id), toPublicationFlags(row))
  }
  for (const id of ids) if (!map.has(id)) map.set(id, { ...DEFAULT_PUBLICATION_FLAGS })
  return map
}

export type PublicationFlagKey = keyof PublicationFlags

/** Écriture ciblée (super-admin). Renvoie false si la migration n'est pas appliquée. */
export async function setPublicationFlag(companyId: number, key: PublicationFlagKey, value: boolean): Promise<boolean> {
  if (!(await publicationColumnsExist())) return false
  if (key === "customSitePublished") {
    await db.execute(sql`UPDATE companies SET "customSitePublished" = ${value}, "updatedAt" = now() WHERE id = ${companyId}`)
  } else {
    await db.execute(sql`UPDATE companies SET "bookingLinkEnabled" = ${value}, "updatedAt" = now() WHERE id = ${companyId}`)
  }
  return true
}
