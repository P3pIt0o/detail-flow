import { cn } from "@/lib/utils"
import { resolveHighlightLabel, isHighlightKind, type HighlightKind } from "@/lib/services/highlight"

/**
 * Badge « Mise en avant » d'une prestation (LOT C).
 *
 * Composant unique et réutilisable, rendu à l'identique sur les cartes
 * publiques, dans le parcours de réservation et dans les sites sur mesure.
 * Styles prédéfinis, sobres et contrastés (aucun HTML/CSS libre) ; le libellé
 * est du texte échappé par React. Ne rend rien si aucun badge n'est défini.
 */
export function ServiceHighlightBadge({
  kind,
  label,
  className,
}: {
  kind: string | null | undefined
  label: string | null | undefined
  className?: string
}) {
  const text = resolveHighlightLabel(kind, label)
  if (!text) return null

  // Type effectif (custom si kind inconnu mais texte présent — défensif).
  const effectiveKind: HighlightKind = isHighlightKind(kind) ? kind : "custom"

  // Palette par type, dérivée des tokens du thème (contraste garanti).
  const styles: Record<HighlightKind, string> = {
    bestseller: "bg-primary text-primary-foreground",
    most_booked: "bg-primary text-primary-foreground",
    recommended: "bg-secondary text-secondary-foreground",
    new: "bg-accent text-accent-foreground",
    custom: "bg-muted text-foreground",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-tight",
        "max-w-full truncate shadow-sm",
        styles[effectiveKind],
        className,
      )}
      title={text}
    >
      {text}
    </span>
  )
}
