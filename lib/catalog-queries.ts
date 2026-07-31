import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { services } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

const defaultServiceImages: Record<string, string> = {
  "lavage-premium": "/services/lavage-premium.png",
  "renovation-carrosserie": "/services/renovation-carrosserie.png",
  "protection-ceramique": "/services/protection-ceramique.png",
  "interieur-complet": "/services/interieur-complet.png",
}

/**
 * Prestations publiques.
 * Retourne uniquement les prestations visibles de l'entreprise courante.
 */
export async function getPublicServices() {
  const companyId = await requireCompanyId()

  const rows = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.companyId, companyId),
        eq(services.visible, true),
      ),
    )
    .orderBy(asc(services.sortOrder), asc(services.id))

  return rows.map((service) => ({
    ...service,
    image:
      service.image ||
      defaultServiceImages[service.slug] ||
      "/services/default.png",
  }))
}
