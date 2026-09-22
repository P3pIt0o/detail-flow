import "server-only"
import { notFound } from "next/navigation"
import { getCurrentTenant, isCurrentTenantPreviewer } from "@/lib/tenant"
import { isPublicPagePublished } from "@/lib/public-page/config"
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

  // 1) Sites avec la feature `website` (offres payantes, LIFETIME, et sites
  //    personnalisés Spirit ACS / Rozan / Cleanyzer qui portent cette feature) :
  //    comportement historique EXACT, sans aucune garde de publication.
  //    → Non-régression garantie pour tous les tenants existants.
  if (await hasFeature(tenant.id, "website")) return

  // 2) DÉROGATION D'APERÇU : le propriétaire (membre du tenant) ou un
  //    super-admin peut prévisualiser sa page — brouillon inclus — depuis le
  //    configurateur. Aucun visiteur public (sans session) ni robot ne passe ici.
  if (await isCurrentTenantPreviewer(tenant.id)) return

  // 3) Tenants self-service (plan FREE) : la page publique n'est accessible au
  //    PUBLIC qu'une fois PUBLIÉE (publishedAt posé via le configurateur). Un
  //    brouillon jamais publié → 404 public (mais visible en aperçu via 2).
  //    → Rend le Cas B fonctionnel sans dépendre de la licence `website`.
  if (await isPublicPagePublished(tenant.id)) return

  notFound()
}
