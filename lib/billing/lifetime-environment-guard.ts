/**
 * DetailFlow — Garde-fous d'environnement du Checkout Lifetime (hotfix S3A).
 *
 * Fonctions PURES (aucun I/O) évaluées AVANT toute réservation DB, toute
 * lecture d'allocation et tout appel Stripe. Toute ambiguïté = refus.
 * Aucun secret n'est jamais inclus dans les messages : au plus un hostname.
 */

import { detectStripeMode } from "./stripe-setup"

type Env = Record<string, string | undefined>

export type LifetimeEnvironmentGuardCode =
  | "NOT_PREVIEW"
  | "STRIPE_KEY_INVALID"
  | "STRIPE_NOT_TEST"
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_UNPARSABLE"
  | "PREVIEW_DATABASE_HOST_MISSING"
  | "DATABASE_HOST_MISMATCH"
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

/** Hostname d'une URL Postgres, sans jamais exposer user/password. */
export function extractDatabaseHostname(databaseUrl: string | undefined): string {
  const raw = typeof databaseUrl === "string" ? databaseUrl.trim() : ""
  if (!raw) throw new LifetimeEnvironmentGuardError("DATABASE_URL_MISSING", "DATABASE_URL absente.")
  let hostname: string
  try {
    hostname = new URL(raw).hostname
  } catch {
    throw new LifetimeEnvironmentGuardError("DATABASE_URL_UNPARSABLE", "DATABASE_URL illisible.")
  }
  if (!hostname) throw new LifetimeEnvironmentGuardError("DATABASE_URL_UNPARSABLE", "DATABASE_URL sans hostname.")
  return hostname.toLowerCase()
}

/**
 * Outil de test Preview : exige VERCEL_ENV=preview, une clé Stripe TEST et
 * une DATABASE_URL dont le hostname est EXACTEMENT LIFETIME_PREVIEW_DATABASE_HOST.
 * Renvoie le hostname validé (loggable).
 */
export function assertLifetimePreviewTestEnvironment(env: Env): { databaseHost: string } {
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

  const expected = (env.LIFETIME_PREVIEW_DATABASE_HOST ?? "").trim().toLowerCase()
  if (!expected) {
    throw new LifetimeEnvironmentGuardError(
      "PREVIEW_DATABASE_HOST_MISSING",
      "LIFETIME_PREVIEW_DATABASE_HOST absente.",
    )
  }
  const actual = extractDatabaseHostname(env.DATABASE_URL)
  if (actual !== expected) {
    throw new LifetimeEnvironmentGuardError(
      "DATABASE_HOST_MISMATCH",
      `Base de données inattendue (hostname ${actual}).`,
    )
  }
  return { databaseHost: actual }
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
