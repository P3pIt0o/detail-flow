import "server-only"

/**
 * Client Google Places API (New) — 100 % côté serveur.
 *
 * SÉCURITÉ : la clé `GOOGLE_MAPS_API_KEY` n'est lue que dans ce module serveur
 * et n'est JAMAIS renvoyée au navigateur ni sérialisée dans une réponse. Les
 * seuls appelants (Server Actions admin, rendu public serveur) reçoivent des
 * données déjà nettoyées.
 *
 * CONFORMITÉ Google :
 *   - API officielle uniquement (pas de scraping, pas d'iframe, pas de widget).
 *   - FieldMask STRICTEMENT limité aux champs nécessaires (jamais "*").
 *   - Aucun contenu d'avis (texte, auteur, note, photo) n'est stocké en base :
 *     seul le Place ID + la config du tenant sont persistés. Les avis sont
 *     récupérés à la volée avec un cache serveur modéré.
 *
 * Aucune de ces fonctions ne « throw » vers l'appelant : elles renvoient une
 * union discriminée { ok } afin qu'une panne Google ne casse jamais un rendu.
 */

/** Un candidat d'établissement renvoyé par la recherche texte. */
export type GooglePlaceCandidate = {
  placeId: string
  name: string
  address: string | null
  rating: number | null
  userRatingCount: number | null
}

/** Un avis Google, tel qu'exposé au rendu (jamais persisté en base). */
export type GoogleReview = {
  /** Identifiant opaque de l'avis (pour la clé React). */
  name: string
  rating: number
  text: string | null
  /** Langue du texte renvoyé (ex. "fr"). */
  languageCode: string | null
  /** Texte d'origine si Google a traduit l'avis (obligation d'attribution). */
  originalText: string | null
  originalLanguageCode: string | null
  authorName: string | null
  authorUri: string | null
  authorPhotoUri: string | null
  /** Description relative fournie par Google (ex. "il y a 2 semaines"). */
  relativePublishTime: string | null
  publishTime: string | null
  /** Lien direct vers l'avis sur Google Maps. */
  googleMapsUri: string | null
}

/** Détails publics d'un établissement + ses avis renvoyés par Google. */
export type GooglePlaceDetails = {
  placeId: string
  name: string
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  reviews: GoogleReview[]
}

/** Nature de l'erreur, pour un message admin clair (jamais exposée au public). */
export type GooglePlacesErrorKind =
  | "not_configured" // GOOGLE_MAPS_API_KEY absente / API non activée
  | "invalid_place" // Place ID malformé
  | "not_found" // établissement introuvable
  | "quota" // quota dépassé ou facturation indisponible
  | "temporary" // erreur temporaire de l'API

export type GooglePlacesResult<T> = { ok: true; data: T } | { ok: false; error: GooglePlacesErrorKind }

const PLACES_BASE = "https://places.googleapis.com/v1"

/** Clé serveur. Réutilise la variable existante du projet. */
function getApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  return key ? key : null
}

/** Mappe un statut HTTP / corps d'erreur Google vers une erreur typée. */
function classifyHttpError(status: number, body: string): GooglePlacesErrorKind {
  if (status === 400) return "invalid_place"
  if (status === 404) return "not_found"
  if (status === 429) return "quota"
  if (status === 403) {
    // 403 : on distingue facturation/quota indisponible (billing/quota) de
    // « API non activée / clé restreinte » (API not enabled/disabled/not used),
    // qui relève d'un défaut de configuration à corriger dans l'admin.
    if (/billing|quota|rate limit/i.test(body)) return "quota"
    return "not_configured"
  }
  return "temporary"
}

/**
 * Recherche d'établissements par texte (nom + ville). Utilisé UNIQUEMENT dans
 * l'admin pour sélectionner l'établissement. `cache: no-store` (résultats
 * dépendants de la saisie, non mis en cache).
 */
export async function searchGooglePlaces(query: string): Promise<GooglePlacesResult<GooglePlaceCandidate[]>> {
  const apiKey = getApiKey()
  if (!apiKey) return { ok: false, error: "not_configured" }

  const textQuery = (query ?? "").trim()
  if (!textQuery) return { ok: true, data: [] }

  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // FieldMask strict : uniquement ce qui sert à choisir l'établissement.
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery, languageCode: "fr", regionCode: "FR" }),
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.log("[v0] searchGooglePlaces HTTP", res.status, body.slice(0, 200))
      return { ok: false, error: classifyHttpError(res.status, body) }
    }

    const json = (await res.json()) as {
      places?: Array<{
        id?: string
        displayName?: { text?: string }
        formattedAddress?: string
        rating?: number
        userRatingCount?: number
      }>
    }

    const data: GooglePlaceCandidate[] = (json.places ?? [])
      .filter((p) => typeof p.id === "string" && p.id)
      .map((p) => ({
        placeId: p.id as string,
        name: p.displayName?.text ?? "Établissement",
        address: p.formattedAddress ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      }))

    return { ok: true, data }
  } catch (e) {
    console.log("[v0] searchGooglePlaces error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "temporary" }
  }
}

/** Valide grossièrement la forme d'un Place ID avant tout appel réseau. */
function looksLikePlaceId(placeId: string): boolean {
  // Les Place IDs Google sont des chaînes opaques (souvent préfixées "ChIJ"),
  // sans espace. On refuse tout ce qui contient un espace ou est trop court.
  return /^[A-Za-z0-9_-]{10,}$/.test(placeId)
}

/**
 * Détails d'un établissement + ses avis. Utilisé côté admin (prévisualisation)
 * et au rendu public. Cache serveur modéré (revalidation) pour limiter le quota
 * et respecter les règles Google de rafraîchissement.
 */
export async function getGooglePlaceDetails(
  placeId: string,
  opts?: { revalidateSeconds?: number; languageCode?: string },
): Promise<GooglePlacesResult<GooglePlaceDetails>> {
  const apiKey = getApiKey()
  if (!apiKey) return { ok: false, error: "not_configured" }

  const id = (placeId ?? "").trim()
  if (!looksLikePlaceId(id)) return { ok: false, error: "invalid_place" }

  const revalidate = opts?.revalidateSeconds ?? 3600 // 1 h par défaut

  // Langue des données renvoyées par Google (texte localisé des avis + dates
  // relatives). RÈGLE MÉTIER MUTUALISÉE : tous les avis publics DetailFlow
  // doivent être en FRANÇAIS. On force donc "fr" PAR DÉFAUT à la source, pour
  // TOUS les tenants (standards, personnalisés, existants, futurs), sans jamais
  // dépendre de la langue du navigateur du visiteur ni d'un défaut serveur
  // Google (qui renvoyait sinon des avis traduits en anglais). Un appelant peut
  // surcharger la langue, mais aucun ne la retire : le paramètre est toujours
  // envoyé, ce qui garantit aussi une clé de cache stable.
  const languageCode = opts?.languageCode?.trim() || "fr"
  const query = `?languageCode=${encodeURIComponent(languageCode)}`

  try {
    const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(id)}${query}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        // FieldMask strict : identité, note, nombre d'avis, lien Maps, avis.
        "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews",
      },
      next: { revalidate },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.log("[v0] getGooglePlaceDetails HTTP", res.status, body.slice(0, 200))
      return { ok: false, error: classifyHttpError(res.status, body) }
    }

    const p = (await res.json()) as {
      id?: string
      displayName?: { text?: string }
      rating?: number
      userRatingCount?: number
      googleMapsUri?: string
      reviews?: Array<{
        name?: string
        rating?: number
        text?: { text?: string; languageCode?: string }
        originalText?: { text?: string; languageCode?: string }
        authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
        relativePublishTimeDescription?: string
        publishTime?: string
        googleMapsUri?: string
      }>
    }

    const reviews: GoogleReview[] = (p.reviews ?? []).map((r, i) => ({
      name: r.name ?? `google-review-${i}`,
      rating: typeof r.rating === "number" ? r.rating : 0,
      text: r.text?.text ?? null,
      languageCode: r.text?.languageCode ?? null,
      originalText: r.originalText?.text ?? null,
      originalLanguageCode: r.originalText?.languageCode ?? null,
      authorName: r.authorAttribution?.displayName ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      authorPhotoUri: r.authorAttribution?.photoUri ?? null,
      relativePublishTime: r.relativePublishTimeDescription ?? null,
      publishTime: r.publishTime ?? null,
      googleMapsUri: r.googleMapsUri ?? null,
    }))

    return {
      ok: true,
      data: {
        placeId: p.id ?? id,
        name: p.displayName?.text ?? "Établissement",
        rating: typeof p.rating === "number" ? p.rating : null,
        userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        googleMapsUri: p.googleMapsUri ?? null,
        reviews,
      },
    }
  } catch (e) {
    console.log("[v0] getGooglePlaceDetails error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "temporary" }
  }
}

/** Vrai si le code langue correspond au français (fr, fr-FR, FR-ca…). */
function isFrenchLanguage(code: string | null | undefined): boolean {
  return typeof code === "string" && code.trim().toLowerCase().startsWith("fr")
}

/** Résultat de sélection : texte à afficher + attribution de traduction. */
export type FrenchReviewText = {
  /** Texte français à afficher (ou meilleur repli disponible), sinon null. */
  text: string | null
  /** Vrai UNIQUEMENT si le texte affiché est une traduction Google (≠ original). */
  translatedByGoogle: boolean
}

/**
 * Sélectionne le texte FRANÇAIS d'un avis Google pour l'affichage public.
 *
 * RÈGLE MÉTIER : ne jamais faire `text ?? originalText` en aveugle — un `text`
 * (« translatedText ») n'est pas garanti français. On vérifie le `languageCode`.
 *
 * Ordre de préférence :
 *   1. Texte localisé si son code langue est FRANÇAIS (cas normal : on a demandé
 *      "fr" à la source). Marqué « Traduit par Google » seulement si un original
 *      existe dans une AUTRE langue.
 *   2. Sinon, texte ORIGINAL s'il est français (on n'affiche jamais une
 *      traduction non française à la place d'un original français).
 *   3. Repli défensif (aucune version française fiable) : meilleure donnée
 *      renvoyée par Google pour notre requête fr (texte localisé, sinon
 *      original). On ne présente jamais un texte non français comme une
 *      « traduction française », mais on conserve l'attribution honnête si le
 *      texte affiché est bien une traduction Google.
 */
export function selectFrenchReviewText(
  review: Pick<GoogleReview, "text" | "languageCode" | "originalText" | "originalLanguageCode">,
): FrenchReviewText {
  const localizedIsFrench = isFrenchLanguage(review.languageCode)
  const originalIsFrench = isFrenchLanguage(review.originalLanguageCode)

  // 1. Texte localisé français.
  if (review.text && localizedIsFrench) {
    const translatedByGoogle = Boolean(review.originalText) && !originalIsFrench
    return { text: review.text, translatedByGoogle }
  }

  // 2. Original français (le localisé n'est pas français → on préfère l'original).
  if (review.originalText && originalIsFrench) {
    return { text: review.originalText, translatedByGoogle: false }
  }

  // 3. Repli : aucune version française fiable.
  const usedLocalized = Boolean(review.text)
  const text = review.text ?? review.originalText ?? null
  const translatedByGoogle =
    usedLocalized && Boolean(review.originalText) && review.originalLanguageCode !== review.languageCode
  return { text, translatedByGoogle }
}

/** Message admin clair (jamais montré au public) pour chaque type d'erreur. */
export function googleErrorMessage(kind: GooglePlacesErrorKind): string {
  switch (kind) {
    case "not_configured":
      return "L'API Google Places n'est pas configurée (clé absente ou API non activée). Contactez l'administrateur de la plateforme."
    case "invalid_place":
      return "L'identifiant d'établissement Google est invalide."
    case "not_found":
      return "Établissement Google introuvable."
    case "quota":
      return "Le service Google est momentanément indisponible (quota ou facturation). Réessayez plus tard."
    case "temporary":
      return "Erreur temporaire du service Google. Réessayez dans un instant."
  }
}
