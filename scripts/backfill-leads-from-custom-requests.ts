/**
 * BACKFILL — Demandes personnalisées historiques → prospects CRM.
 *
 * ADDITIF & IDEMPOTENT :
 *  - ne crée que les prospects manquants (idempotence garantie par
 *    upsertLeadFromExternalSource + UNIQUE(companyId, source, sourceExternalId)) ;
 *  - deux exécutions donnent le même résultat, aucune duplication ;
 *  - ne supprime / ne modifie AUCUNE custom_request, ni statut, ni token,
 *    ni réservation, ni facture ;
 *  - FEATURE-AWARE : ne traite que les entreprises ayant `leads_crm` actif
 *    (canUseFeature), pour ne pas faire tourner de synchro inutile.
 *
 * Exécution :
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *     -r ts-node/register scripts/backfill-leads-from-custom-requests.ts
 * (ou via l'outil de scripts du projet).
 *
 * Journaux : uniquement des identifiants techniques (companyId, requestId,
 * compteurs) — jamais d'email / téléphone / note en clair.
 */

import { db } from "@/lib/db"
import { companies, customRequests } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { canUseFeature } from "@/lib/licensing/enforce"
import { syncLeadFromCustomRequest } from "@/lib/leads/server"

async function main() {
  const allCompanies = await db.select({ id: companies.id }).from(companies)
  let companiesProcessed = 0
  let requestsSynced = 0
  let companiesSkipped = 0

  for (const c of allCompanies) {
    const enabled = await canUseFeature(c.id, "leads_crm")
    if (!enabled) {
      companiesSkipped += 1
      continue
    }
    companiesProcessed += 1

    const requests = await db
      .select()
      .from(customRequests)
      .where(eq(customRequests.companyId, c.id))

    for (const r of requests) {
      await syncLeadFromCustomRequest({
        companyId: c.id,
        requestId: r.id,
        status: r.status,
        hasBooking: r.bookingId != null,
        bookingId: r.bookingId ?? null,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        vehicleType: r.vehicleType,
        vehicleBrand: r.vehicleBrand,
        vehicleModel: r.vehicleModel,
        typeLabel: r.typeLabel,
      })
      requestsSynced += 1
    }
  }

  console.log("[v0] backfill leads terminé", {
    companiesProcessed,
    companiesSkipped,
    requestsSynced,
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[v0] backfill leads: échec", err instanceof Error ? err.message : err)
    process.exit(1)
  })
