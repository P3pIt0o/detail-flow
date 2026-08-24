"use server"

/**
 * ============================================================================
 *  ACTION SERVEUR — ANNULATION PUBLIQUE D'UN RDV PAR LE CLIENT (jeton)
 * ============================================================================
 *  Le client final N'EST PAS authentifié : la seule autorité est le jeton
 *  public haute entropie. Le `companyId` est TOUJOURS résolu côté serveur
 *  (resolveRequestTenant), jamais accepté depuis le navigateur. Le cœur métier
 *  (cancelBookingByToken) re-scope l'accès par (token + companyId), ce qui
 *  interdit toute annulation inter-tenant et toute double annulation.
 * ============================================================================
 */

import { revalidatePath } from "next/cache"
import { resolveRequestTenant } from "@/lib/tenant"
import { cancelBookingByToken } from "@/lib/booking/cancel"
import { sendCustomerCancellationEmails } from "@/lib/email/notifications"

const GENERIC_NOT_FOUND = "Rendez-vous introuvable ou lien invalide."

export type CancelActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function cancelMyBookingAction(token: string): Promise<CancelActionResult> {
  const tenant = await resolveRequestTenant()
  // Aucune information supplémentaire n'est révélée hors contexte tenant.
  if (!tenant) return { ok: false, error: GENERIC_NOT_FOUND }

  const res = await cancelBookingByToken(token, tenant.id)

  if (!res.ok) {
    switch (res.code) {
      case "already_cancelled":
        return { ok: false, error: "Ce rendez-vous est déjà annulé." }
      case "completed":
        return { ok: false, error: "Ce rendez-vous est terminé et ne peut plus être annulé." }
      case "past":
        return { ok: false, error: "Ce rendez-vous est passé et ne peut plus être annulé." }
      default:
        // not_found : message générique (aucune fuite d'existence de booking).
        return { ok: false, error: GENERIC_NOT_FOUND }
    }
  }

  // Emails transactionnels : non bloquants (l'annulation est déjà persistée).
  await sendCustomerCancellationEmails(res.bookingId)

  revalidatePath(`/reservation/gerer/${token}`)
  return { ok: true }
}
