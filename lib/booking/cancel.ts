import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"

/**
 * ============================================================================
 *  ANNULATION D'UN RENDEZ-VOUS PAR LE CLIENT FINAL (jeton public)
 * ============================================================================
 *  Cœur métier PUR (aucune dépendance HTTP/headers) : testable directement en
 *  passant un `companyId` explicite, comme les requêtes de lecture scopées.
 *
 *  Sécurité multi-tenant : la réservation n'est retrouvée et modifiée QUE si
 *  `manageToken = token` ET `companyId = cid`. Le `companyId` provient
 *  exclusivement du contexte serveur (jamais du navigateur). Un jeton du
 *  tenant A ne peut donc jamais annuler une réservation du tenant B.
 *
 *  Aucune suppression : on bascule uniquement le statut vers `cancelled`
 *  (statut déjà utilisé par DetailFlow). Le créneau redevient disponible
 *  naturellement (`cancelled` n'est pas dans BLOCKING_STATUSES). Aucun
 *  remboursement Stripe n'est déclenché (V1) : le paiement enregistré est
 *  conservé tel quel.
 * ============================================================================
 */

export type CancelBookingResult =
  | { ok: true; bookingId: number }
  | { ok: false; code: "not_found" | "already_cancelled" | "completed" | "past" }

/** Vrai si le créneau (date + heure de début) est déjà passé. */
function isPast(dateStr: string, startTime: string): boolean {
  // Parse naïf `YYYY-MM-DDTHH:MM`. Suffisant pour empêcher l'annulation d'un
  // rendez-vous passé (garde de sécurité, pas de calcul comptable).
  const dt = new Date(`${dateStr}T${startTime || "00:00"}:00`)
  if (Number.isNaN(dt.getTime())) return false
  return dt.getTime() < Date.now()
}

/**
 * Annule une réservation à partir de son jeton public, pour l'entreprise
 * `companyId` (résolue côté serveur). Idempotence protégée : une réservation
 * déjà annulée renvoie `already_cancelled` (jamais de double annulation).
 */
export async function cancelBookingByToken(
  token: string,
  companyId: number,
): Promise<CancelBookingResult> {
  const clean = (token ?? "").trim()
  if (!clean) return { ok: false, code: "not_found" }

  const [existing] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      date: bookings.date,
      startTime: bookings.startTime,
    })
    .from(bookings)
    .where(and(eq(bookings.manageToken, clean), eq(bookings.companyId, companyId)))
    .limit(1)

  if (!existing) return { ok: false, code: "not_found" }
  if (existing.status === "cancelled") return { ok: false, code: "already_cancelled" }
  if (existing.status === "completed") return { ok: false, code: "completed" }
  if (isPast(String(existing.date), existing.startTime)) return { ok: false, code: "past" }

  // Mise à jour ATOMIQUE re-scopée (companyId + statut non-annulé) : une seconde
  // requête concurrente ne peut pas annuler deux fois (WHERE status <> cancelled).
  const updated = await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, existing.id),
        eq(bookings.companyId, companyId),
        eq(bookings.manageToken, clean),
      ),
    )
    .returning({ id: bookings.id })

  if (!updated.length) return { ok: false, code: "not_found" }
  return { ok: true, bookingId: existing.id }
}
