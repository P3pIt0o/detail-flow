import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * INVARIANT CUSTOMER ACCESS : liens email signés (HMAC-SHA256) et expirants.
 * Le payload lie companyId + subscriptionId + purpose + expiry + une empreinte
 * du manageTokenHash courant : rotateManageToken() révoque donc tous les liens
 * et sessions précédents. Aucun token brut n'est stocké ; aucune donnée
 * personnelle dans le payload. Production sans secret → FAIL CLOSED.
 */
export const CUSTOMER_ACCESS_VERSION = 1
export const CUSTOMER_SESSION_COOKIE = "df_cs_session"
export const CUSTOMER_MANAGE_PATH = "/abonnements/gerer"
export const MANAGE_LINK_TTL_SECONDS = 14 * 24 * 3600
export const CUSTOMER_SESSION_TTL_SECONDS = 30 * 60

export type CustomerAccessPurpose = "manage_link" | "session"

export type CustomerAccessClaims = {
  v: number
  c: number
  s: number
  p: CustomerAccessPurpose
  e: number
  k: string
}

export class CustomerAccessUnavailableError extends Error {
  constructor() {
    super("CUSTOMER_ACCESS_UNAVAILABLE")
  }
}

const MIN_SECRET_BYTES = 32
const DEV_ONLY_SECRET = "detailflow-dev-only-customer-subscriptions-action-secret!"

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "production" || (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview")
}

/** Secret dédié. Preview/Production sans secret valide → indisponible (aucun fallback). */
export function resolveCustomerAccessSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.CUSTOMER_SUBSCRIPTIONS_ACTION_SECRET
  if (secret && Buffer.byteLength(secret) >= MIN_SECRET_BYTES) return secret
  if (env.NODE_ENV === "production" || isProductionRuntime(env)) throw new CustomerAccessUnavailableError()
  return DEV_ONLY_SECRET
}

/** Empreinte non réversible de la capacité de gestion courante. */
export function capabilityFingerprint(manageTokenHash: string): string {
  return createHash("sha256").update(`cs-cap:${manageTokenHash}`).digest("base64url").slice(0, 22)
}

const b64 = (s: string) => Buffer.from(s).toString("base64url")
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url")

export function signCustomerAccess(
  input: { companyId: number; subscriptionId: number; purpose: CustomerAccessPurpose; manageTokenHash: string; ttlSeconds: number },
  now: Date = new Date(),
  secret: string = resolveCustomerAccessSecret(),
): string {
  const claims: CustomerAccessClaims = {
    v: CUSTOMER_ACCESS_VERSION,
    c: input.companyId,
    s: input.subscriptionId,
    p: input.purpose,
    e: Math.floor(now.getTime() / 1000) + input.ttlSeconds,
    k: capabilityFingerprint(input.manageTokenHash),
  }
  const body = b64(JSON.stringify(claims))
  return `${body}.${sign(body, secret)}`
}

export type VerifyFailure = "malformed" | "signature" | "expired" | "purpose" | "tenant"

/**
 * Vérifie signature + expiration + purpose + tenant (résolu côté serveur). Le
 * contrôle de l'empreinte de capacité est fait par l'appelant après chargement
 * du contrat par (companyId, subscriptionId) — voir assertCapabilityMatches.
 */
export function verifyCustomerAccess(
  token: string | null | undefined,
  expected: { companyId: number; purpose: CustomerAccessPurpose },
  now: Date = new Date(),
  secret: string = resolveCustomerAccessSecret(),
): { ok: true; claims: CustomerAccessClaims } | { ok: false; reason: VerifyFailure } {
  if (!token || token.length > 1024) return { ok: false, reason: "malformed" }
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" }
  const expectedSig = Buffer.from(sign(parts[0], secret))
  const givenSig = Buffer.from(parts[1])
  if (expectedSig.length !== givenSig.length || !timingSafeEqual(expectedSig, givenSig)) return { ok: false, reason: "signature" }
  let claims: CustomerAccessClaims
  try {
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (claims.v !== CUSTOMER_ACCESS_VERSION || !Number.isInteger(claims.c) || !Number.isInteger(claims.s) || typeof claims.k !== "string") {
    return { ok: false, reason: "malformed" }
  }
  if (claims.e * 1000 <= now.getTime()) return { ok: false, reason: "expired" }
  if (claims.p !== expected.purpose) return { ok: false, reason: "purpose" }
  if (claims.c !== expected.companyId) return { ok: false, reason: "tenant" }
  return { ok: true, claims }
}

export function capabilityMatches(claims: CustomerAccessClaims, currentManageTokenHash: string | null): boolean {
  if (!currentManageTokenHash) return false
  const a = Buffer.from(claims.k)
  const b = Buffer.from(capabilityFingerprint(currentManageTokenHash))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Attributs du cookie de session client (HttpOnly, Secure en prod, Lax, court, scope limité). */
export function customerSessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/abonnements",
    maxAge: CUSTOMER_SESSION_TTL_SECONDS,
  }
}

/** En-têtes des pages de gestion client : jamais en cache, jamais de Referer. */
export const CUSTOMER_PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const
