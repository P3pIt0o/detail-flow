/**
 * DetailFlow — Garde-fous d'environnement du Checkout Lifetime (hotfix S3A).
 *
 * Évalués AVANT toute réservation DB, toute lecture d'allocation et tout
 * appel Stripe. Toute ambiguïté = refus. Aucun secret dans les messages.
 * Seul I/O : la lecture (injectée) du marqueur de base, en lecture seule.
 */

import { detectStripeMode } from "./stripe-setup"

type Env = Record<string, string | undefined>

export type LifetimeEnvironmentGuardCode =
  | "NOT_PREVIEW"
  | "STRIPE_KEY_INVALID"
  | "STRIPE_NOT_TEST"
  | "DATABASE_MARKER_UNREADABLE"
  | "DATABASE_MARKER_MISSING"
  | "DATABASE_MARKER_MISMATCH"
  | "LIVE_CHECKOUT_DISABLED"

export class LifetimeEnvironmentGuardError extends Error {
  constructor(
    public readonly code: LifetimeEnvironmentGuardCode,
    message: string,
  ) {
    super(message)
    this.name = "LifetimeEnvironmentGuardError"
  }
}

/** Valeur exacte exigée dans `detailflow_environment_guard.environment`. */
export const LIFETIME_PREVIEW_DATABASE_MARKER = "preview-lifetime"

/**
 * Requête SQL (lecture seule) de la table marqueur créée manuellement,
 * uniquement sur la branche Neon Preview dédiée. L'application ne crée
 * jamais cette table : absente (Production) => erreur SQL => refus.
 */
export const LIFETIME_DATABASE_MARKER_SQL =
  "SELECT environment FROM detailflow_environment_guard LIMIT 1"

/**
 * Outil de test Preview, contrôles A et B (purs, sans I/O) :
 * VERCEL_ENV=preview exact + clé Stripe TEST (sk_test_ / rk_test_).
 */
export function assertLifetimePreviewTestEnvironment(env: Env): void {
  if (env.VERCEL_ENV !== "preview") {
    throw new LifetimeEnvironmentGuardError("NOT_PREVIEW", "Outil réservé aux déploiements Vercel Preview.")
  }

  let mode: "TEST" | "LIVE"
  try {
    mode = detectStripeMode(env.STRIPE_SECRET_KEY)
  } catch {
    throw new LifetimeEnvironmentGuardError("STRIPE_KEY_INVALID", "Clé Stripe serveur absente ou invalide.")
  }
  if (mode !== "TEST") {
    throw new LifetimeEnvironmentGuardError("STRIPE_NOT_TEST", "Clé Stripe LIVE refusée dans l'outil de test.")
  }

}

/**
 * Contrôle C : la base PostgreSQL elle-même doit contenir la table
 * `detailflow_environment_guard` avec la ligne `'preview-lifetime'`.
 * `readMarker` exécute LIFETIME_DATABASE_MARKER_SQL (lecture seule).
 * Table absente / erreur SQL, aucune ligne, NULL, vide ou différent = refus.
 */
export async function assertLifetimePreviewDatabaseMarker(
  readMarker: () => Promise<string | null | undefined>,
): Promise<void> {
  let marker: string | null | undefined
  try {
    marker = await readMarker()
  } catch {
    throw new LifetimeEnvironmentGuardError("DATABASE_MARKER_UNREADABLE", "Marqueur de base illisible.")
  }
  if (marker === null || marker === undefined || marker === "") {
    throw new LifetimeEnvironmentGuardError("DATABASE_MARKER_MISSING", "Base sans marqueur detailflow_environment_guard.")
  }
  if (marker !== LIFETIME_PREVIEW_DATABASE_MARKER) {
    throw new LifetimeEnvironmentGuardError(
      "DATABASE_MARKER_MISMATCH",
      `Marqueur de base inattendu (${String(marker).slice(0, 64)}).`,
    )
  }
}

/**
 * Checkout Lifetime général : tant que la vente LIVE n'est pas ouverte,
 * aucun Checkout en Production ni avec une clé LIVE sans opt-in explicite
 * LIFETIME_LIVE_CHECKOUT_ENABLED === "true". Clé absente/inconnue = refus.
 */
export function assertLifetimeLiveCheckoutAllowed(env: Env): void {
  let mode: "TEST" | "LIVE"
  try {
    mode = detectStripeMode(env.STRIPE_SECRET_KEY)
  } catch {
    throw new LifetimeEnvironmentGuardError("STRIPE_KEY_INVALID", "Clé Stripe serveur absente ou invalide.")
  }
  const isLiveContext = env.VERCEL_ENV === "production" || mode === "LIVE"
  if (isLiveContext && env.LIFETIME_LIVE_CHECKOUT_ENABLED !== "true") {
    throw new LifetimeEnvironmentGuardError("LIVE_CHECKOUT_DISABLED", "La vente Lifetime LIVE n'est pas ouverte.")
  }
}
