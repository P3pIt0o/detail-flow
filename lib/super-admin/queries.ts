import "server-only"
import { db } from "@/lib/db"
import { companies, companyMembers, bookings, user as userTable } from "@/lib/db/schema"
import { and, count, desc, eq, sql } from "drizzle-orm"

/* -------------------------------------------------------------------------- */
/*  Lectures de super-administration (plateforme DetailFlow).                  */
/*  Ces requêtes sont volontairement GLOBALES : elles ne sont accessibles      */
/*  qu'après requireSuperAdmin() côté page/action.                             */
/* -------------------------------------------------------------------------- */

export type CompanyRow = {
  id: number
  name: string
  slug: string
  status: string
  betaEndsAt: Date | null
  bookingMode: string
  createdAt: Date
  ownerEmail: string | null
  memberCount: number
  bookingCount: number
}

/** Liste toutes les entreprises avec quelques compteurs utiles. */
export async function listCompanies(): Promise<CompanyRow[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      status: companies.status,
      betaEndsAt: companies.betaEndsAt,
      bookingMode: companies.bookingMode,
      createdAt: companies.createdAt,
      ownerEmail: companies.email,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM ${companyMembers} m WHERE m."companyId" = ${companies.id}
      )`,
      bookingCount: sql<number>`(
        SELECT COUNT(*) FROM ${bookings} b WHERE b."companyId" = ${companies.id}
      )`,
    })
    .from(companies)
    .orderBy(desc(companies.createdAt))

  return rows.map((r) => ({
    ...r,
    memberCount: Number(r.memberCount),
    bookingCount: Number(r.bookingCount),
  }))
}

export type PlatformStats = {
  total: number
  beta: number
  active: number
  suspended: number
  archived: number
  betaExpired: number
  totalBookings: number
}

/** Statistiques agrégées de la plateforme (tableau de bord super-admin). */
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date()
  const [row] = await db
    .select({
      total: count(),
      beta: sql<number>`COUNT(*) FILTER (WHERE ${companies.status} = 'BETA')`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${companies.status} = 'ACTIVE')`,
      suspended: sql<number>`COUNT(*) FILTER (WHERE ${companies.status} = 'SUSPENDED')`,
      archived: sql<number>`COUNT(*) FILTER (WHERE ${companies.status} = 'ARCHIVED')`,
      betaExpired: sql<number>`COUNT(*) FILTER (WHERE ${companies.status} = 'BETA' AND ${companies.betaEndsAt} IS NOT NULL AND ${companies.betaEndsAt} < ${now})`,
    })
    .from(companies)

  const [bk] = await db.select({ n: count() }).from(bookings)

  return {
    total: Number(row?.total ?? 0),
    beta: Number(row?.beta ?? 0),
    active: Number(row?.active ?? 0),
    suspended: Number(row?.suspended ?? 0),
    archived: Number(row?.archived ?? 0),
    betaExpired: Number(row?.betaExpired ?? 0),
    totalBookings: Number(bk?.n ?? 0),
  }
}

/** Détail d'une entreprise + ses membres (pour la fiche super-admin). */
export async function getCompanyDetail(companyId: number) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) return null

  const members = await db
    .select({
      userId: companyMembers.userId,
      role: companyMembers.role,
      name: userTable.name,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
    })
    .from(companyMembers)
    .innerJoin(userTable, eq(userTable.id, companyMembers.userId))
    .where(eq(companyMembers.companyId, companyId))

  const [demo] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.companyId, companyId), eq(bookings.isDemoData, true)))

  return { company, members, demoBookingCount: Number(demo?.n ?? 0) }
}
