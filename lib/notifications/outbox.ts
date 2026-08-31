import "server-only"

/**
 * Traitement DURABLE des notifications LOT D (rappel pro + demande d'avis).
 *
 * Stratégie (calquée sur l'idempotence durable des emails de paiement déjà en
 * place) : la passe cron sélectionne dynamiquement les candidats ENCORE valides
 * (statut, réglage activé, licence, fenêtre d'envoi), puis RÉCLAME chaque envoi
 * de façon atomique dans `notification_outbox` avant d'appeler le fournisseur.
 *
 * Propriétés garanties :
 *  - Anti-doublon : l'index unique (companyId, bookingId, type) + le claim
 *    atomique empêchent deux crons concurrents d'envoyer deux fois.
 *  - Invalidation automatique : annulation / report / désactivation / perte de
 *    licence => la réservation n'est plus candidate (requête « live ») => rien
 *    n'est envoyé. Aucune ligne à nettoyer.
 *  - Anti-rétroactif : une fenêtre d'envoi manquée est marquée « skipped »
 *    (jamais rattrapée), donc aucun envoi massif en cas d'activation tardive.
 *  - Reprise sur erreur : un envoi « failed » est réessayable au passage suivant ;
 *    un « sent »/« simulated » ne l'est jamais.
 *  - Opposition : un client opposé aux demandes d'avis est marqué « skipped ».
 *
 * Tant que la migration LOT D n'est pas appliquée, tout est un no-op sûr.
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { canUseFeature } from "@/lib/licensing/enforce"
import {
  normalizeReminderOffset,
  normalizeReviewOffset,
  reminderSendAt,
  reviewSendAt,
  sendWindowState,
  tenantLocalToInstant,
} from "./schedule"
import { notificationOutboxExists, lotDColumnsExist } from "./settings-store"
import { resolveTenantReviewLink } from "./review-resolver"
import { isReviewOptedOut } from "./opt-out-store"
import { buildReviewOptOutUrl } from "./opt-out-url"
import { sendProReminderEmail, sendReviewRequestEmail, type NotificationOutcome } from "@/lib/email/notifications"

type NotificationType = "pro_reminder" | "review_request"

function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[]
}

/** Format YYYY-MM-DD d'un instant (UTC) décalé de `days` jours. */
function ymd(base: Date, days = 0): string {
  const d = new Date(base.getTime() + days * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/**
 * Réclame atomiquement l'envoi (companyId, bookingId, type). Renvoie l'id de
 * ligne si réclamé (nouvelle tâche OU reprise d'un précédent « failed »), sinon
 * `null` (déjà envoyé/simulé/ignoré/en cours, ou concurrent gagnant).
 */
async function claim(
  companyId: number,
  bookingId: number,
  type: NotificationType,
  recipient: string,
  sendAt: Date,
): Promise<number | null> {
  try {
    const res = await db.execute(sql`
      INSERT INTO notification_outbox
        ("companyId", "bookingId", type, recipient, status, send_at, attempts, created_at, updated_at)
      VALUES (${companyId}, ${bookingId}, ${type}, ${recipient}, 'sending', ${sendAt.toISOString()}, 1, NOW(), NOW())
      ON CONFLICT ("companyId", "bookingId", type) DO UPDATE
        SET status = 'sending', recipient = EXCLUDED.recipient, send_at = EXCLUDED.send_at,
            attempts = notification_outbox.attempts + 1, updated_at = NOW()
        WHERE notification_outbox.status = 'failed'
      RETURNING id`)
    const row = rowsOf<{ id: number }>(res)[0]
    return row ? Number(row.id) : null
  } catch (e) {
    console.log("[notifications] claim error:", e instanceof Error ? e.message : e)
    return null
  }
}

/** Fige l'état final d'une ligne réclamée. */
async function mark(id: number, outcome: NotificationOutcome): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE notification_outbox
      SET status = ${outcome.state}, provider_message_id = ${outcome.providerMessageId ?? null},
          reason = ${outcome.reason ?? null}, updated_at = NOW()
      WHERE id = ${id}`)
  } catch (e) {
    console.log("[notifications] mark error:", e instanceof Error ? e.message : e)
  }
}

/**
 * Enregistre un « skip » TERMINAL (fenêtre manquée, opposition, destinataire
 * absent) : évite de ré-évaluer indéfiniment le même cas. N'écrase jamais un
 * état terminal de succès.
 */
async function recordSkip(
  companyId: number,
  bookingId: number,
  type: NotificationType,
  recipient: string,
  reason: string,
  sendAt: Date | null,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO notification_outbox
        ("companyId", "bookingId", type, recipient, status, send_at, reason, created_at, updated_at)
      VALUES (${companyId}, ${bookingId}, ${type}, ${recipient}, 'skipped', ${sendAt ? sendAt.toISOString() : null}, ${reason}, NOW(), NOW())
      ON CONFLICT ("companyId", "bookingId", type) DO UPDATE
        SET status = 'skipped', reason = ${reason}, updated_at = NOW()
        WHERE notification_outbox.status NOT IN ('sent', 'simulated', 'sending')`)
  } catch (e) {
    console.log("[notifications] recordSkip error:", e instanceof Error ? e.message : e)
  }
}

export type PassResult = { candidates: number; sent: number; simulated: number; failed: number; skipped: number }

const EMPTY: PassResult = { candidates: 0, sent: 0, simulated: 0, failed: 0, skipped: 0 }

function tally(acc: PassResult, o: NotificationOutcome) {
  if (o.state === "sent") acc.sent += 1
  else if (o.state === "simulated") acc.simulated += 1
  else acc.failed += 1
}

/* ----------------------------- Passe rappels pro ----------------------------- */

async function processProReminders(now: Date): Promise<PassResult> {
  const acc: PassResult = { ...EMPTY }
  const enabled = rowsOf<{ company_id: number; business_email: string | null; offset_hours: number; timezone: string | null }>(
    await db.execute(sql`
      SELECT s."companyId" AS company_id, s."businessEmail" AS business_email,
             s.pro_reminder_offset_hours AS offset_hours, c.timezone AS timezone
      FROM settings s JOIN companies c ON c.id = s."companyId"
      WHERE s.pro_reminder_enabled = true`),
  )
  if (enabled.length === 0) return acc

  // Licence évaluée UNE fois par tenant (LEGACY => autorisé).
  const licensed = (await Promise.all(enabled.map((e) => canUseFeature(e.company_id, "email_reminders"))))
    .map((ok, i) => (ok ? enabled[i] : null))
    .filter((e): e is (typeof enabled)[number] => e !== null)
  if (licensed.length === 0) return acc

  const byCompany = new Map(licensed.map((e) => [e.company_id, e]))
  const companyIds = licensed.map((e) => e.company_id)

  // Fenêtre bornée [aujourd'hui-1 ; aujourd'hui+2] (anti-scan). La fenêtre exacte
  // par réservation est décidée ensuite via sendWindowState.
  const from = ymd(now, -1)
  const to = ymd(now, 2)
  const candidates = rowsOf<{ id: number; company_id: number; date: string; start_time: string }>(
    await db.execute(sql`
      SELECT id, "companyId" AS company_id, date::text AS date, "startTime" AS start_time
      FROM bookings
      WHERE status = 'confirmed' AND date >= ${from} AND date <= ${to}
        AND "companyId" IN (${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)})`),
  )
  acc.candidates = candidates.length

  for (const b of candidates) {
    const cfg = byCompany.get(b.company_id)
    if (!cfg) continue
    const tz = cfg.timezone || "Europe/Paris"
    const appt = tenantLocalToInstant(b.date, b.start_time, tz)
    if (!appt) continue
    const offset = normalizeReminderOffset(cfg.offset_hours)
    const sendAt = reminderSendAt(appt, offset)
    const recipient = (cfg.business_email ?? "").trim()

    // Jamais après le début du RDV.
    if (now.getTime() >= appt.getTime()) {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "pro_reminder", recipient || "—", "started", sendAt)
      continue
    }
    const win = sendWindowState(now, sendAt)
    if (win === "early") continue
    if (win === "missed") {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "pro_reminder", recipient || "—", "missed_window", sendAt)
      continue
    }
    if (!recipient) {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "pro_reminder", "—", "no_recipient", sendAt)
      continue
    }
    const id = await claim(b.company_id, b.id, "pro_reminder", recipient, sendAt)
    if (id == null) continue // déjà traité / concurrent
    const outcome = await sendProReminderEmail(b.id)
    await mark(id, outcome)
    tally(acc, outcome)
  }
  return acc
}

/* --------------------------- Passe demandes d'avis --------------------------- */

async function processReviewRequests(now: Date): Promise<PassResult> {
  const acc: PassResult = { ...EMPTY }
  const enabled = rowsOf<{ company_id: number; offset_hours: number }>(
    await db.execute(sql`
      SELECT s."companyId" AS company_id, s.review_request_offset_hours AS offset_hours
      FROM settings s WHERE s.review_request_enabled = true`),
  )
  if (enabled.length === 0) return acc

  const licensed = (await Promise.all(enabled.map((e) => canUseFeature(e.company_id, "review_requests"))))
    .map((ok, i) => (ok ? enabled[i] : null))
    .filter((e): e is (typeof enabled)[number] => e !== null)
  if (licensed.length === 0) return acc

  // Lien d'avis résolu UNE fois par tenant. Sans lien => on n'envoie rien (et on
  // n'invente jamais de fiche/Place ID).
  const linkByCompany = new Map<number, string>()
  const offsetByCompany = new Map<number, number>()
  for (const e of licensed) {
    offsetByCompany.set(e.company_id, normalizeReviewOffset(e.offset_hours))
    const link = await resolveTenantReviewLink(e.company_id)
    if (link) linkByCompany.set(e.company_id, link)
  }
  const companyIds = [...linkByCompany.keys()]
  if (companyIds.length === 0) return acc

  // Fenêtre bornée : prestations terminées dans les 3 derniers jours.
  const sinceTs = new Date(now.getTime() - 3 * 86400000).toISOString()
  const candidates = rowsOf<{ id: number; company_id: number; completed_at: string; customer_email: string }>(
    await db.execute(sql`
      SELECT id, "companyId" AS company_id, completed_at, "customerEmail" AS customer_email
      FROM bookings
      WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at >= ${sinceTs}
        AND "companyId" IN (${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)})`),
  )
  acc.candidates = candidates.length

  for (const b of candidates) {
    const reviewUrl = linkByCompany.get(b.company_id)
    if (!reviewUrl) continue
    const offset = offsetByCompany.get(b.company_id) ?? 2
    const completedAt = new Date(b.completed_at)
    const sendAt = reviewSendAt(completedAt, offset)
    const recipient = (b.customer_email ?? "").trim()

    const win = sendWindowState(now, sendAt)
    if (win === "early") continue
    if (win === "missed") {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "review_request", recipient || "—", "missed_window", sendAt)
      continue
    }
    if (!recipient) {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "review_request", "—", "no_recipient", sendAt)
      continue
    }
    // Respect des oppositions.
    if (await isReviewOptedOut(b.company_id, recipient)) {
      acc.skipped += 1
      await recordSkip(b.company_id, b.id, "review_request", recipient, "opted_out", sendAt)
      continue
    }
    const id = await claim(b.company_id, b.id, "review_request", recipient, sendAt)
    if (id == null) continue
    const optOutUrl = buildReviewOptOutUrl(b.company_id, recipient)
    const outcome = await sendReviewRequestEmail(b.id, { reviewUrl, optOutUrl })
    await mark(id, outcome)
    tally(acc, outcome)
  }
  return acc
}

export type ProcessResult = {
  ran: boolean
  reason?: string
  proReminders: PassResult
  reviewRequests: PassResult
}

/**
 * Point d'entrée de la passe cron. No-op sûr tant que la migration LOT D n'est
 * pas appliquée (colonnes/outbox absentes).
 */
export async function processDueNotifications(now: Date = new Date()): Promise<ProcessResult> {
  const [colsOk, outboxOk] = await Promise.all([lotDColumnsExist(), notificationOutboxExists()])
  if (!colsOk || !outboxOk) {
    return { ran: false, reason: "migration_pending", proReminders: { ...EMPTY }, reviewRequests: { ...EMPTY } }
  }
  const proReminders = await processProReminders(now)
  const reviewRequests = await processReviewRequests(now)
  return { ran: true, proReminders, reviewRequests }
}
