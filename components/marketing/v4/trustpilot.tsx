import { Star } from "lucide-react"

/**
 * Preuve Trustpilot pour la landing V4.
 *
 * Choix volontaire : on N'UTILISE PAS le widget officiel Trustpilot ici car ses
 * templates affichent systématiquement le nombre d'avis, ce que nous ne
 * souhaitons pas montrer. On affiche donc une preuve compacte maîtrisée :
 * uniquement la NOTE (4,2/5) + l'identité Trustpilot, sans aucun compteur d'avis.
 *
 * La note est centralisée ci-dessous (TRUSTPILOT). Pour la mettre à jour,
 * modifier UNIQUEMENT `ratingValue` ici — aucune autre occurrence dans le code.
 */
export const TRUSTPILOT = {
  /** Note sur 5, source de vérité unique. */
  ratingValue: 4.2,
  /** Libellé affiché (format français). */
  ratingLabel: "4,2/5",
  domain: "detailflow.fr",
  reviewUrl: "https://fr.trustpilot.com/review/detailflow.fr",
} as const

const TRUSTPILOT_GREEN = "#00b67a"

/** Étoiles fidèles à la note : remplissage proportionnel (4,2/5 = 84 %), jamais 5/5. */
function RatingStars({ size }: { size: number }) {
  const pct = (TRUSTPILOT.ratingValue / 5) * 100
  const stars = Array.from({ length: 5 })
  // Chaque étoile ne doit JAMAIS rétrécir : la couche verte est clippée à `pct`
  // via overflow-hidden, mais les icônes gardent leur taille exacte pour rester
  // parfaitement superposées à la couche grise (sinon effet de double étoile).
  const star = (color?: string) => (
    <Star
      style={{ width: size, height: size, minWidth: size, color }}
      className="shrink-0"
      strokeWidth={0}
      fill="currentColor"
    />
  )
  return (
    <span
      className="relative inline-block align-middle"
      style={{ width: size * 5, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 flex text-muted-foreground/30">
        {stars.map((_, i) => (
          <span key={i}>{star()}</span>
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden" style={{ width: `${pct}%` }}>
        {stars.map((_, i) => (
          <span key={i}>{star(TRUSTPILOT_GREEN)}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * Ligne de réassurance Trustpilot compacte, cliquable vers la vraie page
 * Trustpilot DetailFlow. Aucun nombre d'avis n'est jamais affiché.
 */
export function TrustpilotProof({ className }: { className?: string }) {
  return (
    <a
      href={TRUSTPILOT.reviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Noté ${TRUSTPILOT.ratingValue} sur 5 sur Trustpilot (nouvel onglet)`}
      className={`group inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className ?? ""}`}
    >
      <Star
        className="size-4 shrink-0"
        style={{ fill: TRUSTPILOT_GREEN, color: TRUSTPILOT_GREEN }}
        aria-hidden="true"
      />
      <span className="font-semibold text-foreground">Trustpilot</span>
      <RatingStars size={15} />
      <span className="whitespace-nowrap">
        Noté <span className="font-semibold text-foreground">{TRUSTPILOT.ratingLabel}</span>
      </span>
    </a>
  )
}
