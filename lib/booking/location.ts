import "server-only"

/**
 * Lieu d'intervention — lecture/écriture DÉFENSIVE (même stratégie que
 * lib/notifications/settings-store.ts). Les colonnes vivent dans la migration
 * additive scripts/booking-location-migration.sql et ne sont PAS déclarées dans
 * le schéma Drizzle : tant qu'elle n'est pas appliquée, la lecture retombe sur
 * DEFAULT_LOCATION_CONFIG (déplacement uniquement = comportement actuel) et
 * l'écriture d'un atelier est refusée proprement (aucun faux succès).
 *
 * SÉCURITÉ : `companyId` / `bookingId` sont TOUJOURS résolus côté serveur par
 * l'appelant. Requêtes paramétrées, strictement scopées au tenant.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { DEFAULT_LOCATION_CONFIG, type LocationConfig, type LocationType } from "./location-shared"

type Rows = Array<Record<string, unknown>>
const rowsOf = (result: unknown): Rows => (result as { rows?: Rows }).rows ?? []

export async function locationColumnsExist(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'settings'
          AND column_name IN ('mobile_service_enabled','workshop_enabled','workshop_address','workshop_postal_code','workshop_city')`,
    )
    return rowsOf(result).length >= 5
  } catch {
    return false
  }
}

async function bookingLocationColumnExists(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'location_type'`,
    )
    return rowsOf(result).length >= 1
  } catch {
    return false
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** Ne jette jamais : colonnes/ligne absentes => valeurs par défaut. */
export async function getLocationConfig(companyId: number): Promise<LocationConfig> {
  if (!Number.isInteger(companyId) || companyId <= 0) return DEFAULT_LOCATION_CONFIG
  if (!(await locationColumnsExist())) return DEFAULT_LOCATION_CONFIG
  try {
    const result = await db.execute(
      sql`SELECT mobile_service_enabled, workshop_enabled, workshop_address, workshop_postal_code, workshop_city
          FROM settings WHERE "companyId" = ${companyId} LIMIT 1`,
    )
    const row = rowsOf(result)[0]
    if (!row) return DEFAULT_LOCATION_CONFIG
    return {
      mobileEnabled: row.mobile_service_enabled !== false,
      workshopEnabled: row.workshop_enabled === true,
      workshopAddress: str(row.workshop_address),
      workshopPostalCode: str(row.workshop_postal_code),
      workshopCity: str(row.workshop_city),
    }
  } catch {
    return DEFAULT_LOCATION_CONFIG
  }
}

export type SaveLocationResult = { ok: true } | { ok: false; error: string }

export async function saveLocationConfig(companyId: number, c: LocationConfig): Promise<SaveLocationResult> {
  if (!(await locationColumnsExist())) {
    return {
      ok: false,
      error: "Cette option sera disponible très prochainement. Votre configuration actuelle reste active.",
    }
  }
  const clip = (v: string, max: number) => v.trim().slice(0, max) || null
  await db.execute(
    sql`UPDATE settings SET
          mobile_service_enabled = ${c.mobileEnabled},
          workshop_enabled = ${c.workshopEnabled},
          workshop_address = ${clip(c.workshopAddress, 200)},
          workshop_postal_code = ${clip(c.workshopPostalCode, 12)},
          workshop_city = ${clip(c.workshopCity, 100)},
          "updatedAt" = NOW()
        WHERE "companyId" = ${companyId}`,
  )
  return { ok: true }
}

/** Enregistre le lieu d'une réservation. Silencieux si la migration manque. */
export async function setBookingLocationType(bookingId: number, type: LocationType): Promise<void> {
  if (!(await bookingLocationColumnExists())) return
  try {
    await db.execute(sql`UPDATE bookings SET location_type = ${type} WHERE id = ${bookingId}`)
  } catch {
    /* non bloquant : l'adresse enregistrée reste la source de vérité du lieu. */
  }
}

export async function getBookingLocationType(bookingId: number): Promise<LocationType | null> {
  if (!(await bookingLocationColumnExists())) return null
  try {
    const result = await db.execute(sql`SELECT location_type FROM bookings WHERE id = ${bookingId} LIMIT 1`)
    const v = rowsOf(result)[0]?.location_type
    return v === "workshop" || v === "client" ? v : null
  } catch {
    return null
  }
}
