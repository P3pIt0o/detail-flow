import "server-only"

/**
 * Réglages LOT D (rappel pro + demande d'avis) — lecture/écriture DÉFENSIVE.
 *
 * Même stratégie que lib/reviews/config.ts : les colonnes vivent dans une
 * migration additive séparée (scripts/lot-d-reminders-reviews-migration.sql) et
 * ne sont PAS déclarées dans le schéma Drizzle. On lit/écrit en SQL brut ; si
 * les colonnes n'existent pas encore, la lecture retombe sur « désactivé » et
 * l'écriture d'une ACTIVATION est refusée proprement (aucun faux succès).
 *
 * SÉCURITÉ : `companyId` est TOUJOURS résolu côté serveur par l'appelant
 * (jamais fourni par le navigateur). Les écritures sont strictement scopées à
 * la ligne `settings` du tenant. Le DROIT de licence (email_reminders /
 * review_requests) est vérifié EN PLUS de l'activation du réglage.
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import {
  normalizeReminderOffset,
  normalizeReviewOffset,
  type ReminderOffsetHours,
  type ReviewOffsetHours,
} from "./schedule"
import { validateGoogleReviewLink } from "./review-link"
import {
  evaluateNotificationsSchema,
  LOTD_REQUIRED_COLUMNS,
  LOTD_REQUIRED_UNIQUE_INDEXES,
  type SchemaColumnRow,
  type SchemaIndexRow,
} from "./schema-requirements"

const MIGRATION_REQUIRED_MESSAGE = "Cette automatisation sera disponible après la mise à jour de la base de données."

export type LotDSettings = {
  proReminderEnabled: boolean
  proReminderOffsetHours: ReminderOffsetHours
  reviewRequestEnabled: boolean
  reviewRequestOffsetHours: ReviewOffsetHours
  reviewRequestLink: string | null
}

export const DEFAULT_LOTD_SETTINGS: LotDSettings = {
  proReminderEnabled: false,
  proReminderOffsetHours: 2,
  reviewRequestEnabled: false,
  reviewRequestOffsetHours: 2,
  reviewRequestLink: null,
}

/**
 * SOURCE UNIQUE de disponibilité du LOT D : toutes les colonnes indispensables
 * (settings, bookings.completed_at, notification_outbox, notification_opt_outs)
 * ET les deux index uniques de déduplication. Migration partielle ou erreur de
 * vérification => false (fail-closed).
 */
export async function notificationsSchemaReady(): Promise<boolean> {
  try {
    const tables = Object.keys(LOTD_REQUIRED_COLUMNS)
    const [colsRes, idxRes] = await Promise.all([
      db.execute(
        sql`SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = ANY(current_schemas(false))
            AND table_name IN (${sql.join(tables.map((t) => sql`${t}`), sql`, `)})`,
      ),
      db.execute(
        sql`SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname = ANY(current_schemas(false))
            AND indexname IN (${sql.join(LOTD_REQUIRED_UNIQUE_INDEXES.map((n) => sql`${n}`), sql`, `)})`,
      ),
    ])
    const columns = (colsRes as unknown as { rows?: SchemaColumnRow[] }).rows ?? []
    const indexes = (idxRes as unknown as { rows?: SchemaIndexRow[] }).rows ?? []
    return evaluateNotificationsSchema(columns, indexes)
  } catch {
    return false
  }
}

/**
 * Les colonnes LOT D de `settings` existent-elles ? Sert UNIQUEMENT à la lecture
 * défensive et à la désactivation : ce n'est PAS une preuve que le LOT D est
 * prêt (utiliser notificationsSchemaReady).
 */
export async function lotDColumnsExist(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'settings'
          AND column_name IN ('pro_reminder_enabled','pro_reminder_offset_hours','review_request_enabled','review_request_offset_hours','review_request_link')`,
    )
    const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []
    return rows.length >= 5
  } catch {
    return false
  }
}

/** L'outbox de notifications existe-t-elle déjà (migration appliquée) ? */
export async function notificationOutboxExists(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_outbox'`,
    )
    const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []
    return rows.length >= 1
  } catch {
    return false
  }
}

/**
 * Lit les réglages LOT D d'un tenant. Défensif : colonnes absentes ou ligne
 * absente => valeurs par défaut (tout désactivé). Ne jette jamais.
 */
export async function getLotDSettings(companyId: number): Promise<LotDSettings> {
  if (!Number.isInteger(companyId) || companyId <= 0) return DEFAULT_LOTD_SETTINGS
  try {
    const result = await db.execute(
      sql`SELECT pro_reminder_enabled, pro_reminder_offset_hours,
                 review_request_enabled, review_request_offset_hours, review_request_link
          FROM settings WHERE "companyId" = ${companyId} LIMIT 1`,
    )
    const row = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    if (!row) return DEFAULT_LOTD_SETTINGS
    const link =
      typeof row.review_request_link === "string" && row.review_request_link.trim()
        ? row.review_request_link.trim()
        : null
    return {
      proReminderEnabled: row.pro_reminder_enabled === true,
      proReminderOffsetHours: normalizeReminderOffset(row.pro_reminder_offset_hours),
      reviewRequestEnabled: row.review_request_enabled === true,
      reviewRequestOffsetHours: normalizeReviewOffset(row.review_request_offset_hours),
      reviewRequestLink: link,
    }
  } catch (e) {
    console.error("[notifications] settings_read_fallback", { kind: e instanceof Error ? e.name : "unknown" })
    return DEFAULT_LOTD_SETTINGS
  }
}

export type SaveResult = { ok: boolean; error?: string; migrationRequired?: boolean }

/**
 * Écrit les réglages du rappel pro. ACTIVATION refusée tant que le schéma LOT D
 * complet n'est pas prêt (notificationsSchemaReady). DÉSACTIVATION toujours
 * possible : elle ne dépend ni du schéma complet, ni de l'email pro, ni de la
 * licence (colonnes settings absentes => état par défaut déjà désactivé).
 *
 * Le DROIT de licence est vérifié par l'appelant (action serveur) AVANT d'appeler
 * cette fonction : ici on ne fait que la persistance défensive.
 */
export async function saveProReminderSettings(
  companyId: number,
  enabled: boolean,
  offsetHours: number,
): Promise<SaveResult> {
  if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Entreprise invalide." }
  const offset = normalizeReminderOffset(offsetHours)

  if (enabled) {
    if (!(await notificationsSchemaReady())) {
      return { ok: false, migrationRequired: true, error: MIGRATION_REQUIRED_MESSAGE }
    }
  } else if (!(await lotDColumnsExist())) {
    return { ok: true }
  }

  try {
    const res = await db.execute(
      sql`UPDATE settings
          SET pro_reminder_enabled = ${enabled}, pro_reminder_offset_hours = ${offset}, "updatedAt" = NOW()
          WHERE "companyId" = ${companyId}`,
    )
    const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? 0
    if (rowCount === 0) return { ok: false, error: "Configuration du tenant introuvable." }
    return { ok: true }
  } catch (e) {
    console.error("[notifications] save_pro_settings_error", { companyId, kind: e instanceof Error ? e.name : "unknown" })
    return { ok: false, error: "Erreur lors de l'enregistrement." }
  }
}

/**
 * Écrit les réglages de demande d'avis.
 *
 * DÉSACTIVATION : toujours possible, AVANT toute validation du lien. Seuls
 * `enabled=false` et l'offset sont écrits ; le lien existant est conservé
 * (jamais écrasé par null, jamais refusé parce qu'invalide).
 *
 * ACTIVATION : schéma LOT D complet obligatoire ; lien manuel validé (HTTPS +
 * domaine Google) avant stockage, un lien invalide est refusé. Un champ vide =
 * pas de lien manuel (repli sur un Place ID Google déjà configuré).
 */
export async function saveReviewRequestSettings(
  companyId: number,
  enabled: boolean,
  offsetHours: number,
  manualLink: string | null,
): Promise<SaveResult> {
  if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Entreprise invalide." }
  const offset = normalizeReviewOffset(offsetHours)

  if (!enabled) {
    if (!(await lotDColumnsExist())) return { ok: true }
    try {
      const res = await db.execute(
        sql`UPDATE settings
            SET review_request_enabled = false, "updatedAt" = NOW()
            WHERE "companyId" = ${companyId}`,
      )
      const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? 0
      if (rowCount === 0) return { ok: false, error: "Configuration du tenant introuvable." }
      return { ok: true }
    } catch {
      console.error("[notifications] save_review_settings_error", { companyId })
      return { ok: false, error: "Erreur lors de l'enregistrement." }
    }
  }

  let link: string | null = null
  if (typeof manualLink === "string" && manualLink.trim()) {
    const v = validateGoogleReviewLink(manualLink)
    if (!v.ok) return { ok: false, error: v.error }
    link = v.url
  }

  if (!(await notificationsSchemaReady())) {
    return { ok: false, migrationRequired: true, error: MIGRATION_REQUIRED_MESSAGE }
  }

  try {
    const res = await db.execute(
      sql`UPDATE settings
          SET review_request_enabled = ${enabled}, review_request_offset_hours = ${offset},
              review_request_link = ${link}, "updatedAt" = NOW()
          WHERE "companyId" = ${companyId}`,
    )
    const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? 0
    if (rowCount === 0) return { ok: false, error: "Configuration du tenant introuvable." }
    return { ok: true }
  } catch (e) {
    console.error("[notifications] save_review_settings_error", { companyId, kind: e instanceof Error ? e.name : "unknown" })
    return { ok: false, error: "Erreur lors de l'enregistrement." }
  }
}
