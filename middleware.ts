import { NextResponse, type NextRequest } from "next/server"
import { DEFAULT_TENANT_SLUG, marketingOrigin, resolveHost } from "@/lib/tenant-shared"

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

  // ── PROTECTION ANTI-FUITE MARKETING ──────────────────────────────────────
  // Le site marketing DetailFlow vit physiquement sous /marketing. Sur le
  // domaine racine, le middleware y réécrit proprement `/` → /marketing. Mais
  // rien n'empêchait une requête DIRECTE vers /marketing* d'être servie sous
  // le domaine d'un TENANT (sous-domaine {slug}.detailflow.fr OU domaine
  // personnalisé vérifié comme spiritacs.com) : la page marketing s'affichait
  // alors que l'URL restait celle du tenant.
  //
  // Règle générique (vaut pour TOUT tenant présent et futur) : aucune route
  // marketing ne doit être rendue sous un hôte tenant. On redirige (308,
  // permanent) vers le domaine officiel DetailFlow en retirant le préfixe
  // /marketing (le marketing est servi à la racine sur detailflow.fr). Cela
  // corrige l'affichage ET empêche toute indexation d'une copie du marketing
  // sous le domaine d'un tenant.
  if (res.kind === "tenant" && (path === "/marketing" || path.startsWith("/marketing/"))) {
    const rest = path.slice("/marketing".length) || "/"
    const target = new URL(`${marketingOrigin(rootDomain)}${rest}`)
    target.search = req.nextUrl.search
    return NextResponse.redirect(target, 308)
  }

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
    !path.startsWith("/super-admin") &&
    // Maquettes Rozan (Phase 2) : route ISOLÉE et temporaire, servie telle
    // quelle sans réécriture vers la vitrine. N'affecte aucun tenant.
    !path.startsWith("/rozan-preview") &&
    // Maquettes CLEANYZER (Phase 1) : idem, route ISOLÉE et temporaire servie
    // telle quelle. Validation DA/UX uniquement, aucun tenant impacté.
    !path.startsWith("/cleanyzer-preview")
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
