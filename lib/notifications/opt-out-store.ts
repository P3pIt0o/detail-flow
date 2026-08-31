import "server-only"

/**
 * Stockage des oppositions aux demandes d'avis — DÉFENSIF (SQL brut).
 *
 * La table `notification_opt_outs` vit dans la migration additive LOT D. Tant
 * qu'elle n'existe pas : `isReviewOptedOut` renvoie `false` (aucun blocage
 * inattendu) et `recordReviewOptOut` échoue proprement (aucun faux succès).
 *
 * SÉCURITÉ : `companyId` est toujours résolu côté serveur par l'appelant (route
 * de désinscription vérifiant le jeton HMAC). L'email est normalisé.
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { normalizeEmail } from "./opt-out-token"

export async function optOutTableExists(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_opt_outs'`,
    )
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? []
    return rows.length >= 1
  } catch {
    return false
  }
}

/** Le client (email) s'est-il opposé aux demandes d'avis de ce tenant ? */
export async function isReviewOptedOut(companyId: number, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!Number.isInteger(companyId) || companyId <= 0 || !normalized) return false
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM notification_opt_outs
          WHERE "companyId" = ${companyId} AND email = ${normalized} AND type = 'review_request'
          LIMIT 1`,
    )
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? []
    return rows.length >= 1
  } catch {
    // Table absente ou erreur : ne bloque pas (le blocage est ADDITIF, pas une
    // sécurité). Un envoi éventuel reste soumis aux autres gardes.
    return false
  }
}

export type OptOutResult = { ok: boolean; alreadyOptedOut?: boolean; error?: string }

/** Enregistre une opposition (idempotent). Refuse proprement sans migration. */
export async function recordReviewOptOut(companyId: number, email: string): Promise<OptOutResult> {
  const normalized = normalizeEmail(email)
  if (!Number.isInteger(companyId) || companyId <= 0 || !normalized) {
    return { ok: false, error: "Demande invalide." }
  }
  if (!(await optOutTableExists())) {
    return { ok: false, error: "Fonctionnalité indisponible pour le moment." }
  }
  try {
    const res = await db.execute(
      sql`INSERT INTO notification_opt_outs ("companyId", email, type)
          VALUES (${companyId}, ${normalized}, 'review_request')
          ON CONFLICT ("companyId", email, type) DO NOTHING`,
    )
    const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? 0
    return { ok: true, alreadyOptedOut: rowCount === 0 }
  } catch (e) {
    console.log("[v0] recordReviewOptOut error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Erreur lors de l'enregistrement." }
  }
}
