import "server-only"
import { db } from "@/lib/db"
import { bookings, bookingItems, bookingItemOptions, invoices, clients } from "@/lib/db/schema"
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
    // Chiffre d'affaires du mois = total des FACTURES PAYÉES (montant FINAL de
    // la facture : prestations/options ajoutées à la facturation incluses ;
    // l'acompte n'est pas compté deux fois car on somme le total de la facture,
    // pas booking + acompte). Recalculé depuis la facture, jamais depuis la
    // réservation d'origine. Date retenue : date de prestation, sinon émission.
    db
      .select({ total: sum(invoices.totalCents) })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, cid),
          eq(invoices.status, "paid"),
          sql`coalesce(${invoices.serviceDate}, ${invoices.issueDate}, ${invoices.createdAt}::date) >= ${start}`,
          sql`coalesce(${invoices.serviceDate}, ${invoices.issueDate}, ${invoices.createdAt}::date) <= ${end}`,
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

/**
 * Répartition du CA par mois (graphique) — sur la même base que le tableau de
 * bord : total des FACTURES PAYÉES, groupé par mois de prestation (sinon
 * émission). Cohérent avec getDashboardStats.
 */
export async function getRevenueByMonth(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const monthExpr = sql<string>`to_char(coalesce(${invoices.serviceDate}, ${invoices.issueDate}, ${invoices.createdAt}::date), 'YYYY-MM')`
  const rows = await db
    .select({
      month: monthExpr,
      total: sum(invoices.totalCents),
    })
    .from(invoices)
    .where(and(eq(invoices.companyId, cid), eq(invoices.status, "paid")))
    .groupBy(monthExpr)
    .orderBy(monthExpr)
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

/** Client fusionné pour l'affichage : carnet d'adresses + agrégat réservations. */
export type MergedClient = {
  key: string
  /** id dans la table `clients` si le client a une fiche manuelle, sinon null. */
  clientId: number | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  bookingsCount: number
  totalSpentCents: number
  lastDate: string | null
  source: "manual" | "booking" | "both"
}

function normEmail(e?: string | null): string | null {
  const v = (e ?? "").trim().toLowerCase()
  return v || null
}
function normPhone(p?: string | null): string | null {
  const v = (p ?? "").replace(/\D/g, "")
  return v || null
}

/**
 * Liste des clients de l'entreprise : fiches créées manuellement (table
 * `clients`) FUSIONNÉES avec les clients agrégés des réservations.
 * Dédoublonnage prioritaire sur l'email, sinon sur le téléphone.
 */
export async function getMergedClients(companyId?: number): Promise<MergedClient[]> {
  const cid = companyId ?? (await requireCompanyId())
  const [manual, aggregated] = await Promise.all([
    db.select().from(clients).where(eq(clients.companyId, cid)).orderBy(desc(clients.createdAt)),
    getClients(cid),
  ])

  const records: MergedClient[] = []
  const byEmail = new Map<string, MergedClient>()
  const byPhone = new Map<string, MergedClient>()

  const findExisting = (email: string | null, phone: string | null): MergedClient | null => {
    if (email && byEmail.has(email)) return byEmail.get(email)!
    if (phone && byPhone.has(phone)) return byPhone.get(phone)!
    return null
  }
  const indexRecord = (rec: MergedClient, email: string | null, phone: string | null): void => {
    if (email && !byEmail.has(email)) byEmail.set(email, rec)
    if (phone && !byPhone.has(phone)) byPhone.set(phone, rec)
  }

  // Fiches manuelles d'abord : source canonique des coordonnées (adresse/notes).
  for (const m of manual) {
    const email = normEmail(m.email)
    const phone = normPhone(m.phone)
    let rec = findExisting(email, phone)
    if (!rec) {
      rec = {
        key: `client-${m.id}`,
        clientId: m.id,
        name: m.name,
        email: m.email?.trim() || null,
        phone: m.phone?.trim() || null,
        address: m.address ?? null,
        notes: m.notes ?? null,
        bookingsCount: 0,
        totalSpentCents: 0,
        lastDate: null,
        source: "manual",
      }
      records.push(rec)
    } else {
      rec.clientId = rec.clientId ?? m.id
      rec.email = rec.email ?? (m.email?.trim() || null)
      rec.phone = rec.phone ?? (m.phone?.trim() || null)
      rec.address = rec.address ?? (m.address ?? null)
      rec.notes = rec.notes ?? (m.notes ?? null)
      rec.source = rec.source === "booking" ? "both" : rec.source
    }
    indexRecord(rec, email, phone)
  }

  // Agrégats des réservations : ajoutent les statistiques (nb résas, total, date).
  for (const a of aggregated) {
    const email = normEmail(a.email)
    const phone = normPhone(a.phone)
    let rec = findExisting(email, phone)
    if (!rec) {
      rec = {
        key: email ? `email-${email}` : phone ? `phone-${phone}` : `booking-${a.email}`,
        clientId: null,
        name: a.name,
        email: a.email?.trim() || null,
        phone: a.phone?.trim() || null,
        address: null,
        notes: null,
        bookingsCount: a.bookingsCount,
        totalSpentCents: a.totalSpentCents,
        lastDate: a.lastDate ?? null,
        source: "booking",
      }
      records.push(rec)
    } else {
      rec.name = rec.name || a.name
      rec.email = rec.email ?? (a.email?.trim() || null)
      rec.phone = rec.phone ?? (a.phone?.trim() || null)
      rec.bookingsCount += a.bookingsCount
      rec.totalSpentCents += a.totalSpentCents
      if (a.lastDate && (!rec.lastDate || a.lastDate > rec.lastDate)) rec.lastDate = a.lastDate
      rec.source = rec.source === "manual" ? "both" : rec.source
    }
    indexRecord(rec, email, phone)
  }

  records.sort((a, b) => {
    const la = a.lastDate ?? ""
    const lb = b.lastDate ?? ""
    if (la !== lb) return lb.localeCompare(la)
    return a.name.localeCompare(b.name)
  })
  return records
}
