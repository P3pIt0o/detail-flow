import { NextResponse } from "next/server"
import { processDueNotifications } from "@/lib/notifications/outbox"

// Toujours dynamique : ne jamais mettre en cache l'exécution du cron.
export const dynamic = "force-dynamic"

/**
 * Passe des notifications LOT D — rappel PRO avant RDV + demande d'avis client
 * après prestation.
 *
 * ┌─ FRÉQUENCE REQUISE ─────────────────────────────────────────────────────┐
 * │ Les délais 1 h / 2 h EXIGENT une passe SOUS-HORAIRE (ex. « */15 * * * * » │
 * │ toutes les 15 min). Le cron EXISTANT « /api/cron/reminders » tourne une   │
 * │ fois par jour (« 0 9 * * * ») : il NE PEUT PAS déclencher un rappel à     │
 * │ 1 h/2 h. Ce nouvel endpoint N'EST PAS encore branché dans vercel.json     │
 * │ (aucune activation en production dans ce lot). Pour l'activer :            │
 * │   - Hobby : 1 cron/jour max => 1 h/2 h non couverts (24 h uniquement) ;   │
 * │   - Pro/Enterprise : ajouter { path:"/api/cron/notifications",            │
 * │       schedule:"*/15 * * * *" } à vercel.json (décision de déploiement).  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sécurité : même garde que le cron existant — en production, Vercel Cron
 * ajoute `Authorization: Bearer <CRON_SECRET>`. Toute requête sans ce jeton est
 * refusée dès qu'un CRON_SECRET est configuré. Le nouvel endpoint est donc
 * protégé au même niveau que l'ancien.
 *
 * Envoi RÉEL désactivé par défaut (voir notificationsRealSendEnabled) : en
 * Preview et tant que NOTIFICATIONS_ENABLED n'est pas « true », le fournisseur
 * est simulé — aucun email réel n'est émis.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
    }
  }

  const result = await processDueNotifications(new Date())
  return NextResponse.json({ ok: true, ...result })
}
