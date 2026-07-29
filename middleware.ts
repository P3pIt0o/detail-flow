import { NextResponse, type NextRequest } from "next/server"
import { DEFAULT_TENANT_SLUG, resolveHost } from "@/lib/tenant-shared"

/**
 * Routage multi-tenant par hostname.
 *
 * - detailflow.fr / www.detailflow.fr  → vitrine SaaS (réécrit vers /marketing)
 * - {slug}.detailflow.fr               → site + admin de l'entreprise {slug}
 * - aperçu v0 / local                  → tenant via ?tenant=, sinon défaut
 *
 * Le middleware NE fait AUCUN accès base de données (runtime edge). Il se
 * contente de calculer le slug et de le transmettre via des en-têtes de requête.
 * La résolution réelle (lecture DB, vérif du statut) a lieu dans
 * `getCurrentTenant()` côté serveur (runtime Node), qui lit ces en-têtes.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host")
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const queryTenant = req.nextUrl.searchParams.get("tenant")
  const res = resolveHost(host, rootDomain, queryTenant)

  const path = req.nextUrl.pathname

  // Un tenant est « explicite » lorsqu'il provient d'un vrai sous-domaine
  // ({slug}.detailflow.fr) ou du paramètre ?tenant=. Le tenant PAR DÉFAUT
  // (aperçu v0 / dev sans ?tenant=) n'est PAS explicite.
  const hasExplicitTenant =
    res.kind === "tenant" || (res.kind === "preview" && Boolean(res.slug))

  // Slug transmis au code serveur selon le contexte.
  let slug =
    res.kind === "tenant"
      ? res.slug
      : res.kind === "preview"
        ? (res.slug ?? DEFAULT_TENANT_SLUG)
        : "" // racine (vitrine) : pas de tenant

  // Espace admin d'un utilisateur CONNECTÉ : le tenant par défaut ne doit jamais
  // primer sur SON entreprise. Sans tenant explicite, on n'injecte donc PAS le
  // défaut pour /admin → côté serveur, `getCurrentTenant()` renvoie null et
  // `resolveRequestTenant()` se rabat sur l'entreprise liée à l'appartenance
  // (`getTenantFromMembership`). Le site public, lui, conserve le défaut : cette
  // exception ne concerne que l'espace admin. Les sous-domaines et ?tenant=
  // (explicites) restent prioritaires, ainsi que le repli super-admin existant.
  if (!hasExplicitTenant && path.startsWith("/admin")) {
    slug = ""
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-tenant-kind", res.kind)
  requestHeaders.set("x-tenant-slug", slug)

  // En aperçu v0 / dev, sans ?tenant= explicite, on se comporte comme le
  // domaine racine : `/` affiche la vitrine SaaS. Un site d'entreprise reste
  // accessible via ?tenant=slug. La PRODUCTION n'est pas concernée (elle passe
  // par res.kind === "root" | "tenant", jamais "preview").
  const isPreviewRoot = res.kind === "preview" && !res.slug
  const showMarketing = res.kind === "root" || isPreviewRoot

  // Sur le domaine racine (ou l'aperçu sans tenant), la vitrine vit sous
  // /marketing. On réécrit proprement /<x> → /marketing/<x> pour garder des
  // URLs propres (detailflow.fr/beta) tout en isolant les pages tenant.
  if (
    showMarketing &&
    !path.startsWith("/marketing") &&
    !path.startsWith("/api") &&
    !path.startsWith("/admin") &&
    !path.startsWith("/super-admin")
  ) {
    const url = req.nextUrl.clone()
    url.pathname = `/marketing${path === "/" ? "" : path}`
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // Exclut les assets internes Next et les fichiers statiques (avec extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.).*)"],
}
