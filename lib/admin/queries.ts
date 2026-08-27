import "server-only"
import { db } from "@/lib/db"
import { bookings, bookingItems, bookingItemOptions, invoices, clients, productPurchases } from "@/lib/db/schema"
import { and, count, desc, eq, gte, inArray, lte, sql, sum } from "drizzle-orm"
import { requireCompanyId } from "@/lib/tenant"

/**
 * Lectures du dashboard administrateur — ISOLÉES PAR ENTREPRISE.
 * Chaque fonction accepte un `companyId` optionnel (résolu depuis le contexte
 * sinon). Toutes les requêtes filtrent sur `bookings.companyId`.
 */

/** Statuts considérés comme "actifs" (comptent dans le CA / planning). */
const REVENUE_STATUSES = ["confirmed", "completed"]

/**
 * CA NET : une facture payée compte en positif, un avoir ÉMIS (ou payé/
 * remboursé) compte en NÉGATIF. Les brouillons d'avoir (status 'draft') n'ont
 * aucun impact. Montants stockés positifs ; le signe est appliqué au calcul.
 */
const netRevenueSumExpr = sql<string>`sum(case when ${invoices.documentType} = 'credit_note' then -${invoices.totalCents} else ${invoices.totalCents} end)`

/**
 * Sous-requête : un avoir n'est déductible du CA net que si sa facture d'ORIGINE
 * entrait elle-même dans le CA payé — c'est-à-dire une facture 'paid', du même
 * tenant, dont la réservation liée n'a pas été annulée/supprimée. On ne déduit
 * donc jamais un avoir rattaché à une facture qui n'a jamais compté (ex. facture
 * annulée puis créditée). Scopée companyId : isolation multi-tenant préservée.
 */
function creditNoteOriginalCountedInRevenue(companyId: number) {
  return sql`exists (
    select 1 from ${invoices} orig
    where orig.id = ${invoices.originalInvoiceId}
      and orig."companyId" = ${companyId}
      and orig."documentType" = 'invoice'
      and orig.status = 'paid'
      and (
        orig."bookingId" is null
        or exists (
          select 1 from ${bookings} b
          where b.id = orig."bookingId"
            and b."companyId" = ${companyId}
            and b.status <> 'cancelled'
        )
      )
  )`
}

/**
 * Documents entrant dans le CA net :
 *  - factures 'paid' (positif) ;
 *  - avoirs 'issued'/'paid' (négatif) UNIQUEMENT si leur facture d'origine
 *    comptait dans le CA payé.
 */
function revenueDocumentFilter(companyId: number) {
  return sql`(
    (${invoices.documentType} = 'invoice' and ${invoices.status} = 'paid')
    or (
      ${invoices.documentType} = 'credit_note'
      and ${invoices.status} in ('issued', 'paid')
      and ${creditNoteOriginalCountedInRevenue(companyId)}
    )
  )`
}

/**
 * Date retenue pour l'affectation mensuelle :
 *  - facture : date de prestation, sinon émission, sinon création ;
 *  - AVOIR   : sa propre date d'ÉMISSION (issueDate), sinon création. Un avoir
 *    n'a pas de date de prestation ; sa déduction tombe le mois où il est émis.
 */
const revenuePeriodDateExpr = sql`(
  case when ${invoices.documentType} = 'credit_note'
    then coalesce(${invoices.issueDate}, ${invoices.createdAt}::date)
    else coalesce(${invoices.serviceDate}, ${invoices.issueDate}, ${invoices.createdAt}::date)
  end
)`

/**
 * Filtre CA : exclut une facture PAYÉE dès lors qu'elle est rattachée à une
 * réservation (invoices.bookingId non nul) qui a été soit ANNULÉE
 * (status = 'cancelled'), soit SUPPRIMÉE (la réservation n'existe plus).
 *
 * Les factures sans réservation liée (bookingId NULL — factures créées à la
 * main) continuent de compter normalement. La sous-requête est scopée par
 * companyId : l'isolation multi-tenant est préservée (aucune donnée d'un autre
 * tenant n'entre dans le calcul). Ne modifie AUCUNE facture, uniquement la
 * lecture du CA.
 */
function excludeCancelledOrDeletedBooking(companyId: number) {
  return sql`(
    ${invoices.bookingId} is null
    or exists (
      select 1 from ${bookings} b
      where b.id = ${invoices.bookingId}
        and b."companyId" = ${companyId}
        and b.status <> 'cancelled'
    )
  )`
}

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

  const [upcoming, pending, monthRevenue, monthCount, totalClients, monthProducts] = await Promise.all([
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
      .select({ total: netRevenueSumExpr })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, cid),
          revenueDocumentFilter(cid),
          sql`${revenuePeriodDateExpr} >= ${start}`,
          sql`${revenuePeriodDateExpr} <= ${end}`,
          excludeCancelledOrDeletedBooking(cid),
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
    // Achats de produits/consommables du mois (même période que le CA).
    // Montant par achat = priceCents * quantity (ex. 20€ x 3 = 60€ de charges).
    db
      .select({ total: sum(sql`${productPurchases.priceCents} * ${productPurchases.quantity}`) })
      .from(productPurchases)
      .where(
        and(
          eq(productPurchases.companyId, cid),
          gte(productPurchases.purchaseDate, start),
          lte(productPurchases.purchaseDate, end),
        ),
      ),
  ])

  const monthRevenueCents = Number(monthRevenue[0]?.total ?? 0)
  const monthProductsCents = Number(monthProducts[0]?.total ?? 0)

  return {
    upcomingCount: upcoming[0]?.n ?? 0,
    pendingCount: pending[0]?.n ?? 0,
    monthRevenueCents,
    monthBookingsCount: monthCount[0]?.n ?? 0,
    totalClients: Number(totalClients[0]?.n ?? 0),
    // Charges produits/consommables + résultat estimé (CA - achats). Ne modifie
    // pas le calcul du CA lui-même, qui reste basé sur les factures payées.
    monthProductsCents,
    monthResultCents: monthRevenueCents - monthProductsCents,
  }
}

/**
 * Compteur OPÉRATIONNEL : réservations en attente d'acompte.
 *
 * Isolé de `getDashboardStats` car il alimente une ALERTE d'action (bloc « À
 * surveiller ») et non une statistique métier premium : il doit rester
 * disponible même quand la feature `business_stats` n'est pas incluse. Scopé par
 * companyId (isolation multi-tenant), requête paramétrée Drizzle.
 */
export async function getPendingDepositCount(companyId?: number): Promise<number> {
  const cid = companyId ?? (await requireCompanyId())
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
  .where(and(eq(bookings.companyId, cid), eq(bookings.status, "pending_deposit")))
  return row?.n ?? 0
  }

  /**
   * Nombre TOTAL de réservations (tous statuts) de l'entreprise. Léger (COUNT),
   * utilisé par l'onboarding pour cocher « parcours de réservation testé ».
   */
  export async function getBookingCount(companyId?: number): Promise<number> {
  const cid = companyId ?? (await requireCompanyId())
  const [row] = await db
  .select({ n: count() })
  .from(bookings)
  .where(eq(bookings.companyId, cid))
  return row?.n ?? 0
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

/** Prochain rendez-vous enrichi (prestations + véhicules), multi-items compatible. */
export type UpcomingBookingDetailed = {
  id: number
  reference: string
  customerName: string
  date: string
  startTime: string
  status: string
  totalCents: number
  /** Prestations distinctes (snapshot serviceName), toutes lignes confondues. */
  services: string[]
  /** Véhicules distincts (marque/modèle si renseignés), ordre d'apparition. */
  vehicles: string[]
}

/**
 * Prochains rendez-vous pour le cockpit : à partir d'aujourd'hui, confirmés ou
 * en attente d'acompte, avec la liste des prestations et des véhicules.
 * Une réservation = 1 rendez-vous, mais N lignes (véhicules × prestations) :
 * on ne suppose JAMAIS une seule prestation. Deux requêtes seulement.
 */
export async function getUpcomingBookingsDetailed(
  limit = 5,
  companyId?: number,
): Promise<UpcomingBookingDetailed[]> {
  const cid = companyId ?? (await requireCompanyId())
  const today = todayISO()
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      customerName: bookings.customerName,
      date: bookings.date,
      startTime: bookings.startTime,
      status: bookings.status,
      totalCents: bookings.totalCents,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, cid),
        gte(bookings.date, today),
        inArray(bookings.status, ["confirmed", "pending_deposit"]),
      ),
    )
    .orderBy(bookings.date, bookings.startTime)
    .limit(limit)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  // Lignes (bookingItems) des seules réservations affichées — snapshots inclus.
  const items = await db
    .select({
      bookingId: bookingItems.bookingId,
      serviceName: bookingItems.serviceName,
      vehicleBrand: bookingItems.vehicleBrand,
      vehicleModel: bookingItems.vehicleModel,
      vehicleTypeName: bookingItems.vehicleTypeName,
    })
    .from(bookingItems)
    .where(inArray(bookingItems.bookingId, ids))

  const itemsByBooking = new Map<number, typeof items>()
  for (const it of items) {
    const list = itemsByBooking.get(it.bookingId) ?? []
    list.push(it)
    itemsByBooking.set(it.bookingId, list)
  }

  return rows.map((r) => {
    const list = itemsByBooking.get(r.id) ?? []
    const services = Array.from(new Set(list.map((i) => i.serviceName).filter(Boolean))) as string[]
    const vehicles = Array.from(
      new Set(
        list
          .map((i) => [i.vehicleBrand, i.vehicleModel].filter(Boolean).join(" ").trim() || i.vehicleTypeName || "")
          .filter(Boolean),
      ),
    ) as string[]
    return { ...r, services, vehicles }
  })
}

/**
 * Aperçu de la semaine pour le cockpit : pour chaque jour, l'état issu du MÊME
 * moteur de disponibilité que le tunnel de réservation (horaires, congés,
 * blocages horaires, capacité) + les réservations du jour. Aucune règle de
 * planning dupliquée : on interroge `getAvailability`.
 */
export type DashboardWeekDay = {
  date: string
  /** "closed" | "time_off" | "full" | "past" | "open" | "partial" */
  state: "closed" | "time_off" | "full" | "past" | "open" | "partial"
  bookingsCount: number
  /** Réservations du jour (résumé léger). */
  bookings: { id: number; startTime: string; customerName: string; status: string }[]
}

export async function getDashboardWeek(companyId?: number): Promise<DashboardWeekDay[]> {
  const cid = companyId ?? (await requireCompanyId())
  const { getAvailability } = await import("@/lib/booking/availability")

  // Lundi de la semaine courante (lundi = début).
  const now = new Date()
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return iso(d)
  })

  const startDate = week[0]
  const endDate = week[6]

  const dayBookings = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      startTime: bookings.startTime,
      customerName: bookings.customerName,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, cid),
        gte(bookings.date, startDate),
        lte(bookings.date, endDate),
        inArray(bookings.status, ["confirmed", "pending_deposit", "completed"]),
      ),
    )
    .orderBy(bookings.date, bookings.startTime)

  const bookingsByDate = new Map<string, typeof dayBookings>()
  for (const b of dayBookings) {
    const key = b.date.slice(0, 10)
    const list = bookingsByDate.get(key) ?? []
    list.push(b)
    bookingsByDate.set(key, list)
  }

  // État de chaque jour via le moteur partagé. Durée sonde = 60 min (juste pour
  // savoir s'il reste au moins un créneau ; la vraie dispo dépend des durées).
  const results = await Promise.all(
    week.map(async (date) => {
      const list = (bookingsByDate.get(date) ?? []).map((b) => ({
        id: b.id,
        startTime: b.startTime,
        customerName: b.customerName,
        status: b.status,
      }))
      const avail = await getAvailability(date, 60, 1)
      let state: DashboardWeekDay["state"]
      if (avail.reason === "closed") state = "closed"
      else if (avail.reason === "time_off") state = "time_off"
      else if (avail.reason === "past") state = "past"
      else if (avail.reason === "full") state = "full"
      else state = list.length > 0 ? "partial" : "open"
      return { date, state, bookingsCount: list.length, bookings: list }
    }),
  )
  return results
}

/**
 * Répartition du CA par mois (graphique) — sur la même base que le tableau de
 * bord : total des FACTURES PAYÉES, groupé par mois de prestation (sinon
 * émission). Cohérent avec getDashboardStats.
 */
export async function getRevenueByMonth(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  // Même affectation de date que le tableau de bord : avoir => mois d'émission,
  // facture => mois de prestation (sinon émission/création).
  const monthExpr = sql<string>`to_char(${revenuePeriodDateExpr}, 'YYYY-MM')`
  const rows = await db
    .select({
      month: monthExpr,
      total: netRevenueSumExpr,
    })
    .from(invoices)
    .where(
      and(eq(invoices.companyId, cid), revenueDocumentFilter(cid), excludeCancelledOrDeletedBooking(cid)),
    )
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

/** Achats de produits/consommables de l'entreprise, du plus récent au plus ancien. */
export async function getProductPurchases(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(productPurchases)
    .where(eq(productPurchases.companyId, cid))
    .orderBy(desc(productPurchases.purchaseDate), desc(productPurchases.id))
}
