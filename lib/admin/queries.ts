import "server-only"
import { db } from "@/lib/db"
import { bookings, bookingItems, bookingItemOptions } from "@/lib/db/schema"
import { and, count, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm"
import { requireCompanyId } from "@/lib/tenant"

/**
 * Lectures du dashboard administrateur — ISOLÉES PAR ENTREPRISE.
 * Chaque fonction accepte un `companyId` optionnel (résolu depuis le contexte
 * sinon). Toutes les requêtes filtrent sur `bookings.companyId`.
 */

/** Statuts considérés comme "actifs" (comptent dans le CA / planning). */
const REVENUE_STATUSES = ["confirmed", "completed"]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function monthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

/** Indicateurs clés du tableau de bord. */
export async function getDashboardStats(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const today = todayISO()
  const { start, end } = monthRange()

  const [upcoming, pending, monthRevenue, monthCount, totalClients] = await Promise.all([
    // Réservations à venir (confirmées, à partir d'aujourd'hui)
    db
      .select({ n: count() })
      .from(bookings)
      .where(
        and(eq(bookings.companyId, cid), gte(bookings.date, today), inArray(bookings.status, REVENUE_STATUSES)),
      ),
    // En attente d'acompte
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.companyId, cid), eq(bookings.status, "pending_deposit"))),
    // Chiffre d'affaires du mois (confirmées + terminées)
    db
      .select({ total: sum(bookings.totalCents) })
      .from(bookings)
      .where(
        and(
          eq(bookings.companyId, cid),
          gte(bookings.date, start),
          lte(bookings.date, end),
          inArray(bookings.status, REVENUE_STATUSES),
        ),
      ),
    // Nombre de réservations du mois
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.companyId, cid), gte(bookings.date, start), lte(bookings.date, end))),
    // Clients uniques (par email)
    db
      .select({ n: sql<number>`count(distinct ${bookings.customerEmail})` })
      .from(bookings)
      .where(eq(bookings.companyId, cid)),
  ])

  return {
    upcomingCount: upcoming[0]?.n ?? 0,
    pendingCount: pending[0]?.n ?? 0,
    monthRevenueCents: Number(monthRevenue[0]?.total ?? 0),
    monthBookingsCount: monthCount[0]?.n ?? 0,
    totalClients: Number(totalClients[0]?.n ?? 0),
  }
}

/** Prochaines réservations (pour l'aperçu du tableau de bord). */
export async function getUpcomingBookings(limit = 6, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const today = todayISO()
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.companyId, cid), gte(bookings.date, today)))
    .orderBy(bookings.date, bookings.startTime)
    .limit(limit)
}

/** Répartition du CA des 6 derniers mois (pour un graphique). */
export async function getRevenueByMonth(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({
      month: sql<string>`to_char(${bookings.date}::date, 'YYYY-MM')`,
      total: sum(bookings.totalCents),
    })
    .from(bookings)
    .where(and(eq(bookings.companyId, cid), inArray(bookings.status, REVENUE_STATUSES)))
    .groupBy(sql`to_char(${bookings.date}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${bookings.date}::date, 'YYYY-MM')`)
  return rows.map((r) => ({ month: r.month, totalCents: Number(r.total ?? 0) }))
}

/**
 * Réservations d'une plage de dates (pour le calendrier), avec le nombre de
 * véhicules par réservation.
 */
export async function getBookingsBetween(startDate: string, endDate: string, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      customerName: bookings.customerName,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      totalCents: bookings.totalCents,
      totalDurationMin: bookings.totalDurationMin,
    })
    .from(bookings)
    .where(and(eq(bookings.companyId, cid), gte(bookings.date, startDate), lte(bookings.date, endDate)))
    .orderBy(bookings.date, bookings.startTime)

  if (rows.length === 0) return []

  // Nombre de véhicules (lignes) par réservation, en une seule requête groupée.
  const ids = rows.map((r) => r.id)
  const counts = await db
    .select({ bookingId: bookingItems.bookingId, n: count() })
    .from(bookingItems)
    .where(inArray(bookingItems.bookingId, ids))
    .groupBy(bookingItems.bookingId)

  const countMap = new Map(counts.map((c) => [c.bookingId, Number(c.n)]))
  return rows.map((r) => ({ ...r, vehicles: countMap.get(r.id) ?? 1 }))
}

/** Toutes les réservations (liste admin), triées par date de création. */
export async function getAllBookings(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.companyId, cid))
    .orderBy(desc(bookings.createdAt))
}

/** Détail complet d'une réservation (avec lignes + options), scopé entreprise. */
export async function getBookingDetail(id: number, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.companyId, cid)))
    .limit(1)
  if (!rows.length) return null
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, id))
  const itemIds = items.map((i) => i.id)
  const options = itemIds.length
    ? await db
        .select()
        .from(bookingItemOptions)
        .where(inArray(bookingItemOptions.bookingItemId, itemIds))
    : []
  const itemsWithOptions = items.map((it) => ({
    ...it,
    options: options.filter((o) => o.bookingItemId === it.id),
  }))
  return { booking: rows[0], items: itemsWithOptions }
}

/** Clients agrégés par email (avec total dépensé et nombre de réservations). */
export async function getClients(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({
      email: bookings.customerEmail,
      name: sql<string>`max(${bookings.customerName})`,
      phone: sql<string>`max(${bookings.customerPhone})`,
      bookingsCount: count(),
      totalSpent: sum(bookings.totalCents),
      lastDate: sql<string>`max(${bookings.date})`,
    })
    .from(bookings)
    .where(eq(bookings.companyId, cid))
    .groupBy(bookings.customerEmail)
    .orderBy(desc(sql`max(${bookings.date})`))
  return rows.map((r) => ({
    ...r,
    totalSpentCents: Number(r.totalSpent ?? 0),
  }))
}
