import "server-only"

/**
 * Identifiant de l'entreprise courante pour le code EXCLUSIVEMENT admin :
 * exige session + appartenance au tenant (ou super-admin) via
 * requireCompanyMember, au lieu de la seule résolution du tenant demandé
 * (requireCompanyId), réservée aux chemins publics.
 *
 * Import dynamique : évite de charger la configuration d'authentification au
 * simple import des modules de requêtes admin (tests qui passent companyId).
 */
export async function requireAdminCompanyId(): Promise<number> {
  const { requireCompanyMember } = await import("@/lib/admin")
  const { tenant } = await requireCompanyMember()
  return tenant.id
}
