/**
 * Liaisons Next.js de l'espace client : tenant résolu serveur, cookie de
 * session signé, contrôle Origin/Host des mutations. Toute la logique métier
 * et d'autorisation est dans customer-service.ts.
 */
import "server-only"
import { cookies, headers } from "next/headers"
import { db } from "@/lib/db"
import { resolvePublicRequestTenant } from "@/lib/tenant"
import { CUSTOMER_SESSION_COOKIE } from "./customer-access"
import type { CustomerRequestContext } from "./customer-service"
import { createCustomerSubscriptionStripePort } from "./stripe"
import type { Executor } from "./engine"

export const customerDb = db as unknown as Executor
export const customerStripePort = () => createCustomerSubscriptionStripePort()

export async function getCustomerRequestContext(): Promise<CustomerRequestContext> {
  const tenant = await resolvePublicRequestTenant()
  const jar = await cookies()
  return { companyId: tenant?.id ?? null, sessionToken: jar.get(CUSTOMER_SESSION_COOKIE)?.value ?? null }
}

/**
 * Refuse une mutation cross-site : l'Origin (ou à défaut le Referer) doit
 * correspondre à l'hôte de la requête. Complète la protection native des
 * Server Actions de Next.js ; un cookie seul ne suffit jamais.
 */
export function isSameOriginRequest(h: { get(name: string): string | null }): boolean {
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return false
  const source = h.get("origin") ?? h.get("referer")
  if (!source) return false
  try {
    return new URL(source).host === host
  } catch {
    return false
  }
}

export async function assertSameOrigin(): Promise<boolean> {
  return isSameOriginRequest(await headers())
}
