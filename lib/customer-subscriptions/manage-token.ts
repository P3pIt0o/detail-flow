import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const TOKEN_BYTES = 32

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Lien de gestion client : 32 octets CSPRNG (base64url). Seul le SHA-256 est
 * stocké (manageTokenHash). Le token brut est rendu au seul caller autorisé
 * (futur email) et ne doit jamais être journalisé.
 */
export function generateManageToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url")
  return { token, hash: hashManageToken(token) }
}

export function verifyManageToken(token: string, storedHash: string): boolean {
  if (typeof token !== "string" || typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) return false
  return timingSafeEqual(Buffer.from(hashManageToken(token), "hex"), Buffer.from(storedHash, "hex"))
}
