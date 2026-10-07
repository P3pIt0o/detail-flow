import "server-only"

import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

/**
 * Garde d'authentification FAIL-CLOSED de toutes les routes `app/api/cron/**`.
 *
 * - CRON_SECRET absent      -> 503 (aucun traitement, aucune requête DB, aucun envoi)
 * - Authorization absent    -> 401
 * - mauvais Bearer          -> 401
 * - Bearer exact            -> null (traitement autorisé)
 *
 * Le secret n'apparaît jamais dans une réponse ni dans un log.
 */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET non configuré — exécution refusée.")
    return NextResponse.json({ ok: false, error: "Configuration indisponible" }, { status: 503 })
  }
  const auth = request.headers.get("authorization") ?? ""
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(auth)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
  }
  return null
}
