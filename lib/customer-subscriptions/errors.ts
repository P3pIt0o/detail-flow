/**
 * Codes métier STABLES du module abonnements clients. L'UI traduit ces codes ;
 * la couche métier ne produit jamais de phrase destinée au tenant.
 */
export const CUSTOMER_SUBSCRIPTION_ERROR_CODES = [
  "FEATURE_DISABLED",
  "LIMIT_REACHED",
  "FORBIDDEN",
  "INVALID_PLAN",
  "PLAN_NOT_ACTIVE",
  "SERVICE_NOT_FOUND",
  "CLIENT_NOT_FOUND",
  "STRIPE_NOT_CONNECTED",
  "PAYMENTS_DISABLED",
  "INVALID_INTERVAL",
  "INVALID_COMMITMENT",
  "INVALID_RENEWAL",
  "INVALID_PAYMENT_MODE",
  "INVALID_VEHICLE",
  "INVALID_CUSTOMER",
  "INVALID_REASON",
  "SUBSCRIPTION_NOT_FOUND",
  "SUBSCRIPTION_NOT_MUTABLE",
  "SUBSCRIPTION_NOT_USABLE",
  "PAST_DUE",
  "ALREADY_CANCELLED",
  "PLAN_CHANGE_NOT_SUPPORTED",
  "CONFLICT",
  "CHECKOUT_NOT_ALLOWED",
  "CHECKOUT_ALREADY_COMPLETED",
  "INITIAL_CLEANING_PAYMENT_REQUIRED",
  "INVALID_RETURN_URL",
  "CHECKOUT_CONFLICT",
  "PROVIDER_ERROR",
  // Donnée Stripe indispensable momentanément indisponible : retriable (webhook → 500).
  "PROVIDER_DATA_UNAVAILABLE",
  // Demandes d'abonnement (mode « request »).
  "REQUESTS_DISABLED",
  "PLAN_NOT_AVAILABLE",
  "NOT_ACCEPTING_REQUESTS",
  "INVALID_SUBMISSION",
  "INVALID_MESSAGE",
  "RATE_LIMITED",
  "REQUEST_NOT_FOUND",
  "REQUEST_NOT_PENDING",
  "EARLY_CANCELLATION_MANUAL_REVIEW",
  "PLAN_CHANGED_REQUIRES_CONFIRMATION",
  "INTERNAL_ERROR",
] as const

export type CustomerSubscriptionErrorCode = (typeof CUSTOMER_SUBSCRIPTION_ERROR_CODES)[number]

export type FieldIssue = { field: string; code: CustomerSubscriptionErrorCode }

export class CustomerSubscriptionError extends Error {
  readonly code: CustomerSubscriptionErrorCode
  readonly issues: FieldIssue[]
  get planChangedSinceRequest(): boolean { return this.code === "PLAN_CHANGED_REQUIRES_CONFIRMATION" }

  constructor(code: CustomerSubscriptionErrorCode, issues: FieldIssue[] = []) {
    super(code)
    this.name = "CustomerSubscriptionError"
    this.code = code
    this.issues = issues
  }
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: CustomerSubscriptionErrorCode; issues?: FieldIssue[]; planChangedSinceRequest?: boolean }

/** Convertit toute erreur en résultat sérialisable (aucun détail interne exposé). */
export function toErrorResult(error: unknown): { ok: false; code: CustomerSubscriptionErrorCode; issues?: FieldIssue[]; planChangedSinceRequest?: boolean } {
  if (error instanceof CustomerSubscriptionError) {
    if (error.planChangedSinceRequest) return { ok: false, code: error.code, planChangedSinceRequest: true }
    return error.issues.length ? { ok: false, code: error.code, issues: error.issues } : { ok: false, code: error.code }
  }
  // Violation d'unicité Postgres (course perdue, clé d'idempotence, ID externe).
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
    return { ok: false, code: "CONFLICT" }
  }
  return { ok: false, code: "INTERNAL_ERROR" }
}
