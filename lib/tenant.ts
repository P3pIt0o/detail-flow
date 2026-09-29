import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { companies, companyMembers, user } from "@/lib/db/schema"

export type Tenant = typeof companies.$inferSelect

/**
 * Résout l'entreprise (tenant) courante à partir de l'en-tête `x-tenant-slug`
 * posé par le middleware. Lecture DB réelle + contrôle du statut.
 *
 * - Renvoie `null` si aucun slug (domaine racine / vitrine) ou entreprise
 *   introuvable ou ARCHIVED (comme si elle n'existait pas).
 * - Renvoie l'entreprise même si SUSPENDED : c'est à l'appelant d'adapter
 *   l'affichage (page « suspendu », blocage des réservations).
 *
 * Mémoïsé par requête via `cache()` : une seule requête DB par rendu.
 */
export const getCurrentTenant = cache(async (): Promise<Tenant | null> => {
  const h = await headers()
  const slug = h.get("x-tenant-slug")?.trim()
  if (!slug) return null

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)

  if (!company) return null
  if (company.status === "ARCHIVED") return null
  return company
})

/**
 * Résout l'entreprise à partir de l'APPARTENANCE de l'utilisateur connecté,
 * quand l'hôte ne fournit pas de tenant (domaine racine `detailflow.fr/admin`,
 * ou aperçu ayant perdu `?tenant=` lors d'une navigation client).
 *
 * Sûr pour les flux publics : un visiteur anonyme n'a pas de session → renvoie
 * `null` (aucun repli). En production, les sites publics passent toujours par
 * un sous-domaine (en-tête présent) → ce repli ne s'active jamais pour eux.
 *
 * En cas d'appartenances multiples, prend la plus ancienne (déterministe).
 * Mémoïsé par requête.
 */
export const getTenantFromMembership = cache(async (): Promise<Tenant | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const rows = await db
    .select({ company: companies })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(eq(companyMembers.userId, session.user.id))
    .orderBy(asc(companies.createdAt))
    .limit(1)

  const c = rows[0]?.company
  if (!c || c.status === "ARCHIVED") return null
  return c
})

/**
 * Tenant effectif pour une requête admin/authentifiée : l'hôte d'abord
 * (sous-domaine / ?tenant=), sinon l'appartenance de l'utilisateur connecté.
 */
export async function resolveRequestTenant(): Promise<Tenant | null> {
  return (await getCurrentTenant()) ?? (await getTenantFromMembership())
}

/**
 * APERÇU AUTHENTIFIÉ : la requête courante appartient-elle à quelqu'un
 * autorisé à PRÉVISUALISER la page publique de CE tenant ?
 *
 * Vrai UNIQUEMENT si une session Better Auth existe ET que l'utilisateur est
 * soit membre de l'entreprise `tenantId` (table company_members, scoping
 * strict), soit super-administrateur plateforme. Un visiteur public (aucune
 * session) ou un membre d'un AUTRE tenant renvoie toujours `false` → aucune
 * fuite cross-tenant, et les robots d'indexation (sans session) sont exclus.
 *
 * Sert de dérogation d'APERÇU aux gardes publiques (feature `website`,
 * brouillon non publié) : le propriétaire voit sa page dans le configurateur
 * même si elle n'est pas encore active/publiée, sans jamais la rendre publique.
 *
 * Ne lève jamais : conçu pour être appelé dans le chemin de rendu public.
 * Mémoïsé par requête.
 */
export const isCurrentTenantPreviewer = cache(async (tenantId: number): Promise<boolean> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    const uid = session?.user?.id
    if (!uid) return false

    const [membership] = await db
      .select({ userId: companyMembers.userId })
      .from(companyMembers)
      .where(and(eq(companyMembers.userId, uid), eq(companyMembers.companyId, tenantId)))
      .limit(1)
    if (membership) return true

    const [row] = await db
      .select({ superAdmin: user.superAdmin })
      .from(user)
      .where(eq(user.id, uid))
      .limit(1)
    return row?.superAdmin ?? false
  } catch {
    // Toute erreur (session absente, table indisponible) → pas d'aperçu.
    return false
  }
})

/** Comme getCurrentTenant mais renvoie une 404 si aucune entreprise. */
export async function requireTenant(): Promise<Tenant> {
  const tenant = await getCurrentTenant()
  if (!tenant) notFound()
  return tenant
}

/**
 * Identifiant de l'entreprise courante — brique de base de l'isolation des
 * données. Toute requête métier scoping tenant DOIT filtrer par cet id.
 * Lève une 404 si le contexte n'a pas de tenant.
 */
export async function requireCompanyId(): Promise<number> {
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()
  return tenant.id
}

/**
 * Identifiant de l'entreprise courante ou `null` si aucun contexte tenant.
 * Variante non-bloquante de requireCompanyId (ne lève pas de 404) : utile pour
 * les lectures qui doivent se dégrader proprement hors contexte tenant
 * (ex. envoi d'email d'auth, valeurs par défaut).
 */
export async function getCompanyIdOrNull(): Promise<number | null> {
  const tenant = await resolveRequestTenant()
  return tenant?.id ?? null
}

/** Vrai si l'entreprise accepte de nouvelles réservations en ligne. */
export function tenantAcceptsBookings(tenant: Tenant): boolean {
  if (tenant.status === "SUSPENDED" || tenant.status === "ARCHIVED") return false
  return tenant.bookingMode !== "DISABLED"
}
