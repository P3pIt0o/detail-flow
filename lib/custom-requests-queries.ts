import "server-only"

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customRequests } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

export type CustomRequestRow = typeof customRequests.$inferSelect

/**
 * Liste des demandes personnalisées de l'ENTREPRISE COURANTE uniquement.
 * Isolation : filtre systématique sur companyId résolu côté serveur.
 */
export async function listCustomRequests(companyId?: number): Promise<CustomRequestRow[]> {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(customRequests)
    .where(eq(customRequests.companyId, cid))
    .orderBy(desc(customRequests.createdAt))
}

/**
 * Une demande par id, STRICTEMENT limitée à l'entreprise courante.
 * Renvoie null si l'id appartient à une autre entreprise (jamais de fuite).
 */
export async function getCustomRequestById(
  id: number,
  companyId?: number,
): Promise<CustomRequestRow | null> {
  const cid = companyId ?? (await requireCompanyId())
  const [row] = await db
    .select()
    .from(customRequests)
    .where(and(eq(customRequests.id, id), eq(customRequests.companyId, cid)))
    .limit(1)
  return row ?? null
}

/** Compteur de demandes « à traiter » (nouvelles) pour un badge éventuel. */
export async function countNewCustomRequests(companyId?: number): Promise<number> {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({ id: customRequests.id })
    .from(customRequests)
    .where(and(eq(customRequests.companyId, cid), eq(customRequests.status, "new")))
  return rows.length
}
