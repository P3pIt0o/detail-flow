import "server-only"

import { getCompanyMemberContext, requireCompanyMember, type MemberContext } from "@/lib/admin"
import { canUseFeature, FEATURE_LOCKED_MESSAGE } from "@/lib/licensing/enforce"
import { SPIRIT_SITE_TEXTS_KEY } from "@/components/custom-sites/spirit-acs/site-texts"

/**
 * Garde commune des réglages du site Spirit ACS (textes, photos) : membre
 * OWNER/ADMIN d'une entreprise + licence `website` + tenant Spirit ACS. Un
 * super-admin plateforme conserve un accès de maintenance (requireCompanyMember
 * laisse toujours passer le super-admin). Renvoie le contexte, ou un message
 * d'erreur sûr (jamais de détail technique au client).
 *
 * Hors d'un fichier "use server" : exportée d'une action, elle deviendrait
 * elle-même appelable depuis le navigateur.
 */
export async function requireSpiritEditor(): Promise<
  { ok: true; ctx: MemberContext } | { ok: false; error: string }
> {
  const ctx = await requireCompanyMember(["OWNER", "ADMIN"])
  return checkSpiritEditor(ctx)
}

/** Variante sans redirection, pour les routes API (null = non connecté). */
export async function getSpiritEditor(): Promise<
  { ok: true; ctx: MemberContext } | { ok: false; error: string } | null
> {
  const ctx = await getCompanyMemberContext()
  if (!ctx) return null
  if (!ctx.isSuperAdmin && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return { ok: false, error: "Action réservée au propriétaire ou à un administrateur." }
  }
  return checkSpiritEditor(ctx)
}

async function checkSpiritEditor(
  ctx: MemberContext,
): Promise<{ ok: true; ctx: MemberContext } | { ok: false; error: string }> {
  if (ctx.tenant.customSiteKey !== SPIRIT_SITE_TEXTS_KEY) {
    return { ok: false, error: "Cette fonctionnalité est réservée au site Spirit ACS." }
  }
  if (!(await canUseFeature(ctx.tenant.id, "website"))) {
    return { ok: false, error: FEATURE_LOCKED_MESSAGE }
  }
  return { ok: true, ctx }
}
