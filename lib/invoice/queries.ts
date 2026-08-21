import "server-only"
import { db } from "@/lib/db"
import {
  invoices,
  invoiceItems,
  invoicePayments,
  invoiceEvents,
  settings as settingsTable,
} from "@/lib/db/schema"
import { getCompanyIdOrNull, requireCompanyId } from "@/lib/tenant"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

export type InvoiceRow = typeof invoices.$inferSelect
export type InvoiceItemRow = typeof invoiceItems.$inferSelect
export type InvoicePaymentRow = typeof invoicePayments.$inferSelect
export type InvoiceEventRow = typeof invoiceEvents.$inferSelect
export type FullSettings = typeof settingsTable.$inferSelect

/**
 * Paramètres complets (toutes colonnes, dont facturation) de l'entreprise
 * courante. Chaque entreprise possède exactement une ligne settings.
 */
export async function getFullSettings(companyId?: number): Promise<FullSettings | null> {
  const cid = companyId ?? (await getCompanyIdOrNull())
  if (cid == null) return null
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, cid))
    .limit(1)
  return rows[0] ?? null
}

/** Liste des factures de l'entreprise courante, plus récentes d'abord. */
export async function getInvoiceList(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      bookingId: invoices.bookingId,
      status: invoices.status,
      customerName: invoices.customerName,
      serviceDate: invoices.serviceDate,
      issueDate: invoices.issueDate,
      totalCents: invoices.totalCents,
      balanceCents: invoices.balanceCents,
      currencyCode: invoices.currencyCode,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.companyId, cid))
    .orderBy(desc(invoices.createdAt))
}

/**
 * Détail complet d'une facture : entête + lignes + paiements + historique.
 * Filtré par `id + companyId` : une facture d'une autre entreprise renvoie null.
 */
export async function getInvoiceDetail(id: number, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, cid)))
    .limit(1)
  if (!rows.length) return null
  const invoice = rows[0]

  const [items, payments, events] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder)),
    db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id)).orderBy(desc(invoicePayments.paidAt)),
    db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, id)).orderBy(desc(invoiceEvents.createdAt)),
  ])

  return { invoice, items, payments, events }
}

/** Facture liée à une réservation (pour afficher le bon bouton), scopée entreprise. */
export async function getInvoiceByBookingId(bookingId: number, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({ id: invoices.id, number: invoices.number, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), eq(invoices.companyId, cid)))
    .limit(1)
  return rows[0] ?? null
}

/** Map bookingId -> facture, pour une liste de réservations (calendrier/liste). */
export async function getInvoicesForBookings(bookingIds: number[], companyId?: number) {
  if (!bookingIds.length) return new Map<number, { id: number; number: string | null; status: string }>()
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({ id: invoices.id, number: invoices.number, status: invoices.status, bookingId: invoices.bookingId })
    .from(invoices)
    .where(and(inArray(invoices.bookingId, bookingIds), eq(invoices.companyId, cid)))
  return new Map(rows.filter((r) => r.bookingId != null).map((r) => [r.bookingId as number, r]))
}
