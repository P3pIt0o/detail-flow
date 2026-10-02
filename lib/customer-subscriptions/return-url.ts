/**
 * URL de retour Checkout des abonnements clients, construite UNIQUEMENT côté
 * serveur depuis le slug du tenant (DB) et les helpers de domaine DetailFlow.
 * Aucune URL venant du navigateur n'est acceptée → pas d'open redirect.
 *
 * Origines autorisées :
 *  - domaine racine DetailFlow (`www.<root>` / `<root>`) ;
 *  - domaine personnalisé vérifié/canonique DU tenant (TENANT_CANONICAL_HOST) ;
 *  - localhost uniquement hors production (dev/test).
 */
import { tenantCanonicalHost, tenantPublicPathUrl } from "@/lib/tenant-shared"
import { CustomerSubscriptionError } from "./errors"

export const CHECKOUT_SESSION_PLACEHOLDER = "{CHECKOUT_SESSION_ID}"
export const CUSTOMER_SUBSCRIPTION_RETURN_PATH = "/abonnement-entretien/retour"
const DEV_ORIGIN = "http://localhost:3000"

export type ReturnUrlContext = { rootDomain?: string | null; allowLocalhost?: boolean }

const bareRoot = (rootDomain?: string | null) =>
  (rootDomain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "")

export function defaultReturnUrlContext(): ReturnUrlContext {
  return { rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null, allowLocalhost: process.env.NODE_ENV !== "production" }
}

/** Vérifie qu'une URL appartient bien aux origines DetailFlow/tenant attendues. */
export function assertAllowedReturnUrl(url: string, slug: string, ctx: ReturnUrlContext): string {
  if (!url.includes(CHECKOUT_SESSION_PLACEHOLDER)) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  let parsed: URL
  try {
    parsed = new URL(url.replace(CHECKOUT_SESSION_PLACEHOLDER, "placeholder"))
  } catch {
    throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  }
  if (parsed.username || parsed.password) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  const host = parsed.hostname.toLowerCase()
  const root = bareRoot(ctx.rootDomain)
  const canonical = tenantCanonicalHost(slug)
  const isLocal = host === "localhost" || host === "127.0.0.1"
  if (isLocal) {
    if (!ctx.allowLocalhost || parsed.protocol !== "http:") throw new CustomerSubscriptionError("INVALID_RETURN_URL")
    return url
  }
  if (parsed.protocol !== "https:" || parsed.port) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  const allowed = new Set<string>()
  if (root) {
    allowed.add(root)
    allowed.add(`www.${root}`)
  }
  if (canonical) {
    allowed.add(canonical.toLowerCase())
    allowed.add(canonical.toLowerCase().replace(/^www\./, ""))
  }
  if (!allowed.has(host)) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  return url
}

/**
 * Construit l'URL de retour du tenant : domaine canonique si connecté, sinon
 * racine DetailFlow + `?tenant=`. Sans domaine racine : localhost (dev/test) ou refus.
 */
export function buildCustomerSubscriptionReturnUrl(slug: string, ctx: ReturnUrlContext = defaultReturnUrlContext()): string {
  if (!slug) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
  const path = `${CUSTOMER_SUBSCRIPTION_RETURN_PATH}?session_id=${CHECKOUT_SESSION_PLACEHOLDER}`
  const root = bareRoot(ctx.rootDomain)
  let url = tenantPublicPathUrl(path, slug, root ? `www.${root}` : undefined)
  if (url.startsWith("/")) {
    if (!ctx.allowLocalhost) throw new CustomerSubscriptionError("INVALID_RETURN_URL")
    url = `${DEV_ORIGIN}${url}`
  }
  return assertAllowedReturnUrl(url, slug, ctx)
}
