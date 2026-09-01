import { ExternalLink } from "lucide-react"
import { StarRating } from "@/components/ui/star-rating"
import type { GooglePlaceDetails } from "@/lib/reviews/google-places"

/**
 * API d'apparence du module d'avis — permet aux sites (standard ET 100 %
 * personnalisés) d'adapter le rendu sans dupliquer la logique. Tous les champs
 * sont optionnels : par défaut, le rendu s'aligne sur le thème du tenant via
 * les tokens sémantiques (bg-card, text-foreground, border-border, primary…).
 */
export type TenantReviewsAppearance = {
  /** Titre de la section (défaut : « Avis Google »). */
  title?: string
  /** Sous-titre / intro optionnel. */
  subtitle?: string
  /** Nombre de colonnes de la grille (défaut : 3). */
  columns?: 1 | 2 | 3
  /** Variante visuelle. */
  variant?: "standard" | "minimal"
  /** Classes du <section> (fond, marges…). */
  className?: string
  /** Classes de chaque carte d'avis. */
  cardClassName?: string
  /** Classes du bloc d'en-tête. */
  headerClassName?: string
  /** Nombre maximum d'avis affichés (défaut : tous ceux renvoyés par Google). */
  maxItems?: number
}

/** Classes de colonnes STATIQUES (Tailwind ne compile pas les classes dynamiques). */
const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}

/** Petit libellé « Google » multicolore (attribution de la source). */
function GoogleWordmark() {
  const colors = ["#4285F4", "#EA4335", "#FBBC05", "#4285F4", "#34A853", "#EA4335"]
  const letters = "Google".split("")
  return (
    <span className="font-medium" aria-label="Google">
      {letters.map((l, i) => (
        <span key={i} style={{ color: colors[i] }} aria-hidden="true">
          {l}
        </span>
      ))}
    </span>
  )
}

/**
 * Affichage PUBLIC des avis Google d'un établissement. 100 % présentational
 * (server component) : aucune clé API, aucun appel réseau ici — les données
 * arrivent déjà nettoyées via `resolveTenantReviews`.
 *
 * Conformité Google Maps : logo/attribution Google, attribution de l'auteur,
 * lien vers chaque avis sur Google Maps, mention de traduction si Google a
 * traduit, et note indiquant que les avis sont ordonnés par pertinence Google.
 */
export function GoogleReviewsSection({
  details,
  appearance,
}: {
  details: GooglePlaceDetails
  appearance?: TenantReviewsAppearance
}) {
  const a = appearance ?? {}
  const columns = a.columns ?? 3
  const title = a.title ?? "Avis Google"
  const reviews = typeof a.maxItems === "number" ? details.reviews.slice(0, a.maxItems) : details.reviews
  const hasReviews = reviews.length > 0

  return (
    <section className={a.className ?? "border-y border-border bg-card/30"}>
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        {/* En-tête : titre + note moyenne + total + attribution Google */}
        <div className={a.headerClassName ?? "flex flex-col items-center gap-3 text-center"}>
          <h2 className="text-balance text-3xl font-bold text-foreground sm:text-4xl">{title}</h2>
          {a.subtitle && <p className="max-w-2xl text-pretty text-muted-foreground">{a.subtitle}</p>}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {typeof details.rating === "number" && (
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-foreground">{details.rating.toFixed(1)}</span>
                <StarRating rating={Math.round(details.rating)} />
              </div>
            )}
            {typeof details.userRatingCount === "number" && (
              <span className="text-sm text-muted-foreground">
                {details.userRatingCount.toLocaleString("fr-FR")} avis sur <GoogleWordmark />
              </span>
            )}
          </div>
        </div>

        {hasReviews ? (
          <>
            <ul className={`mt-12 grid gap-6 ${COLUMN_CLASSES[columns]}`}>
              {reviews.map((r) => {
                // Priorité au texte LOCALISÉ (`text.text`, ex. la version
                // française demandée par le tenant) ; repli sur `originalText`
                // seulement si aucun texte localisé n'est fourni. On ne réécrit
                // ni ne traduit rien nous-mêmes : ce sont les données Google.
                const displayText = r.text ?? r.originalText
                // « Traduit par Google » UNIQUEMENT quand le texte présenté est
                // réellement la version localisée (≠ langue d'origine). Si on est
                // retombé sur le texte d'origine, on n'affiche pas la mention.
                const wasTranslated =
                  Boolean(r.text) && Boolean(r.originalText) && r.originalLanguageCode !== r.languageCode
                // Date : on privilégie la description relative fournie par Google
                // (en français quand le tenant demande languageCode="fr", ex.
                // « il y a 10 mois ») ; à défaut seulement, on formate publishTime
                // avec la locale fr-FR. Repli défensif : n'altère pas l'affichage
                // quand la date relative est présente (autres tenants inchangés).
                const displayDate =
                  r.relativePublishTime ??
                  (r.publishTime
                    ? new Date(r.publishTime).toLocaleDateString("fr-FR", { year: "numeric", month: "long" })
                    : null)
                return (
                  <li
                    key={r.name}
                    className={
                      a.cardClassName ??
                      "flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-6"
                    }
                  >
                    <div className="flex items-center gap-3">
                      {/* Photo auteur (affichage seul, jamais stockée). */}
                      {r.authorPhotoUri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.authorPhotoUri || "/placeholder.svg"}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                          aria-hidden="true"
                        >
                          {(r.authorName ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        {/* Attribution auteur : lien vers son profil Google si fourni. */}
                        {r.authorUri && r.authorName ? (
                          <a
                            href={r.authorUri}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="truncate font-semibold text-foreground hover:underline"
                          >
                            {r.authorName}
                          </a>
                        ) : (
                          <p className="truncate font-semibold text-foreground">{r.authorName ?? "Client Google"}</p>
                        )}
                        {displayDate && <p className="text-xs text-muted-foreground">{displayDate}</p>}
                      </div>
                    </div>

                    <div className="mt-3">
                      <StarRating rating={Math.round(r.rating)} />
                    </div>

                    {displayText && (
                      <blockquote className="mt-3 flex-1 text-pretty text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
                        {displayText}
                      </blockquote>
                    )}

                    {/* Mention de traduction (obligation Google si texte traduit). */}
                    {wasTranslated && (
                      <p className="mt-2 text-xs italic text-muted-foreground">Traduit par Google</p>
                    )}

                    {/* Lien vers la source de l'avis sur Google Maps. */}
                    {r.googleMapsUri && (
                      <a
                        href={r.googleMapsUri}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" /> Voir sur Google
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Note de pertinence : ne pas présenter comme liste exhaustive. */}
            <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
              Avis sélectionnés et ordonnés par pertinence par <GoogleWordmark />. Cette sélection n&apos;est pas
              exhaustive.
            </p>
          </>
        ) : (
          <p className="mt-10 text-center text-muted-foreground">
            Aucun avis Google n&apos;est disponible pour le moment.
          </p>
        )}

        {/* Bouton « Voir tous les avis sur Google ». */}
        {details.googleMapsUri && (
          <div className="mt-10 flex justify-center">
            <a
              href={details.googleMapsUri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Voir tous les avis sur <GoogleWordmark />
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
