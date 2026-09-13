import "server-only"

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  bookingItems,
  clients,
  customRequests,
  invoices,
  payments,
  quoteRequestAttachments,
  refunds,
} from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"
import {
  classifyMatch,
  daysSince,
  dedupeVehicles,
  normalizeEmail,
  normalizePhone,
  sumCollectedNetCents,
  sumReservedCents,
  type AnchorContact,
  type KnownVehicle,
} from "@/lib/admin/client-crm"

/**
 * Construction de la FICHE CLIENT calculée (LOT clients v1).
 *
 * Cette fiche n'est jamais une fusion persistée : c'est une VUE calculée à la
 * volée à partir des données existantes (fiches `clients`, réservations,
 * demandes, factures, paiements, remboursements, photos), TOUJOURS scopée par
 * le `companyId` résolu côté serveur.
 *
 * Anti-IDOR (non négociable) :
 *  1. le tenant est résolu côté serveur (jamais depuis le navigateur) ;
 *  2. la ressource d'ancrage (fiche `clients` OU réservation) est chargée avec
 *     son filtre companyId — sinon `null` (la page renvoie notFound) ;
 *  3. les tables enfant (items, factures, paiements, photos…) ne sont chargées
 *     qu'APRÈS validation de l'appartenance, et restent filtrées companyId.
 *
 * Aucune écriture, aucune fusion, aucune création automatique de fiche.
 */

export type TimelineKind =
  | "request"
  | "request_decision"
  | "booking"
  | "completed"
  | "invoice"
  | "credit_note"
  | "payment"
  | "refund"

export interface TimelineEntry {
  key: string
  /** Jour d'affichage (YYYY-MM-DD). */
  day: string
  /** Horodatage de tri (ms). */
  sortTs: number
  kind: TimelineKind
  label: string
  status: string | null
  amountCents: number | null
  vehicle: string | null
  /** Chemin admin de base (sans ?tenant=), la vue applique withTenant. */
  href: string | null
}

export interface ClientPhoto {
  id: number
  name: string
  size: number
  contentType: string
}

export interface ClientInvoiceRow {
  id: number
  number: string | null
  documentType: string
  status: string
  totalCents: number
  day: string | null
}

export interface ClientProfile {
  companyId: number
  /** id de la fiche `clients` si elle existe, sinon null. */
  clientId: number | null
  /** Réservation représentative (ancrage d'une fiche virtuelle), sinon null. */
  anchorBookingId: number | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  /** Notes internes : UNIQUEMENT depuis une fiche `clients` (jamais inventées). */
  notes: string | null
  customerType: string | null
  hasManualRecord: boolean
  source: "manual" | "booking" | "both"
  stats: {
    bookingsCount: number
    completedCount: number
    lastCompletedDay: string | null
    daysSinceLastCompleted: number | null
    reservedCents: number
    collectedNetCents: number
  }
  vehicles: KnownVehicle[]
  invoices: ClientInvoiceRow[]
  photos: ClientPhoto[]
  timeline: TimelineEntry[]
  /** Des éléments rapprochés par téléphone ont un email différent (à vérifier). */
  needsReview: boolean
}

function isoDay(d: Date | string | null): string | null {
  if (d == null) return null
  if (typeof d === "string") return d.length >= 10 ? d.slice(0, 10) : null
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function ts(d: Date | string | null): number {
  if (d == null) return 0
  const v = typeof d === "string" ? Date.parse(d.length === 10 ? `${d}T00:00:00Z` : d) : d.getTime()
  return Number.isNaN(v) ? 0 : v
}

function bookingVehicleLabel(brand: string | null, model: string | null, typeName: string | null): string | null {
  const brandModel = [brand, model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ")
  return brandModel || (typeName ?? "").trim() || null
}

/** Fiche client ancrée sur une fiche `clients` existante. */
export async function getClientProfileByClientId(
  clientId: number,
  companyId?: number,
): Promise<ClientProfile | null> {
  const cid = companyId ?? (await requireCompanyId())
  if (!Number.isInteger(clientId) || clientId <= 0) return null

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, cid)))
    .limit(1)
  if (!client) return null

  const anchor: AnchorContact = {
    email: normalizeEmail(client.email),
    phone: normalizePhone(client.phone),
  }
  return buildProfile({
    companyId: cid,
    anchor,
    clientRecord: client,
    base: {
      name: client.name,
      email: client.email?.trim() || null,
      phone: client.phone?.trim() || null,
      address: client.address ?? null,
    },
  })
}

/** Fiche client VIRTUELLE ancrée sur une réservation représentative. */
export async function getClientProfileByBookingId(
  bookingId: number,
  companyId?: number,
): Promise<ClientProfile | null> {
  const cid = companyId ?? (await requireCompanyId())
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null

  const [booking] = await db
    .select({
      id: bookings.id,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      address: bookings.address,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, cid)))
    .limit(1)
  if (!booking) return null

  const anchor: AnchorContact = {
    email: normalizeEmail(booking.customerEmail),
    phone: normalizePhone(booking.customerPhone),
  }

  // Une fiche `clients` manuelle correspond-elle à ce client ? (rapprochement
  // fiable : email prioritaire, sinon téléphone sans email contradictoire).
  const manual = await db.select().from(clients).where(eq(clients.companyId, cid))
  const linked = manual.find((m) => classifyMatch(anchor, { email: m.email, phone: m.phone }) === "match") ?? null

  return buildProfile({
    companyId: cid,
    anchor,
    clientRecord: linked,
    anchorBookingId: booking.id,
    base: {
      name: linked?.name || booking.customerName,
      email: booking.customerEmail?.trim() || linked?.email?.trim() || null,
      phone: booking.customerPhone?.trim() || linked?.phone?.trim() || null,
      address: linked?.address ?? booking.address ?? null,
    },
  })
}

type ClientRecord = typeof clients.$inferSelect

async function buildProfile(input: {
  companyId: number
  anchor: AnchorContact
  clientRecord: ClientRecord | null
  anchorBookingId?: number | null
  base: { name: string; email: string | null; phone: string | null; address: string | null }
}): Promise<ClientProfile> {
  const { companyId, anchor, clientRecord, base } = input

  // --- Réservations du tenant, rapprochées à l'ancre (email puis téléphone). ---
  const companyBookings = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      isDemoData: bookings.isDemoData,
      totalCents: bookings.totalCents,
      date: bookings.date,
      createdAt: bookings.createdAt,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
    })
    .from(bookings)
    .where(eq(bookings.companyId, companyId))

  let needsReview = false
  const matchedBookings = companyBookings.filter((b) => {
    const r = classifyMatch(anchor, { email: b.customerEmail, phone: b.customerPhone })
    if (r === "review") needsReview = true
    return r === "match"
  })
  const bookingIds = matchedBookings.map((b) => b.id)

  // --- Demandes personnalisées du tenant, rapprochées de la même façon. ---
  const companyRequests = await db
    .select({
      id: customRequests.id,
      typeLabel: customRequests.typeLabel,
      status: customRequests.status,
      createdAt: customRequests.createdAt,
      respondedAt: customRequests.respondedAt,
      proposalPriceCents: customRequests.proposalPriceCents,
      customerEmail: customRequests.customerEmail,
      customerPhone: customRequests.customerPhone,
      vehicleType: customRequests.vehicleType,
      vehicleBrand: customRequests.vehicleBrand,
      vehicleModel: customRequests.vehicleModel,
    })
    .from(customRequests)
    .where(eq(customRequests.companyId, companyId))

  const matchedRequests = companyRequests.filter((r) => {
    const res = classifyMatch(anchor, { email: r.customerEmail, phone: r.customerPhone })
    if (res === "review") needsReview = true
    return res === "match"
  })
  const requestIds = matchedRequests.map((r) => r.id)

  // --- Tables enfant : chargées UNIQUEMENT pour les parents déjà validés. ---
  const items = bookingIds.length
    ? await db
        .select({
          bookingId: bookingItems.bookingId,
          serviceName: bookingItems.serviceName,
          vehicleTypeName: bookingItems.vehicleTypeName,
          vehicleBrand: bookingItems.vehicleBrand,
          vehicleModel: bookingItems.vehicleModel,
          vehiclePlate: bookingItems.vehiclePlate,
        })
        .from(bookingItems)
        .where(inArray(bookingItems.bookingId, bookingIds))
    : []

  const invoiceRows = bookingIds.length
    ? await db
        .select({
          id: invoices.id,
          number: invoices.number,
          documentType: invoices.documentType,
          status: invoices.status,
          totalCents: invoices.totalCents,
          issueDate: invoices.issueDate,
          serviceDate: invoices.serviceDate,
          createdAt: invoices.createdAt,
          bookingId: invoices.bookingId,
        })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), inArray(invoices.bookingId, bookingIds)))
    : []

  const paymentRows = bookingIds.length
    ? await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
          type: payments.type,
          status: payments.status,
          grossAmountCents: payments.grossAmountCents,
          refundedAmountCents: payments.refundedAmountCents,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .where(and(eq(payments.companyId, companyId), inArray(payments.bookingId, bookingIds)))
    : []

  const refundRows = bookingIds.length
    ? await db
        .select({
          id: refunds.id,
          bookingId: refunds.bookingId,
          amountCents: refunds.amountCents,
          status: refunds.status,
          createdAt: refunds.createdAt,
          succeededAt: refunds.succeededAt,
        })
        .from(refunds)
        .where(and(eq(refunds.companyId, companyId), inArray(refunds.bookingId, bookingIds)))
    : []

  const attachmentRows = requestIds.length
    ? await db
        .select({
          id: quoteRequestAttachments.id,
          originalName: quoteRequestAttachments.originalName,
          sizeBytes: quoteRequestAttachments.sizeBytes,
          contentType: quoteRequestAttachments.contentType,
          sortOrder: quoteRequestAttachments.sortOrder,
        })
        .from(quoteRequestAttachments)
        .where(
          and(
            eq(quoteRequestAttachments.companyId, companyId),
            inArray(quoteRequestAttachments.requestId, requestIds),
          ),
        )
        .orderBy(quoteRequestAttachments.sortOrder, quoteRequestAttachments.id)
    : []

  // --- Indicateurs fiables (matched uniquement, jamais les « à vérifier »). ---
  const completed = matchedBookings.filter((b) => b.status === "completed")
  const lastCompletedDay = completed.reduce<string | null>((acc, b) => {
    const d = isoDay(b.date)
    return d && (!acc || d > acc) ? d : acc
  }, null)

  // --- Véhicules connus (réservations + demandes), dédupliqués à l'affichage. ---
  const vehicleInputs: KnownVehicle[] = []
  const bookingDayById = new Map(matchedBookings.map((b) => [b.id, isoDay(b.date)]))
  for (const it of items) {
    vehicleInputs.push({
      type: it.vehicleTypeName ?? null,
      brand: it.vehicleBrand ?? null,
      model: it.vehicleModel ?? null,
      plate: it.vehiclePlate ?? null,
      lastDate: bookingDayById.get(it.bookingId) ?? null,
    })
  }
  for (const r of matchedRequests) {
    vehicleInputs.push({
      type: r.vehicleType ?? null,
      brand: r.vehicleBrand ?? null,
      model: r.vehicleModel ?? null,
      plate: null,
      lastDate: isoDay(r.createdAt),
    })
  }
  const vehicles = dedupeVehicles(vehicleInputs)

  // --- Chronologie (récente → ancienne). Chaque item = donnée réelle. ---
  const vehicleByBooking = new Map<number, string | null>()
  for (const it of items) {
    if (!vehicleByBooking.has(it.bookingId)) {
      vehicleByBooking.set(it.bookingId, bookingVehicleLabel(it.vehicleBrand, it.vehicleModel, it.vehicleTypeName))
    }
  }

  const timeline: TimelineEntry[] = []
  for (const r of matchedRequests) {
    timeline.push({
      key: `req-${r.id}`,
      day: isoDay(r.createdAt) ?? "",
      sortTs: ts(r.createdAt),
      kind: "request",
      label: `Demande de devis · ${r.typeLabel}`,
      status: r.status,
      amountCents: r.proposalPriceCents ?? null,
      vehicle: bookingVehicleLabel(r.vehicleBrand, r.vehicleModel, r.vehicleType),
      href: `/admin/demandes/${r.id}`,
    })
    if (r.respondedAt && (r.status === "accepted" || r.status === "declined")) {
      timeline.push({
        key: `req-dec-${r.id}`,
        day: isoDay(r.respondedAt) ?? "",
        sortTs: ts(r.respondedAt),
        kind: "request_decision",
        label: r.status === "accepted" ? "Devis accepté" : "Devis refusé",
        status: r.status,
        amountCents: r.proposalPriceCents ?? null,
        vehicle: bookingVehicleLabel(r.vehicleBrand, r.vehicleModel, r.vehicleType),
        href: `/admin/demandes/${r.id}`,
      })
    }
  }
  for (const b of matchedBookings) {
    timeline.push({
      key: `bk-${b.id}`,
      day: isoDay(b.date) ?? "",
      sortTs: ts(b.date),
      kind: "booking",
      label: "Réservation",
      status: b.status,
      amountCents: b.totalCents,
      vehicle: vehicleByBooking.get(b.id) ?? null,
      href: `/admin/reservations/${b.id}`,
    })
    if (b.status === "completed") {
      timeline.push({
        key: `bk-done-${b.id}`,
        day: isoDay(b.date) ?? "",
        sortTs: ts(b.date) + 1,
        kind: "completed",
        label: "Prestation terminée",
        status: b.status,
        amountCents: null,
        vehicle: vehicleByBooking.get(b.id) ?? null,
        href: `/admin/reservations/${b.id}`,
      })
    }
  }
  for (const inv of invoiceRows) {
    const isCredit = inv.documentType === "credit_note"
    timeline.push({
      key: `inv-${inv.id}`,
      day: isoDay(inv.issueDate ?? inv.serviceDate ?? inv.createdAt) ?? "",
      sortTs: ts(inv.issueDate ?? inv.serviceDate ?? inv.createdAt),
      kind: isCredit ? "credit_note" : "invoice",
      label: isCredit ? "Avoir" : "Facture",
      status: inv.status,
      amountCents: isCredit ? -Math.abs(inv.totalCents) : inv.totalCents,
      vehicle: inv.bookingId != null ? (vehicleByBooking.get(inv.bookingId) ?? null) : null,
      href: `/admin/factures/${inv.id}`,
    })
  }
  for (const p of paymentRows) {
    if (!p.paidAt) continue
    timeline.push({
      key: `pay-${p.id}`,
      day: isoDay(p.paidAt) ?? "",
      sortTs: ts(p.paidAt),
      kind: "payment",
      label: p.type === "deposit" ? "Acompte encaissé" : "Paiement encaissé",
      status: p.status,
      amountCents: p.grossAmountCents,
      vehicle: vehicleByBooking.get(p.bookingId) ?? null,
      href: `/admin/reservations/${p.bookingId}`,
    })
  }
  for (const rf of refundRows) {
    if (rf.status !== "succeeded") continue
    timeline.push({
      key: `refund-${rf.id}`,
      day: isoDay(rf.succeededAt ?? rf.createdAt) ?? "",
      sortTs: ts(rf.succeededAt ?? rf.createdAt),
      kind: "refund",
      label: "Remboursement",
      status: rf.status,
      amountCents: -Math.abs(rf.amountCents),
      vehicle: vehicleByBooking.get(rf.bookingId) ?? null,
      href: `/admin/reservations/${rf.bookingId}`,
    })
  }
  timeline.sort((a, b) => b.sortTs - a.sortTs)

  const hasManualRecord = clientRecord != null
  const hasBookings = matchedBookings.length > 0 || matchedRequests.length > 0
  const source: ClientProfile["source"] =
    hasManualRecord && hasBookings ? "both" : hasManualRecord ? "manual" : "booking"

  return {
    companyId,
    clientId: clientRecord?.id ?? null,
    anchorBookingId: input.anchorBookingId ?? null,
    name: base.name,
    email: base.email,
    phone: base.phone,
    address: base.address,
    // Notes internes : jamais inventées, uniquement depuis une fiche `clients`.
    notes: clientRecord?.notes ?? null,
    customerType: clientRecord?.customerType ?? null,
    hasManualRecord,
    source,
    stats: {
      bookingsCount: matchedBookings.length,
      completedCount: completed.length,
      lastCompletedDay,
      daysSinceLastCompleted: daysSince(lastCompletedDay),
      reservedCents: sumReservedCents(matchedBookings),
      collectedNetCents: sumCollectedNetCents(paymentRows),
    },
    vehicles,
    invoices: invoiceRows.map((inv) => ({
      id: inv.id,
      number: inv.number,
      documentType: inv.documentType,
      status: inv.status,
      totalCents: inv.totalCents,
      day: isoDay(inv.issueDate ?? inv.serviceDate ?? inv.createdAt),
    })),
    photos: attachmentRows.map((a) => ({
      id: a.id,
      name: a.originalName,
      size: a.sizeBytes,
      contentType: a.contentType,
    })),
    timeline,
    needsReview,
  }
}
