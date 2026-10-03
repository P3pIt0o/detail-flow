import { NextResponse, type NextRequest } from "next/server"
import { CUSTOMER_MANAGE_PATH, CUSTOMER_PAGE_HEADERS, CUSTOMER_SESSION_COOKIE, customerSessionCookieOptions } from "@/lib/customer-subscriptions/customer-access"
import { exchangeManageLink } from "@/lib/customer-subscriptions/customer-service"
import { customerDb } from "@/lib/customer-subscriptions/customer-portal.server"
import { resolvePublicRequestTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

/**
 * GET = échange d'accès UNIQUEMENT (aucune mutation du contrat) :
 * lien email signé → cookie de session HttpOnly → redirection immédiate.
 * Le token ne reste jamais dans l'URL finale ; l'échec est générique.
 */
export async function GET(req: NextRequest) {
  const tenant = await resolvePublicRequestTenant()
  const result = await exchangeManageLink(customerDb, { companyId: tenant?.id ?? null, linkToken: req.nextUrl.searchParams.get("t") })

  const target = req.nextUrl.clone()
  target.search = ""
  // Aperçu : le tenant peut être porté par ?tenant= (jamais le token).
  const previewTenant = req.nextUrl.searchParams.get("tenant")
  if (previewTenant) target.searchParams.set("tenant", previewTenant)
  target.pathname = result.ok ? CUSTOMER_MANAGE_PATH : `${CUSTOMER_MANAGE_PATH}/lien-invalide`

  const res = NextResponse.redirect(target, 303)
  for (const [k, v] of Object.entries(CUSTOMER_PAGE_HEADERS)) res.headers.set(k, v)
  if (result.ok) res.cookies.set(CUSTOMER_SESSION_COOKIE, result.sessionToken, customerSessionCookieOptions())
  else res.cookies.delete({ name: CUSTOMER_SESSION_COOKIE, path: "/abonnements" })
  return res
}
