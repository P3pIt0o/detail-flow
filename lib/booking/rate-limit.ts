import "server-only"

import { checkRateLimit } from "@vercel/firewall"

/**
 * Anti-abus de la SOUMISSION FINALE d'une réservation publique
 * (createBookingAction uniquement — jamais devis / disponibilités ; codes promo : voir isPromoRateLimited).
 *
 * Règle Vercel Firewall à créer manuellement, identifiant EXACT :
 * `BOOKING_RATE_LIMIT_ID`. La clé réseau (IP) est gérée par @vercel/firewall.
 *
 * Fail closed en production Vercel réelle (NODE_ENV + VERCEL_ENV = production)
 * si la règle est absente ou le service injoignable. Preview / local : la
 * réservation reste possible sans règle configurée.
 */
export const BOOKING_RATE_LIMIT_ID = "booking-create"

export const BOOKING_RATE_LIMITED_MESSAGE =
  "Nous ne pouvons pas traiter cette réservation pour le moment. Merci de réessayer dans quelques minutes."

export type BookingRateLimitEnv = { NODE_ENV?: string; VERCEL_ENV?: string }

export type FirewallCheck = (id: string, opts: { headers: Headers }) => Promise<{ rateLimited: boolean; error?: string }>

function isRealProduction(env: BookingRateLimitEnv): boolean {
  return env.NODE_ENV === "production" && env.VERCEL_ENV === "production"
}

export async function isBookingRateLimited(
  headers: Headers,
  deps: { check?: FirewallCheck; env?: BookingRateLimitEnv } = {},
): Promise<boolean> {
  const check = deps.check ?? (checkRateLimit as unknown as FirewallCheck)
  const env = deps.env ?? (process.env as BookingRateLimitEnv)
  try {
    const { rateLimited, error } = await check(BOOKING_RATE_LIMIT_ID, { headers })
    if (rateLimited === true || error === "blocked") return true
    if (error) {
      if (isRealProduction(env)) {
        console.error("[booking] anti-abus en erreur — réservation refusée (fail-closed)")
        return true
      }
      return false
    }
    return false
  } catch {
    if (isRealProduction(env)) {
      console.error("[booking] anti-abus indisponible — réservation refusée (fail-closed)")
      return true
    }
    return false
  }
}

/**
 * L24 — limite de la VÉRIFICATION d'un code promo public (validatePromoCodeAction,
 * getQuoteAction avec un code). Règle Vercel Firewall distincte, à créer à la main :
 * `PROMO_RATE_LIMIT_ID`. Limite indisponible (règle absente, erreur) : on laisse
 * passer, y compris en production — un devis n'est jamais bloqué.
 */
export const PROMO_RATE_LIMIT_ID = "booking-promo"

export async function isPromoRateLimited(headers: Headers, deps: { check?: FirewallCheck } = {}): Promise<boolean> {
  const check = deps.check ?? (checkRateLimit as unknown as FirewallCheck)
  try {
    const { rateLimited, error } = await check(PROMO_RATE_LIMIT_ID, { headers })
    return rateLimited === true || error === "blocked"
  } catch {
    return false
  }
}
