export type PublicSiteTarget = "reservation" | "formules"

const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

/**
 * Lien interne réservation ↔ formules qui préserve le tenant courant.
 * `tenantSlug` doit être le slug résolu côté serveur (en base), jamais celui
 * du navigateur. Politique des liens humains de main : `/<target>?tenant=<slug>`
 * dans tous les cas (domaine racine, aperçu, sous-domaine, domaine personnalisé),
 * pour ne jamais perdre le tenant pendant la navigation. Aucun lien `/p/<slug>`.
 * `tenantKind` est conservé dans la signature pour compatibilité, sans effet.
 */
export function publicSiteHref(
  target: PublicSiteTarget,
  ctx: { tenantKind?: string | null; tenantSlug?: string | null; embed?: boolean; view?: string | null },
): string {
  const params = new URLSearchParams()
  const slug = ctx.tenantSlug && SAFE_SLUG.test(ctx.tenantSlug) ? ctx.tenantSlug : null
  if (slug) params.set("tenant", slug)
  if (ctx.embed) params.set("embed", "1")
  if (ctx.view === "both") params.set("view", "both")
  const qs = params.toString()
  return qs ? `/${target}?${qs}` : `/${target}`
}
