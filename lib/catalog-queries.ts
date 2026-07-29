import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { services } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

/**
 * Prestations publiques.
 * Retourne uniquement les prestations visibles de l'entreprise courante.
 */
export async function getPublicServices() {
  const companyId = await requireCompanyId()

  return db
    .select()
    .from(services)
    .where(
      and(
        eq(services.companyId, companyId),
        eq(services.visible, true),
      ),
    )
    .orderBy(asc(services.sortOrder), asc(services.id))
}
