/**
 * Socle central des licences DetailFlow — TYPES & CONSTANTES.
 *
 * Fichier PUR (aucun import serveur / DB) : importable côté serveur, dans les
 * tests, et pour un affichage sûr. Toutes les valeurs autorisées sont des
 * constantes `as const` doublées de type-guards utilisés pour la validation
 * stricte des entrées (aucune valeur du navigateur n'est jamais fiable).
 */

/* ------------------------------- Plans ----------------------------------- */

export const LICENSE_PLANS = ["FREE", "ESSENTIAL", "PRO", "BUSINESS", "FOUNDER"] as const
export type LicensePlan = (typeof LICENSE_PLANS)[number]

/* ---------------------------- Générations -------------------------------- */
// Extensible plus tard à "SUBSCRIPTION_V2" (NON implémenté dans cette étape).
export const LICENSE_GENERATIONS = ["LIFETIME_V1"] as const
export type LicenseGeneration = (typeof LICENSE_GENERATIONS)[number]

/* ---------------------------- Fonctionnalités ---------------------------- */

export const FEATURE_KEYS = [
  "website",
  "online_booking",
  "online_payments",
  "sms",
  "automations",
  // LOT D — automatisations orientées client, features dédiées (accordées à
  // PRO/BUSINESS/FOUNDER). Séparées de `automations` pour une répartition fine.
  "email_reminders",
  "review_requests",
  "business_stats",
  "expense_management",
  "profitability_analysis",
  "advanced_reporting",
  "marketing",
  "early_access",
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

/* -------------------------------- Limites -------------------------------- */

export const LIMIT_KEYS = ["maxCustomers", "maxVehicles", "maxQuotesPerMonth", "maxInvoicesPerMonth"] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** `null` = illimité (convention explicite, aucune valeur magique type 999999). */
export type LimitValue = number | null

/* ---------------------------- États d'override --------------------------- */
// INHERIT n'est jamais persisté en base : c'est l'ABSENCE de ligne d'override.
export const OVERRIDE_STATES = ["INHERIT", "ENABLED", "DISABLED"] as const
export type OverrideState = (typeof OVERRIDE_STATES)[number]

/** États réellement stockables (INHERIT = suppression de l'override). */
export const STORED_OVERRIDE_STATES = ["ENABLED", "DISABLED"] as const
export type StoredOverrideState = (typeof STORED_OVERRIDE_STATES)[number]

/* --------------------------- Origines d'override ------------------------- */

export const OVERRIDE_SOURCES = [
  "PURCHASED",
  "GIFT",
  "TRIAL",
  "FOUNDER",
  "COMMERCIAL_GESTURE",
  "MANUAL",
] as const
export type OverrideSource = (typeof OVERRIDE_SOURCES)[number]

/* ------------------------------ Audit log -------------------------------- */

export const LICENSE_AUDIT_ACTIONS = [
  "LICENSE_CHANGED",
  "FEATURE_ENABLED",
  "FEATURE_DISABLED",
  "FEATURE_TRIAL_STARTED",
  "FEATURE_OVERRIDE_REMOVED",
] as const
export type LicenseAuditAction = (typeof LICENSE_AUDIT_ACTIONS)[number]

/* ------------------------------ Type guards ------------------------------ */
// Utilisés pour REJETER toute valeur arbitraire venant du client.

export function isLicensePlan(v: unknown): v is LicensePlan {
  return typeof v === "string" && (LICENSE_PLANS as readonly string[]).includes(v)
}
export function isLicenseGeneration(v: unknown): v is LicenseGeneration {
  return typeof v === "string" && (LICENSE_GENERATIONS as readonly string[]).includes(v)
}
export function isFeatureKey(v: unknown): v is FeatureKey {
  return typeof v === "string" && (FEATURE_KEYS as readonly string[]).includes(v)
}
export function isLimitKey(v: unknown): v is LimitKey {
  return typeof v === "string" && (LIMIT_KEYS as readonly string[]).includes(v)
}
export function isOverrideState(v: unknown): v is OverrideState {
  return typeof v === "string" && (OVERRIDE_STATES as readonly string[]).includes(v)
}
export function isOverrideSource(v: unknown): v is OverrideSource {
  return typeof v === "string" && (OVERRIDE_SOURCES as readonly string[]).includes(v)
}
