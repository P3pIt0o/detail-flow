import "server-only"

/**
 * Horodatage RÉEL de réalisation d'une prestation (LOT D #3).
 *
 * `bookings.completed_at` est ajouté par la migration additive séparée et n'est
 * PAS dans le schéma Drizzle : on l'écrit en SQL brut, de façon défensive. Tant
 * que la colonne n'existe pas, c'est un no-op sûr (aucune autre erreur masquée :
 * seule l'absence de colonne est absorbée).
 *
 * Ne touche JAMAIS au statut de paiement : uniquement la date de réalisation.
 * Idempotent : ne réécrit pas un horodatage déjà posé (le 1er « terminé » fait
 * foi), ce qui évite qu'un repassage au statut « terminé » ne reprogramme une
 * seconde demande d'avis.
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/** Existence de la colonne bookings.completed_at (migration appliquée). */
export async function completedAtColumnExists(): Promise<boolean> {
  try {
    const res = await db.execute(
      sql`SELECT 1 FROM information_schema.columns
          WHERE table_name = 'bookings' AND column_name = 'completed_at'`,
    )
    const rows = (res as unknown as { rows?: unknown[] }).rows ?? []
    return rows.length >= 1
  } catch {
    return false
  }
}

/**
 * Pose `completed_at = NOW()` pour une réservation d'un tenant, seulement si la
 * colonne existe et qu'aucun horodatage n'est déjà présent. Scopé tenant (IDOR).
 * Ne jette jamais.
 */
export async function stampBookingCompletedAt(companyId: number, bookingId: number): Promise<void> {
  if (!Number.isInteger(companyId) || !Number.isInteger(bookingId)) return
  try {
    if (!(await completedAtColumnExists())) return
    await db.execute(
      sql`UPDATE bookings SET completed_at = NOW()
          WHERE id = ${bookingId} AND "companyId" = ${companyId} AND completed_at IS NULL`,
    )
  } catch (e) {
    console.log("[v0] stampBookingCompletedAt error:", e instanceof Error ? e.message : e)
  }
}

/**
 * Annule l'horodatage de réalisation si l'on QUITTE le statut « terminé »
 * (ex. correction d'une erreur). Invalide de fait une demande d'avis non encore
 * due. No-op sûr sans colonne. Ne touche jamais au paiement.
 */
export async function clearBookingCompletedAt(companyId: number, bookingId: number): Promise<void> {
  if (!Number.isInteger(companyId) || !Number.isInteger(bookingId)) return
  try {
    if (!(await completedAtColumnExists())) return
    await db.execute(
      sql`UPDATE bookings SET completed_at = NULL
          WHERE id = ${bookingId} AND "companyId" = ${companyId}`,
    )
  } catch (e) {
    console.log("[v0] clearBookingCompletedAt error:", e instanceof Error ? e.message : e)
  }
}
