import "server-only"
import { and, eq, max } from "drizzle-orm"
import { db } from "@/lib/db"
import { services } from "@/lib/db/schema"

/**
 * Ordre des prestations (`services.sortOrder`), toujours borné à UNE entreprise.
 * `companyId` doit venir de la session admin, jamais du navigateur.
 */

/** Rang d'une nouvelle prestation : après toutes celles de l'entreprise. */
export async function nextServiceSortOrder(companyId: number): Promise<number> {
  const [row] = await db
    .select({ value: max(services.sortOrder) })
    .from(services)
    .where(eq(services.companyId, companyId))
  return (row?.value ?? 0) + 1
}

/**
 * Applique `sortOrder` = position dans `orderedIds`, en une transaction.
 * La liste doit contenir EXACTEMENT les prestations de l'entreprise (masquées
 * comprises) : id étranger, doublon ou liste périmée → `false`, rien n'est écrit.
 */
export async function reorderCompanyServices(
  companyId: number,
  orderedIds: number[],
): Promise<boolean> {
  if (!Array.isArray(orderedIds) || !orderedIds.every(Number.isInteger)) return false
  const unique = new Set(orderedIds)
  if (unique.size !== orderedIds.length) return false

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.companyId, companyId))
      .for("update")

    if (rows.length !== unique.size || !rows.every((r) => unique.has(r.id))) return false

    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(services)
        .set({ sortOrder: index + 1 })
        .where(and(eq(services.id, id), eq(services.companyId, companyId)))
    }
    return true
  })
}
