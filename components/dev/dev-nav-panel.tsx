import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { DevNavPanelClient, type DevTenant } from "./dev-nav-panel-client"

/**
 * Point d'entrée serveur du panneau de navigation dev.
 *
 * IMPORTANT : ce composant ne doit être monté que derrière une garde
 * `process.env.NODE_ENV !== "production"` (voir app/layout.tsx). En production,
 * l'expression conditionnelle est éliminée par le bundler (dead-code
 * elimination), donc ce code et sa requête DB n'existent pas dans le build prod.
 */
export async function DevNavPanel() {
  let tenants: DevTenant[] = []
  try {
    const rows = await db
      .select({ slug: companies.slug, name: companies.name, status: companies.status })
      .from(companies)
      .orderBy(desc(companies.createdAt))
      .limit(25)
    tenants = rows
  } catch {
    // En dev sans base disponible, on affiche quand même le panneau (sans tenants).
    tenants = []
  }

  return <DevNavPanelClient tenants={tenants} />
}
