import { NextResponse } from "next/server"
import { processDueNotifications } from "@/lib/notifications/outbox"
import { rejectUnauthorizedCron } from "@/lib/cron/auth"

// Toujours dynamique : ne jamais mettre en cache l'exécution du cron.
export const dynamic = "force-dynamic"

/**
 * Passe des notifications LOT D — rappel PRO avant RDV + demande d'avis client
 * après prestation.
 *
 * FRÉQUENCE REQUISE
 * -----------------
 * Les délais 1 h / 2 h EXIGENT une passe SOUS-HORAIRE (idéalement toutes les
 * 15 minutes, schedule cron « slash-15 * * * * »). Le cron EXISTANT
 * « /api/cron/reminders » tourne une fois par jour (« 0 9 * * * ») : il NE PEUT
 * PAS déclencher un rappel à 1 h/2 h. Ce nouvel endpoint N'EST PAS encore
 * branché dans vercel.json (aucune activation en production dans ce lot).
 * Pour l'activer (décision de déploiement, hors périmètre) :
 *   - Hobby : 1 cron/jour max -> 1 h/2 h non couverts (24 h uniquement) ;
 *   - Pro/Enterprise : ajouter une entrée crons { path, schedule } à vercel.json
 *     avec une cadence de 15 minutes.
 *
 * Sécurité : même garde que le cron existant — en production, Vercel Cron
 * ajoute `Authorization: Bearer <CRON_SECRET>`. Toute requête sans ce jeton est
 * refusée ; sans CRON_SECRET configuré, la route est fermée (503, fail-closed).
 *
 * Envoi RÉEL désactivé par défaut (voir notificationsRealSendEnabled) : en
 * Preview et tant que NOTIFICATIONS_ENABLED n'est pas « true », le fournisseur
 * est simulé — aucun email réel n'est émis.
 */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const result = await processDueNotifications(new Date())
  return NextResponse.json({ ok: true, ...result })
}
