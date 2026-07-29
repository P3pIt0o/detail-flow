/**
 * ============================================================================
 *  REQUÊTES DE LECTURE — MOTEUR DE RÉSERVATION (multi-tenant)
 * ============================================================================
 *  Toutes les lectures sont ISOLÉES PAR ENTREPRISE (`companyId`).
 *
 *  Convention : chaque fonction accepte un `companyId` optionnel. S'il n'est
 *  pas fourni, l'entreprise courante est résolue depuis le contexte de la
 *  requête (en-tête posé par le middleware). Passer un `companyId` explicite
 *  est utile pour les tests d'isolation.
 * ============================================================================
 */

import { db } from "@/lib/db"
import {
  services,
  servicePrices,
  serviceCategories,
  vehicleTypes,
  options,
  settings as settingsTable,
  businessHours,
  timeOff,
  bookings,
  bookingItems,
  bookingItemOptions,
} from "@/lib/db/schema"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { requireCompanyId, getCompanyIdOrNull } from "@/lib/tenant"

/** Statuts qui occupent réellement un créneau (bloquants). */
export const BLOCKING_STATUSES = ["pending_deposit", "confirmed", "completed"]

/**
 * Type des paramètres métier : ligne complète de la table `settings`.
 * (Toutes les colonnes, y compris facturation, mode vacances, coordonnées.)
 */
export type Settings = typeof settingsTable.$inferSelect

/**
 * Valeurs de repli si la table settings est vide OU hors contexte tenant.
 * Doit couvrir TOUTES les colonnes pour rester assignable à `Settings`.
 */
const DEFAULT_SETTINGS: Settings = {
  id: 0,
  companyId: 0,
  businessName: null,
  businessEmail: null,
  businessPhone: null,
  businessAddress: "",
  businessLat: null,
  businessLng: null,
  freeDistanceKm: "0",
  pricePerKmCents: 0,
  maxDistanceKm: "50",
  roundTrip: true,
  maxVehiclesPerDay: 4,
  slotIntervalMin: 30,
  bufferMin: 0,
  minNoticeHours: 24,
  depositType: "none",
  depositValue: 0,
  vacationMode: false,
  vacationMessage: null,
  invoiceLogoPathname: null,
  invoiceCompanyAddress: null,
  invoiceSiret: null,
  invoiceIban: null,
  invoiceBic: null,
  vatEnabled: false,
  vatRate: "20",
  vatExemptNote: "TVA non applicable, art. 293 B du CGI",
  invoicePrefix: "FAC",
  invoiceCounter: 0,
  invoiceCounterYear: 0,
  invoiceDueDays: 30,
  invoiceFooterNote: null,
  invoiceLegalMentions: null,
  invoiceEmailSubject: null,
  invoiceEmailBody: null,
  updatedAt: new Date(),
}

/**
 * Paramètres métier de l'entreprise (une ligne par entreprise).
 * Se dégrade proprement (valeurs par défaut) hors contexte tenant.
 */
export async function getSettings(companyId?: number): Promise<Settings> {
  const cid = companyId ?? (await getCompanyIdOrNull())
  if (cid == null) return DEFAULT_SETTINGS
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, cid))
    .limit(1)
  if (!rows.length) return DEFAULT_SETTINGS
  return rows[0]
}

/** Types de véhicules actifs, triés. */
export async function getVehicleTypes(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(vehicleTypes)
    .where(and(eq(vehicleTypes.companyId, cid), eq(vehicleTypes.active, true)))
    .orderBy(asc(vehicleTypes.sortOrder))
}

/** Catégories actives, triées. */
export async function getCategories(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(serviceCategories)
    .where(and(eq(serviceCategories.companyId, cid), eq(serviceCategories.active, true)))
    .orderBy(asc(serviceCategories.sortOrder))
}

/** Prestations visibles, triées. */
export async function getServices(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(services)
    .where(and(eq(services.companyId, cid), eq(services.visible, true)))
    .orderBy(asc(services.sortOrder))
}

/** Options visibles, triées. */
export async function getOptions(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(options)
    .where(and(eq(options.companyId, cid), eq(options.visible, true)))
    .orderBy(asc(options.sortOrder))
}

/**
 * Tous les tarifs par véhicule de l'entreprise (jointure sur services pour
 * garantir l'isolation : servicePrices n'a pas de companyId propre).
 */
export async function getServicePrices(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({
      id: servicePrices.id,
      serviceId: servicePrices.serviceId,
      vehicleTypeId: servicePrices.vehicleTypeId,
      priceCents: servicePrices.priceCents,
      durationMin: servicePrices.durationMin,
    })
    .from(servicePrices)
    .innerJoin(services, eq(servicePrices.serviceId, services.id))
    .where(eq(services.companyId, cid))
  return rows
}

/**
 * Tarif + durée d'une prestation pour un véhicule donné.
 * Vérifie que la prestation appartient bien à l'entreprise avant tout calcul.
 * Repli sur le prix/durée de base de la prestation si aucun tarif spécifique.
 */
export async function getPriceFor(serviceId: number, vehicleTypeId: number, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())

  // La prestation doit appartenir à l'entreprise (barrière d'isolation).
  const base = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, cid)))
    .limit(1)
  if (!base.length) return null

  const specific = await db
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.serviceId, serviceId), eq(servicePrices.vehicleTypeId, vehicleTypeId)))
    .limit(1)

  if (specific.length) {
    return { priceCents: specific[0].priceCents, durationMin: specific[0].durationMin }
  }
  return { priceCents: base[0].basePriceCents, durationMin: base[0].durationMin }
}

/** Horaires d'ouverture par jour de la semaine. */
export async function getBusinessHours(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select()
    .from(businessHours)
    .where(eq(businessHours.companyId, cid))
    .orderBy(asc(businessHours.dayOfWeek))
}

/** Périodes bloquées (vacances / indisponibilités). */
export async function getTimeOff(companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db.select().from(timeOff).where(eq(timeOff.companyId, cid))
}

/**
 * Réservations actives (bloquantes) d'une date donnée, avec leurs horaires.
 * Sert au calcul des créneaux disponibles et à la prévention des doublons.
 */
export async function getActiveBookingsForDate(dateStr: string, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  return db
    .select({
      id: bookings.id,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.companyId, cid),
        eq(bookings.date, dateStr),
        inArray(bookings.status, BLOCKING_STATUSES),
      ),
    )
}

/** Nombre de véhicules déjà réservés (actifs) sur une date. */
export async function countVehiclesForDate(dateStr: string, companyId?: number): Promise<number> {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select({ n: count() })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.companyId, cid),
        eq(bookings.date, dateStr),
        inArray(bookings.status, BLOCKING_STATUSES),
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * Vérifie qu'une référence de réservation est unique.
 * La référence est globalement unique (contrainte DB) : contrôle non scopé.
 */
export async function referenceExists(reference: string): Promise<boolean> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.reference, reference))
    .limit(1)
  return rows.length > 0
}

/** Réservation complète (avec lignes + options) par sa référence, scopée entreprise. */
export async function getBookingByReference(reference: string, companyId?: number) {
  const cid = companyId ?? (await requireCompanyId())
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.reference, reference), eq(bookings.companyId, cid)))
    .limit(1)
  if (!rows.length) return null
  const booking = rows[0]

  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, booking.id))
  const itemIds = items.map((i) => i.id)
  const itemOptions = itemIds.length
    ? await db.select().from(bookingItemOptions).where(inArray(bookingItemOptions.bookingItemId, itemIds))
    : []

  return {
    booking,
    items: items.map((it) => ({
      ...it,
      options: itemOptions.filter((o) => o.bookingItemId === it.id),
    })),
  }
}
