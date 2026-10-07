/**
 * Exigences de schéma du LOT D (fichier PUR, testable).
 *
 * Une migration PARTIELLE ne doit jamais rendre l'automatisation disponible :
 * chaque colonne indispensable ET chaque index unique de déduplication doivent
 * être présents. `CREATE TABLE IF NOT EXISTS` ne répare pas une table partielle,
 * d'où la vérification colonne par colonne.
 */

export const LOTD_REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  settings: [
    "pro_reminder_enabled",
    "pro_reminder_offset_hours",
    "review_request_enabled",
    "review_request_offset_hours",
    "review_request_link",
  ],
  bookings: ["completed_at"],
  notification_outbox: [
    "id",
    "companyId",
    "bookingId",
    "type",
    "recipient",
    "status",
    "send_at",
    "provider_message_id",
    "reason",
    "attempts",
    "created_at",
    "updated_at",
  ],
  notification_opt_outs: ["id", "companyId", "email", "type", "created_at"],
}

export const LOTD_REQUIRED_UNIQUE_INDEXES = ["notification_outbox_dedup_idx", "notification_opt_outs_uniq_idx"] as const

export type SchemaColumnRow = { table_name: string; column_name: string }
export type SchemaIndexRow = { indexname: string; indexdef: string }

export function evaluateNotificationsSchema(columns: SchemaColumnRow[], indexes: SchemaIndexRow[]): boolean {
  const present = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`))
  for (const [table, cols] of Object.entries(LOTD_REQUIRED_COLUMNS)) {
    for (const col of cols) if (!present.has(`${table}.${col}`)) return false
  }
  for (const name of LOTD_REQUIRED_UNIQUE_INDEXES) {
    const idx = indexes.find((i) => i.indexname === name)
    if (!idx || !/\bUNIQUE\b/i.test(idx.indexdef ?? "")) return false
  }
  return true
}
