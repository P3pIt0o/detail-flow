/**
 * Validation & construction des liens de demande d'avis Google (LOT D #3).
 *
 * Fichier PUR (aucun import serveur/DB, aucun fetch réseau) : le brief interdit
 * tout fetch serveur d'une URL utilisateur non validée. On se contente donc
 * d'une validation SYNTAXIQUE stricte (schéma + domaine), jamais d'un appel.
 *
 * Règles du brief :
 *  - HTTPS obligatoire.
 *  - Domaines Google autorisés uniquement.
 *  - Refuser javascript:, domaines trompeurs, URL arbitraires.
 *  - Ne pas inventer de Place ID ni de fiche Google.
 */

/**
 * Domaines Google acceptés pour un lien de demande d'avis.
 * On autorise l'hôte EXACT ou un sous-domaine (`*.google.com`, etc.), jamais un
 * domaine qui contient « google » de façon trompeuse (ex. `google.evil.com`,
 * `mygoogle.com`).
 */
const ALLOWED_REVIEW_HOSTS = [
  "google.com",
  "www.google.com",
  "maps.google.com",
  "search.google.com",
  "g.page", // format court officiel des fiches Google Business Profile
  "maps.app.goo.gl", // liens de partage Google Maps
  "goo.gl",
]

function hostIsAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_REVIEW_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

export type ReviewLinkValidation =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Valide un lien de demande d'avis Google fourni par le professionnel.
 *
 * N'effectue AUCUN appel réseau : validation syntaxique seule (le brief interdit
 * de fetch une URL utilisateur non validée). Normalise en retour l'URL propre.
 */
export function validateGoogleReviewLink(raw: string | null | undefined): ReviewLinkValidation {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Lien d'avis manquant." }
  }
  const value = raw.trim()

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, error: "Lien invalide." }
  }

  // Refus explicite de tout schéma non HTTPS (javascript:, data:, http:, etc.).
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Le lien doit commencer par https://" }
  }

  if (!hostIsAllowed(parsed.hostname)) {
    return { ok: false, error: "Le lien doit pointer vers un domaine Google officiel." }
  }

  return { ok: true, url: parsed.toString() }
}

/**
 * Construit un lien de demande d'avis à partir d'un Place ID Google EXISTANT
 * (réutilisation de la config avis déjà présente du tenant). Ne fabrique jamais
 * un Place ID : renvoie null si absent/vide.
 *
 * Format officiel du lien « écrire un avis » :
 *   https://search.google.com/local/writereview?placeid=<PLACE_ID>
 */
export function buildReviewLinkFromPlaceId(placeId: string | null | undefined): string | null {
  if (typeof placeId !== "string" || !placeId.trim()) return null
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`
}

/**
 * Résout le lien d'avis effectif d'un tenant, par ordre de priorité :
 *  1. un Place ID Google déjà configuré (source fiable, réutilisée) ;
 *  2. sinon un lien collé manuellement, s'il est valide ;
 *  3. sinon null (pas d'envoi possible — l'UI l'indique).
 */
export function resolveEffectiveReviewLink(input: {
  placeId?: string | null
  manualLink?: string | null
}): string | null {
  const fromPlace = buildReviewLinkFromPlaceId(input.placeId)
  if (fromPlace) return fromPlace
  const manual = validateGoogleReviewLink(input.manualLink)
  return manual.ok ? manual.url : null
}
