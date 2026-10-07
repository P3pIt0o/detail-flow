import "server-only"

/**
 * Construit l'URL de désinscription (opposition aux demandes d'avis) portée par
 * l'email client. L'URL contient `c` (companyId), `e` (email) et `t` (jeton
 * HMAC signé avec le secret serveur). Aucun jeton n'est stocké en base : la
 * route de désinscription re-vérifie la signature.
 *
 * Renvoie `null` si le secret ou l'origine HTTPS publique sont indisponibles.
 * Dans ce cas la demande d'avis N'EST PAS envoyée (fail-closed : état « failed »
 * réessayable, reason « opt_out_url_unavailable ») — jamais d'email sans lien
 * de désinscription.
 */

import { makeOptOutToken, normalizeEmail } from "./opt-out-token"
import { resolvePublicBaseUrl } from "./runtime"

export function buildReviewOptOutUrl(companyId: number, email: string): string | null {
  const secret = process.env.BETTER_AUTH_SECRET
  const base = resolvePublicBaseUrl()
  const normalized = normalizeEmail(email)
  if (!secret || !secret.trim() || !base || !normalized || !Number.isInteger(companyId) || companyId <= 0) return null
  const token = makeOptOutToken(companyId, normalized, secret)
  const params = new URLSearchParams({ c: String(companyId), e: normalized, t: token })
  return `${base}/api/notifications/review-opt-out?${params.toString()}`
}
