/**
 * Résolution du MEILLEUR LIEN PUBLIC RÉEL d'une entreprise — logique PURE.
 *
 * Ce module décide, CÔTÉ SERVEUR, quelle URL propre partager au professionnel
 * quand il clique « Copier mon lien ». Il ne reconstruit JAMAIS d'URL technique
 * côté client et n'expose jamais `?tenant=...`, `localhost`, une preview, ou une
 * route d'administration. Il réutilise les résolveurs existants (`tenant-shared`).
 *
 * Priorité (dans l'ordre) :
 *  1. Domaine personnalisé connecté et vérifié (`tenantCanonicalOrigin`).
 *  2. / 3. À défaut, l'URL PUBLIQUE CANONIQUE « jolie » selon le parcours :
 *     - booking_only → lien de réservation `/p/<slug>/reservation` ;
 *     - sinon (page publique, site custom sans domaine, legacy) → `/p/<slug>`.
 *
 * Ces chemins `/p/<slug>` sont volontairement SANS `?tenant=` : le lien reste
 * propre et présentable à un client. Un tenant suspendu/archivé n'est pas
 * joignable → `null` (le shell affiche alors un état neutre, aucune URL).
 */

import { publicPageUrl, publicReservationUrl, tenantCanonicalOrigin } from "@/lib/tenant-shared"
import type { OnboardingIntentValue } from "@/lib/onboarding/intent"

export type PublicLinkKind = "custom_domain" | "public_page" | "reservation"

export type ResolvedPublicLink = {
  /** URL publique absolue et propre (jamais de `?tenant=`, jamais technique). */
  url: string
  /** Nature du lien résolu (pour l'affichage / la microcopie). */
  kind: PublicLinkKind
}

export function resolvePublicLink(opts: {
  slug: string
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
  status: string
  /** Domaine racine (`NEXT_PUBLIC_ROOT_DOMAIN`) — requis pour une URL absolue. */
  rootDomain?: string
}): ResolvedPublicLink | null {
  // Non joignable publiquement : on ne propose aucun lien plutôt qu'un faux.
  if (opts.status === "SUSPENDED" || opts.status === "ARCHIVED") return null

  // 1. Domaine personnalisé réellement connecté et vérifié.
  const canonical = tenantCanonicalOrigin(opts.slug)
  if (canonical) return { url: canonical, kind: "custom_domain" }

  // 2. Parcours « réservation seule » : le lien utile est la prise de RDV.
  if (opts.intent === "booking_only") {
    const url = publicReservationUrl(opts.slug, opts.rootDomain)
    return url.startsWith("https://") ? { url, kind: "reservation" } : null
  }

  // 3. Page publique / site custom sans domaine / legacy → page canonique.
  const url = publicPageUrl(opts.slug, opts.rootDomain)
  return url.startsWith("https://") ? { url, kind: "public_page" } : null
}
