export type PublicSiteTarget = "reservation" | "formules"

const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

/**
 * Lien interne réservation ↔ formules qui préserve le tenant courant.
 * `tenantSlug` doit être le slug résolu côté serveur (en base), jamais celui
 * du navigateur ; `tenantKind` est l'en-tête `x-tenant-kind` posé par le middleware.
 * - "path"    → /p/<slug>/<target>
 * - "preview" → /<target>?tenant=<slug>
 * - sinon (sous-domaine / domaine personnalisé) → /<target>, le tenant vient de l'hôte.
 */
export function publicSiteHref(
  target: PublicSiteTarget,
  ctx: { tenantKind?: string | null; tenantSlug?: string | null; embed?: boolean; view?: string | null },
): string {
  const params = new URLSearchParams()
  const slug = ctx.tenantSlug && SAFE_SLUG.test(ctx.tenantSlug) ? ctx.tenantSlug : null
  let path = `/${target}`
  if (slug && ctx.tenantKind === "path") path = `/p/${slug}/${target}`
  else if (slug && ctx.tenantKind === "preview") params.set("tenant", slug)
  if (ctx.embed) params.set("embed", "1")
  if (ctx.view === "both") params.set("view", "both")
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}
