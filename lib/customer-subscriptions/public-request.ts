import "server-only"
import { checkRateLimit } from "@vercel/firewall"
import type { Executor } from "./engine"
import { toErrorResult, type CustomerSubscriptionErrorCode } from "./errors"
import { createPublicSubscriptionRequest } from "./requests"

/**
 * Cœur testable de la soumission publique d'une demande d'abonnement.
 *
 * Seuls planId, coordonnées, véhicule, message et submissionId sont lus dans
 * le corps : tout autre champ (companyId, priceCents, currency,
 * providerAccountId, platformFeeBps, returnUrl, status…) est IGNORÉ. Le tenant
 * vient exclusivement de `resolveCompanyId` (en-tête x-tenant-slug réécrit par
 * le middleware).
 *
 * Deux barrières anti-abus : rate limit réseau (Vercel Firewall, par IP,
 * fail-closed en production) puis quotas DB par (tenant, email) et par tenant.
 * Réponse volontairement générique : aucune énumération de formules/tenants.
 */
export const SUBSCRIPTION_REQUEST_RATE_LIMIT_ID = "subscription-request-form"

export type PublicRequestDeps = {
  db: Executor
  resolveCompanyId: () => Promise<number | null>
  checkRateLimit: () => Promise<{ limited: boolean }>
  now?: () => Date
}

export type PublicRequestResponse =
  | { ok: true; requestId: number }
  | { ok: false; code: CustomerSubscriptionErrorCode | "RATE_LIMITED" | "NOT_FOUND"; issues?: { field: string; code: string }[] }

/** Extrait strictement les champs autorisés (allowlist). */
export function pickAllowedRequestFields(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const c = (b.customer && typeof b.customer === "object" ? b.customer : {}) as Record<string, unknown>
  const v = (b.vehicle && typeof b.vehicle === "object" ? b.vehicle : {}) as Record<string, unknown>
  return {
    planId: b.planId,
    customer: { name: c.name, email: c.email, phone: c.phone },
    vehicle: { brand: v.brand, model: v.model, plate: v.plate, typeName: v.typeName } as never,
    message: b.message,
    submissionId: b.submissionId,
  }
}

export async function runSubmitSubscriptionRequest(body: unknown, deps: PublicRequestDeps): Promise<PublicRequestResponse> {
  const companyId = await deps.resolveCompanyId()
  if (!companyId) return { ok: false, code: "NOT_FOUND" }
  if ((await deps.checkRateLimit()).limited) return { ok: false, code: "RATE_LIMITED" }
  try {
    const result = await createPublicSubscriptionRequest(deps.db, companyId, pickAllowedRequestFields(body), deps.now?.() ?? new Date())
    // Rejeu (même submissionId / doublon en attente) : même réponse qu'une création.
    return { ok: true, requestId: result.requestId }
  } catch (error) {
    const r = toErrorResult(error)
    if (r.code === "INTERNAL_ERROR") console.log("[customer-subscriptions] public request failed", { companyId })
    return r
  }
}

/** Rate limit Firewall (par IP). Fail-closed en production, permissif en dev local. */
export async function checkSubscriptionRequestRateLimit(headers: Headers): Promise<{ limited: boolean }> {
  try {
    const { rateLimited, error } = await checkRateLimit(SUBSCRIPTION_REQUEST_RATE_LIMIT_ID, { headers })
    if (error === "blocked") return { limited: true }
    if (error === "not-found") return { limited: process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production" }
    return { limited: Boolean(rateLimited) }
  } catch {
    return { limited: process.env.NODE_ENV === "production" }
  }
}
