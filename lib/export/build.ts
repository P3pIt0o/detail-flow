/**
 * Construction de l'export de données d'une entreprise (tenant).
 *
 * SÉCURITÉ (règle non négociable) :
 *  - N'exporte QUE les données opérationnelles et de branding possédées par
 *    l'entreprise, strictement filtrées par companyId.
 *  - N'exporte JAMAIS : mots de passe, sessions, comptes d'authentification
 *    (tables user/session/account/verification), clés API, secrets, tokens,
 *    ni aucune donnée interne de sécurité de la plateforme.
 *  - Les tables enfant (lignes de facture, éléments de réservation…) sont
 *    filtrées via leur parent déjà scopé par companyId.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  bookingItems,
  invoices,
  invoiceItems,
  invoicePayments,
  services,
  serviceCategories,
  servicePrices,
  options,
  vehicleTypes,
  settings,
  businessHours,
  timeOff,
  companies,
} from "@/lib/db/schema"
import { createZip, toCsv } from "./zip"

export type CompanyExport = {
  meta: {
    exportedAt: string
    companyId: number
    formatVersion: string
  }
  company: unknown
  settings: unknown
  vehicleTypes: unknown[]
  serviceCategories: unknown[]
  services: unknown[]
  servicePrices: unknown[]
  options: unknown[]
  businessHours: unknown[]
  timeOff: unknown[]
  bookings: unknown[]
  bookingItems: unknown[]
  invoices: unknown[]
  invoiceItems: unknown[]
  invoicePayments: unknown[]
}

/** Champs de branding/coordonnées exportés depuis `companies` (liste blanche). */
function pickCompanyPublicFields(row: Record<string, unknown>) {
  const allowed = [
    "id", "name", "slug", "status", "logoUrl", "faviconUrl", "brandPrimary",
    "brandSecondary", "websiteUrl", "socialLinks", "email", "phone", "address",
    "city", "postalCode", "country", "timezone", "currency", "locale", "createdAt",
  ]
  const out: Record<string, unknown> = {}
  for (const k of allowed) out[k] = row[k]
  return out
}

/** Récupère toutes les données exportables d'une entreprise, scopées companyId. */
export async function buildCompanyExport(companyId: number): Promise<CompanyExport> {
  // Racines scopées directement par companyId.
  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  const [settingsRow] = await db.select().from(settings).where(eq(settings.companyId, companyId)).limit(1)

  const [
    vehicleTypeRows,
    categoryRows,
    serviceRows,
    optionRows,
    hoursRows,
    timeOffRows,
    bookingRows,
    invoiceRows,
  ] = await Promise.all([
    db.select().from(vehicleTypes).where(eq(vehicleTypes.companyId, companyId)),
    db.select().from(serviceCategories).where(eq(serviceCategories.companyId, companyId)),
    db.select().from(services).where(eq(services.companyId, companyId)),
    db.select().from(options).where(eq(options.companyId, companyId)),
    db.select().from(businessHours).where(eq(businessHours.companyId, companyId)),
    db.select().from(timeOff).where(eq(timeOff.companyId, companyId)),
    db.select().from(bookings).where(eq(bookings.companyId, companyId)),
    db.select().from(invoices).where(eq(invoices.companyId, companyId)),
  ])

  // Enfants : filtrés via les identifiants parents déjà scopés.
  const serviceIds = serviceRows.map((s) => s.id)
  const bookingIds = bookingRows.map((b) => b.id)
  const invoiceIds = invoiceRows.map((i) => i.id)

  const [priceRows, bookingItemRows, invoiceItemRows, paymentRows] = await Promise.all([
    serviceIds.length
      ? db.select().from(servicePrices).where(inArray(servicePrices.serviceId, serviceIds))
      : Promise.resolve([]),
    bookingIds.length
      ? db.select().from(bookingItems).where(inArray(bookingItems.bookingId, bookingIds))
      : Promise.resolve([]),
    invoiceIds.length
      ? db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds))
      : Promise.resolve([]),
    invoiceIds.length
      ? db.select().from(invoicePayments).where(inArray(invoicePayments.invoiceId, invoiceIds))
      : Promise.resolve([]),
  ])

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      companyId,
      formatVersion: "1",
    },
    company: companyRow ? pickCompanyPublicFields(companyRow as Record<string, unknown>) : null,
    settings: settingsRow ?? null,
    vehicleTypes: vehicleTypeRows,
    serviceCategories: categoryRows,
    services: serviceRows,
    servicePrices: priceRows,
    options: optionRows,
    businessHours: hoursRows,
    timeOff: timeOffRows,
    bookings: bookingRows,
    bookingItems: bookingItemRows,
    invoices: invoiceRows,
    invoiceItems: invoiceItemRows,
    invoicePayments: paymentRows,
  }
}

/** Empaquette l'export en archive ZIP (un JSON complet + un CSV par entité). */
export function packExportZip(data: CompanyExport): Uint8Array {
  const files: { name: string; content: string }[] = [
    { name: "export.json", content: JSON.stringify(data, null, 2) },
    { name: "csv/vehicle-types.csv", content: toCsv(data.vehicleTypes as Record<string, unknown>[]) },
    { name: "csv/service-categories.csv", content: toCsv(data.serviceCategories as Record<string, unknown>[]) },
    { name: "csv/services.csv", content: toCsv(data.services as Record<string, unknown>[]) },
    { name: "csv/service-prices.csv", content: toCsv(data.servicePrices as Record<string, unknown>[]) },
    { name: "csv/options.csv", content: toCsv(data.options as Record<string, unknown>[]) },
    { name: "csv/business-hours.csv", content: toCsv(data.businessHours as Record<string, unknown>[]) },
    { name: "csv/time-off.csv", content: toCsv(data.timeOff as Record<string, unknown>[]) },
    { name: "csv/bookings.csv", content: toCsv(data.bookings as Record<string, unknown>[]) },
    { name: "csv/booking-items.csv", content: toCsv(data.bookingItems as Record<string, unknown>[]) },
    { name: "csv/invoices.csv", content: toCsv(data.invoices as Record<string, unknown>[]) },
    { name: "csv/invoice-items.csv", content: toCsv(data.invoiceItems as Record<string, unknown>[]) },
    { name: "csv/invoice-payments.csv", content: toCsv(data.invoicePayments as Record<string, unknown>[]) },
  ]
  return createZip(files)
}
