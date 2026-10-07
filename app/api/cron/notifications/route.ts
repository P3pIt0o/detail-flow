import { NextResponse } from "next/server"
import { processDueNotifications } from "@/lib/notifications/outbox"
import { rejectUnauthorizedCron } from "@/lib/cron/auth"

// Toujours dynamique : ne jamais mettre en cache l'exécution du cron.
export const dynamic = "force-dynamic"

/**
 * Passe des notifications LOT D, toutes les 15 minutes (vercel.json) :
 *  - rappel AU PROFESSIONNEL 1 h / 2 h / 24 h avant le RDV ;
 *  - demande d'avis AU CLIENT après completed_at.
 * Le rappel historique AU CLIENT (J+1) reste dans /api/cron/reminders.
 *
 * Garde : rejectUnauthorizedCron (CRON_SECRET absent => 503, jeton absent ou
 * faux => 401). Ensuite processDueNotifications est fail-closed :
 *  - NOTIFICATIONS_ENABLED ≠ "true" => 200 { ran:false, reason:"disabled" }, aucun accès DB ;
 *  - migration LOT D absente => 200 { ran:false, reason:"migration_pending" }.
 * Exception inattendue => réponse générique, log sans PII ni secret.
 */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  try {
    const result = await processDueNotifications(new Date())
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[cron/notifications] unexpected_error", { kind: e instanceof Error ? e.name : "unknown" })
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 })
  }
}
