/**
 * ============================================================================
 *  MODULE DE RÉSERVATION EMBARQUABLE — helpers PURS (aucune dépendance DB/DOM)
 * ============================================================================
 *
 *  Le « widget » DetailFlow n'est PAS un second moteur de réservation : c'est
 *  une couche de PRÉSENTATION autour du tunnel existant (`/reservation/*`),
 *  rendue sans le chrome marketing (navbar/footer) pour vivre dans une iframe
 *  ou une modal sur le site d'un client.
 *
 *  Le mode embed est un simple DRAPEAU porté par l'URL (`?embed=1`) et propagé
 *  à travers toute la navigation du tunnel. Il ne change RIEN à la logique
 *  métier : prix, créneaux, acompte et paiement restent recalculés côté serveur
 *  et bornés au tenant (isolation stricte, cf. `resolveRequestTenant`).
 *
 *  Ce fichier est importable côté edge (middleware), serveur ET client : il ne
 *  contient que de la logique de chaînes/URL, testable sans DOM.
 * ============================================================================
 */

/** Paramètre d'URL qui active le mode embed sur le tunnel de réservation. */
export const EMBED_QUERY_PARAM = "embed"

/**
 * En-tête de requête posé par le middleware quand la requête est en mode embed
 * (chemin sous `/embed`, ou `?embed=1`). Les layouts serveur ne reçoivent pas
 * les searchParams : ils lisent donc ce header pour décider du chrome.
 */
export const EMBED_HEADER = "x-df-embed"

/** Chemin de la route d'entrée publique du widget (sous le groupe `(site)`). */
export const EMBED_BOOKING_PATH = "/embed/booking"

/** Vrai si une valeur (`?embed=` ou header) active le mode embed. */
export function isEmbedValue(value: string | null | undefined): boolean {
  return value === "1"
}

/**
 * Décide si une requête doit être traitée en mode embed, à partir du chemin et
 * de la valeur `?embed=`. Toute page sous `/embed` est TOUJOURS en mode embed ;
 * ailleurs (pages du tunnel `/reservation/*` atteintes depuis le widget), c'est
 * le paramètre `?embed=1` qui l'active. Fonction pure (utilisée par middleware).
 */
export function shouldTreatAsEmbed(pathname: string, embedParam: string | null | undefined): boolean {
  if (pathname === "/embed" || pathname.startsWith("/embed/")) return true
  return isEmbedValue(embedParam)
}

/**
 * Ajoute `embed=1` à un href INTERNE (commençant par « / »), en respectant une
 * éventuelle query existante et un fragment d'ancre. Idempotent : n'ajoute pas
 * le paramètre deux fois. Miroir volontaire de `withTenant` (même prudence).
 */
export function withEmbed(href: string): string {
  if (!href.startsWith("/")) return href
  const hashIndex = href.indexOf("#")
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ""
  // Déjà présent (en début ou milieu de query) : ne rien changer.
  if (/[?&]embed=1(?:&|$)/.test(path)) return href
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}${EMBED_QUERY_PARAM}=1${hash}`
}

/**
 * Normalise une origine (protocole + hôte, sans slash final) pour construire des
 * URLs absolues d'intégration. Accepte une valeur brute (env, header) et renvoie
 * une chaîne sûre, ou "" si rien d'exploitable.
 */
export function normalizeOrigin(raw: string | null | undefined): string {
  const v = (raw || "").trim().replace(/\/+$/, "")
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

/**
 * URL absolue de la route embed pour un tenant donné, ex.
 * `https://www.detailflow.fr/embed/booking?tenant=slug&embed=1`.
 * Le slug est encodé ; l'origine doit déjà être normalisée.
 */
export function buildEmbedSrc(origin: string, tenantSlug: string): string {
  const base = normalizeOrigin(origin)
  const qs = `?tenant=${encodeURIComponent(tenantSlug)}&${EMBED_QUERY_PARAM}=1`
  return `${base}${EMBED_BOOKING_PATH}${qs}`
}

/** URL absolue du script d'intégration, ex. `https://www.detailflow.fr/widget/booking.js`. */
export function buildWidgetScriptSrc(origin: string): string {
  return `${normalizeOrigin(origin)}/widget/booking.js`
}

/* -------------------------------------------------------------------------- */
/*  Événements postMessage (iframe → site parent)                             */
/*                                                                            */
/*  IMPORTANT : ces messages ne transportent JAMAIS de donnée personnelle     */
/*  (nom, email, téléphone, adresse). Uniquement des signaux d'UI et, pour la */
/*  confirmation, la RÉFÉRENCE publique de réservation (code aléatoire, non   */
/*  nominatif) afin que le site parent puisse déclencher son propre suivi.    */
/* -------------------------------------------------------------------------- */

export const EMBED_MESSAGE_NAMESPACE = "detailflow"

export type EmbedMessageType =
  | "ready"
  | "resize"
  | "booking-started"
  | "booking-completed"
  | "close"

export function embedMessageName(type: EmbedMessageType): string {
  return `${EMBED_MESSAGE_NAMESPACE}:${type}`
}

/* -------------------------------------------------------------------------- */
/*  Générateur de code d'intégration (admin → « Intégrer sur mon site »)      */
/* -------------------------------------------------------------------------- */

/** Extrait sûr du snippet (indentation stable, aucune donnée sensible). */
export function iframeSnippet(origin: string, tenantSlug: string): string {
  const src = buildEmbedSrc(origin, tenantSlug)
  return [
    `<iframe`,
    `  src="${src}"`,
    `  title="Réservation en ligne"`,
    `  style="width:100%;border:0;min-height:720px"`,
    `  loading="lazy"`,
    `></iframe>`,
    `<script src="${buildWidgetScriptSrc(origin)}" data-detailflow-autoresize></script>`,
  ].join("\n")
}

/** Bouton clé-en-main : le script injecte un bouton qui ouvre la modal. */
export function scriptModalSnippet(origin: string, tenantSlug: string): string {
  return [
    `<script`,
    `  src="${buildWidgetScriptSrc(origin)}"`,
    `  data-tenant="${tenantSlug}"`,
    `  data-mode="button"`,
    `  data-label="Réserver en ligne"`,
    `></script>`,
  ].join("\n")
}

/** Connexion d'un bouton « Réserver » DÉJÀ présent sur le site du client. */
export function existingCtaSnippet(origin: string, tenantSlug: string): string {
  return [
    `<!-- 1. Sur votre bouton existant, ajoutez cet attribut : -->`,
    `<a href="#" data-detailflow-booking="${tenantSlug}">Réserver</a>`,
    ``,
    `<!-- 2. Une seule fois, avant </body> : -->`,
    `<script src="${buildWidgetScriptSrc(origin)}"></script>`,
  ].join("\n")
}
