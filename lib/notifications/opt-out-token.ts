import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Jetons d'opposition aux demandes d'avis (LOT D — « respect des oppositions »).
 *
 * Fichier PUR (le secret est passé en argument) : le lien de désinscription
 * présent dans l'email de demande d'avis porte `companyId` + email + un jeton
 * HMAC. Le jeton prouve que le lien a bien été émis par DetailFlow pour CE
 * couple (entreprise, email) — impossible à forger sans le secret, et on ne
 * stocke aucun jeton en base.
 *
 * On ne journalise jamais le secret ni le jeton.
 */

/** Normalise un email pour une comparaison/clé stable (minuscule, sans espaces). */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

/** Message signé : lie le jeton au tenant ET à l'email (anti-réutilisation croisée). */
function payload(companyId: number, email: string): string {
  return `review-opt-out:${companyId}:${normalizeEmail(email)}`
}

/** Génère un jeton d'opposition (base64url tronqué, suffisant contre le forgeage). */
export function makeOptOutToken(companyId: number, email: string, secret: string): string {
  return createHmac("sha256", secret).update(payload(companyId, email)).digest("base64url").slice(0, 32)
}

/** Vérifie un jeton d'opposition en temps constant (jamais de fuite par timing). */
export function verifyOptOutToken(
  companyId: number,
  email: string,
  token: string | null | undefined,
  secret: string,
): boolean {
  if (typeof token !== "string" || !token) return false
  const expected = makeOptOutToken(companyId, email, secret)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
