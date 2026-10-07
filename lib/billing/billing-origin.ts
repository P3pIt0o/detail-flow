/**
 * Origine utilisée pour les URLs Stripe Billing (success / cancel / portal return).
 *
 * Ne lit JAMAIS Host / x-forwarded-host : l'origine vient uniquement d'un
 * environnement contrôlé. Fail closed si la configuration est invalide.
 *
 *  - Production Vercel  : NEXT_PUBLIC_SITE_URL, https obligatoire.
 *  - Preview Vercel     : V0_RUNTIME_URL valide, sinon https://VERCEL_URL.
 *  - Local / test       : NEXT_PUBLIC_SITE_URL valide sinon http://localhost:3000.
 */

export type BillingOriginEnv = {
  NODE_ENV?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_SITE_URL?: string
  V0_RUNTIME_URL?: string
  VERCEL_URL?: string
}

export class BillingOriginError extends Error {
  constructor() {
    super("Configuration de facturation indisponible.")
    this.name = "BillingOriginError"
  }
}

const LOCAL_FALLBACK = "http://localhost:3000"

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

/** Retourne l'origine normalisée ou null si la valeur est refusée. */
export function parseSafeOrigin(raw: string | undefined, opts: { allowLocalHttp: boolean }): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value || /[\r\n\t\s]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!url.hostname || url.username || url.password) return null
  if (url.hash || url.search) return null
  if (url.pathname !== "/" && url.pathname !== "") return null
  if (url.protocol === "https:") return url.origin
  if (url.protocol === "http:" && opts.allowLocalHttp && isLocalHostname(url.hostname)) return url.origin
  return null
}

export function resolveBillingOrigin(env: BillingOriginEnv = process.env as BillingOriginEnv): string {
  const isVercelProduction = env.VERCEL_ENV === "production"
  const isVercelPreview = env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development"

  if (isVercelProduction) {
    const origin = parseSafeOrigin(env.NEXT_PUBLIC_SITE_URL, { allowLocalHttp: false })
    if (!origin) throw new BillingOriginError()
    return origin
  }

  if (isVercelPreview) {
    const origin =
      parseSafeOrigin(env.V0_RUNTIME_URL, { allowLocalHttp: false }) ??
      (env.VERCEL_URL ? parseSafeOrigin(`https://${env.VERCEL_URL}`, { allowLocalHttp: false }) : null)
    if (!origin) throw new BillingOriginError()
    return origin
  }

  if (env.NODE_ENV === "production") {
    // Build/serveur production hors Vercel : même exigence que la prod.
    const origin = parseSafeOrigin(env.NEXT_PUBLIC_SITE_URL, { allowLocalHttp: false })
    if (!origin) throw new BillingOriginError()
    return origin
  }

  return (
    parseSafeOrigin(env.V0_RUNTIME_URL, { allowLocalHttp: true }) ??
    parseSafeOrigin(env.NEXT_PUBLIC_SITE_URL, { allowLocalHttp: true }) ??
    LOCAL_FALLBACK
  )
}
