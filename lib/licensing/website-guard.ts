import "server-only"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant"
import { hasFeature } from "./server"

/**
 * GARDE DU SITE VITRINE (feature `website`).
 *
 * À appeler EN TÊTE de chaque page publique appartenant au site vitrine du
 * tenant (accueil, prestations, contact, avis). Comportement :
 *
 *  - Domaine racine / hors tenant (`getCurrentTenant()` = null) : AUTORISÉ.
 *    La vitrine DetailFlow (detailflow.fr) n'est jamais bloquée.
 *  - Tenant LEGACY (licensePlan = NULL) : AUTORISÉ. `hasFeature` renvoie `true`
 *    → comportement actuel strictement inchangé, site toujours accessible.
 *  - Tenant avec licence EXPLICITE incluant `website` : AUTORISÉ.
 *  - Tenant avec licence EXPLICITE SANS `website` : `notFound()` (404).
 *    Le site payant n'est plus rendu, MAIS aucune donnée n'est supprimée :
 *    siteContent / hero / logo / couleurs / réseaux / galerie / prestations
 *    restent en base et réapparaissent tels quels si `website` est réactivé.
 *
 * NE PAS utiliser sur /reservation (online_booking), /reservation/paiement
 * (online_payments), /demande (flux devis) ni les pages légales.
 *
 * Le tenant est TOUJOURS résolu côté serveur (en-tête middleware) : aucune
 * valeur client ne peut contourner ce contrôle.
 */
export async function requireWebsiteFeature(): Promise<void> {
  const tenant = await getCurrentTenant()
  if (!tenant) return // domaine racine / vitrine DetailFlow → jamais bloqué
  const allowed = await hasFeature(tenant.id, "website")
  if (!allowed) notFound()
}
