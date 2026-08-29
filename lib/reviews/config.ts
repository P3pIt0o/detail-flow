import "server-only"

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/**
 * Configuration de la SOURCE des avis d'un tenant.
 *
 * CHOIX D'ARCHITECTURE (rétrocompatibilité forte) : les colonnes
 * `reviews_source` et `google_place_id` sont AJOUTÉES à la table `settings` par
 * une migration additive fournie séparément (voir
 * `scripts/reviews-source-migration.sql`). Tant que la migration n'est pas
 * appliquée, ce module lit/écrit de manière DÉFENSIVE via SQL brut : si les
 * colonnes n'existent pas encore, la lecture retombe sur "manual" et l'écriture
 * est neutralisée proprement. Ainsi la Preview et la prod actuelle ne cassent
 * jamais, et la fonctionnalité s'active d'elle-même une fois la migration jouée.
 *
 * On n'ajoute PAS ces colonnes au schéma Drizzle (`lib/db/schema.ts`) pour ne
 * pas casser les `SELECT` générés (liste de colonnes explicite) sur une base où
 * la migration n'a pas encore tourné.
 */

export type ReviewsSource = "manual" | "google"

export type ReviewsSourceConfig = {
  source: ReviewsSource
  googlePlaceId: string | null
}

export const DEFAULT_REVIEWS_CONFIG: ReviewsSourceConfig = {
  source: "manual",
  googlePlaceId: null,
}

function normalizeSource(value: unknown): ReviewsSource {
  return value === "google" ? "google" : "manual"
}

/**
 * Lit la config de source d'avis d'un tenant donné.
 * ISOLATION : `companyId` doit provenir d'une résolution SERVEUR vérifiée
 * (jamais directement du navigateur).
 *
 * Défensif : en l'absence des colonnes (migration non jouée) ou de ligne,
 * renvoie la valeur par défaut "manual".
 */
export async function getReviewsSourceConfig(companyId: number): Promise<ReviewsSourceConfig> {
  if (!Number.isInteger(companyId) || companyId <= 0) return DEFAULT_REVIEWS_CONFIG
  try {
    // NOTE : la table `settings` utilise des identifiants camelCase QUOTÉS
    // (`"companyId"`, `"updatedAt"`), tandis que les colonnes ajoutées par la
    // migration sont en snake_case non quoté (`reviews_source`,
    // `google_place_id`). Il FAUT donc quoter `"companyId"` ici, sinon Postgres
    // cherche une colonne `company_id` inexistante et lève une erreur.
    const result = await db.execute(
      sql`SELECT reviews_source, google_place_id FROM settings WHERE "companyId" = ${companyId} LIMIT 1`,
    )
    const row = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    if (!row) return DEFAULT_REVIEWS_CONFIG
    const source = normalizeSource(row.reviews_source)
    const placeId = typeof row.google_place_id === "string" && row.google_place_id.trim() ? row.google_place_id.trim() : null
    return { source, googlePlaceId: placeId }
  } catch (e) {
    // Colonnes absentes (migration non appliquée) ou erreur transitoire :
    // on retombe sur le mode manuel, jamais de crash.
    console.log("[v0] getReviewsSourceConfig fallback manual:", e instanceof Error ? e.message : e)
    return DEFAULT_REVIEWS_CONFIG
  }
}

/** Indique si les colonnes de source d'avis existent déjà (migration jouée). */
export async function reviewsSourceColumnsExist(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'settings' AND column_name IN ('reviews_source', 'google_place_id')`,
    )
    const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []
    return rows.length >= 2
  } catch {
    return false
  }
}

export type SaveReviewsSourceResult = { ok: boolean; error?: string; migrationRequired?: boolean }

/**
 * Écrit la config de source d'avis d'un tenant (écriture SEULEMENT sur la ligne
 * `settings` du tenant fourni). Ne touche jamais aux avis manuels enregistrés.
 *
 * ISOLATION : `companyId` doit être résolu côté serveur par l'appelant.
 */
export async function saveReviewsSourceConfig(
  companyId: number,
  source: ReviewsSource,
  googlePlaceId: string | null,
): Promise<SaveReviewsSourceResult> {
  if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Entreprise invalide." }

  const src = normalizeSource(source)
  const placeId = src === "google" && googlePlaceId?.trim() ? googlePlaceId.trim() : null

  // Garde-fou : passer en Google sans établissement sélectionné est refusé.
  if (src === "google" && !placeId) {
    return { ok: false, error: "Sélectionnez d'abord un établissement Google." }
  }

  if (!(await reviewsSourceColumnsExist())) {
    return {
      ok: false,
      migrationRequired: true,
      error:
        "La configuration de la source des avis nécessite une mise à jour de la base (migration à appliquer par l'administrateur de la plateforme).",
    }
  }

  try {
    // Identifiants camelCase QUOTÉS (`"updatedAt"`, `"companyId"`) : voir la note
    // dans getReviewsSourceConfig. Les colonnes de la migration restent en
    // snake_case non quoté. Écriture strictement limitée à la ligne du tenant
    // (`WHERE "companyId" = ${companyId}`), companyId résolu côté serveur.
    const res = await db.execute(
      sql`UPDATE settings SET reviews_source = ${src}, google_place_id = ${placeId}, "updatedAt" = NOW() WHERE "companyId" = ${companyId}`,
    )
    // Aucune ligne mise à jour => settings du tenant absent : on le signale
    // clairement dans les logs plutôt que de laisser croire à un succès.
    const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? 0
    if (rowCount === 0) {
      console.log("[v0] saveReviewsSourceConfig: aucune ligne settings pour companyId", companyId)
      return { ok: false, error: "Configuration du tenant introuvable." }
    }
    return { ok: true }
  } catch (e) {
    // Log le vrai message (colonne manquante, contrainte, etc.) pour diagnostic,
    // tout en renvoyant un message propre au tenant.
    console.log("[v0] saveReviewsSourceConfig error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Erreur lors de l'enregistrement de la source des avis." }
  }
}
