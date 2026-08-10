import "server-only"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user, companyMembers } from "@/lib/db/schema"
import { and, count, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { getCurrentTenant, getTenantFromMembership, type Tenant } from "@/lib/tenant"

/**
 * Authentification + autorisation multi-tenant du dashboard.
 *
 * Règles d'isolation :
 *  - un utilisateur ne peut accéder à l'admin QUE des entreprises dont il est
 *    membre (table company_members) ;
 *  - un super-administrateur de la plateforme (`user.superAdmin`) peut accéder
 *    à toute entreprise (mode assistance) ;
 *  - les contrôles sont TOUJOURS effectués côté serveur, jamais par masquage UI.
 */

export type Role = "OWNER" | "ADMIN" | "EMPLOYEE"

export type MemberContext = {
  user: { id: string; email: string; name: string }
  tenant: Tenant
  role: Role
  isSuperAdmin: boolean
}

/** Renvoie la session courante (ou null). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/** Vrai si un compte utilisateur existe déjà (contrôle du 1er lancement). */
export async function adminExists(): Promise<boolean> {
  const rows = await db.select({ n: count() }).from(user)
  return (rows[0]?.n ?? 0) > 0
}

/** Charge le drapeau super-admin depuis la base (jamais depuis la session). */
async function isSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ superAdmin: user.superAdmin })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row?.superAdmin ?? false
}

/**
 * Garde principale de l'espace entreprise.
 * Vérifie : session + appartenance à l'entreprise courante (ou super-admin).
 * Renvoie le contexte complet (tenant, rôle, super-admin).
 *
 * @param roles  si fourni, restreint aux rôles autorisés (le super-admin passe
 *               toujours).
 */
export async function requireCompanyMember(roles?: Role[]): Promise<MemberContext> {
  const session = await getSession()
  if (!session?.user) redirect("/admin/login")

  const superAdmin = await isSuperAdmin(session.user.id)

  // Tenant EXPLICITE depuis l'hôte (sous-domaine / ?tenant=). S'il est présent,
  // l'accès est strictement limité à cette entreprise : jamais de bascule
  // silencieuse vers une autre (sécurité multi-tenant).
  const explicitTenant = await getCurrentTenant()
  const tenant = explicitTenant ?? (await getTenantFromMembership())

  // Aucun tenant : un super-admin sans entreprise est renvoyé vers la console
  // plateforme ; sinon 404 neutre.
  if (!tenant) {
    if (superAdmin) redirect("/super-admin")
    notFound()
  }

  const effectiveTenant = tenant
  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, session.user.id),
        eq(companyMembers.companyId, effectiveTenant.id),
      ),
    )
    .limit(1)

  // Ni membre de cette entreprise, ni super-admin → 404 neutre (ne révèle rien).
  // Aucun repli vers une autre entreprise : un tenant explicite dont
  // l'utilisateur n'est pas membre doit toujours être refusé.
  if (!membership && !superAdmin) notFound()

  const role: Role = (membership?.role as Role) ?? "OWNER" // super-admin => OWNER virtuel

  if (roles && !superAdmin && !roles.includes(role)) notFound()

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    tenant: effectiveTenant,
    role,
    isSuperAdmin: superAdmin,
  }
}

/**
 * Protège une page/action du dashboard entreprise.
 * Rétro-compatible : renvoie l'utilisateur connecté (comme avant), mais applique
 * désormais l'isolation par entreprise.
 */
export async function requireAdmin() {
  const ctx = await requireCompanyMember()
  return ctx.user
}

/** Restreint aux rôles donnés (ex. OWNER pour la gestion des membres/domaines). */
export async function requireCompanyRole(roles: Role[]) {
  return requireCompanyMember(roles)
}

/**
 * Variante NON bloquante de requireCompanyMember, destinée aux Route Handlers
 * (qui doivent renvoyer un JSON plutôt que de lever redirect()/notFound()).
 * Renvoie le contexte membre, ou `null` si non authentifié / non membre /
 * hors contexte tenant.
 */
export async function getCompanyMemberContext(): Promise<MemberContext | null> {
  const session = await getSession()
  if (!session?.user) return null

  // Tenant EXPLICITE depuis l'hôte, sinon repli sur l'appartenance (domaine
  // racine). Aucune bascule silencieuse si un tenant explicite est refusé.
  const explicitTenant = await getCurrentTenant()
  const tenant = explicitTenant ?? (await getTenantFromMembership())
  if (!tenant) return null

  const superAdmin = await isSuperAdmin(session.user.id)
  const effectiveTenant = tenant
  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, session.user.id),
        eq(companyMembers.companyId, effectiveTenant.id),
      ),
    )
    .limit(1)

  if (!membership && !superAdmin) return null

  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    tenant: effectiveTenant,
    role: (membership?.role as Role) ?? "OWNER",
    isSuperAdmin: superAdmin,
  }
}

/**
 * Amorçage du premier super-admin : si l'email connecté figure dans
 * SUPER_ADMIN_EMAILS (liste séparée par des virgules) et que le drapeau n'est
 * pas encore posé, on le promeut automatiquement. Permet d'ouvrir l'espace
 * plateforme sans intervention SQL manuelle.
 */
async function bootstrapSuperAdminIfNeeded(userId: string, email: string): Promise<boolean> {
  const allowlist = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowlist.includes(email.trim().toLowerCase())) return false

  await db.update(user).set({ superAdmin: true, updatedAt: new Date() }).where(eq(user.id, userId))
  return true
}

/** Protège les routes de super-administration de la plateforme. */
export async function requireSuperAdmin() {
  const session = await getSession()
  if (!session?.user) redirect("/admin/login")
  let superAdmin = await isSuperAdmin(session.user.id)
  if (!superAdmin) {
    // Tentative d'amorçage via allowlist d'emails (variable d'environnement).
    superAdmin = await bootstrapSuperAdminIfNeeded(session.user.id, session.user.email)
  }
  if (!superAdmin) notFound()
  return session.user
}

/** Ré-export pratique pour les pages admin. */
export { getCurrentTenant, requireTenant } from "@/lib/tenant"
