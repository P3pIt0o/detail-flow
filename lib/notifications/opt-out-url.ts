import "server-only"

/**
 * Construit l'URL de désinscription (opposition aux demandes d'avis) portée par
 * l'email client. L'URL contient `c` (companyId), `e` (email) et `t` (jeton
 * HMAC signé avec le secret serveur). Aucun jeton n'est stocké en base : la
 * route de désinscription re-vérifie la signature.
 *
 * Renvoie `null` si le secret ou l'URL de base sont indisponibles (l'email
 * omet alors simplement le lien — jamais de lien cassé).
 */

import { makeOptOutToken, normalizeEmail } from "./opt-out-token"

function baseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_ROOT_DOMAIN || ""
  if (!raw) return null
  const withProto = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
  return withProto.replace(/\/+$/, "")
}

export function buildReviewOptOutUrl(companyId: number, email: string): string | null {
  const secret = process.env.BETTER_AUTH_SECRET
  const base = baseUrl()
  const normalized = normalizeEmail(email)
  if (!secret || !base || !normalized || !Number.isInteger(companyId) || companyId <= 0) return null
  const token = makeOptOutToken(companyId, normalized, secret)
  const params = new URLSearchParams({ c: String(companyId), e: normalized, t: token })
  return `${base}/api/notifications/review-opt-out?${params.toString()}`
}
