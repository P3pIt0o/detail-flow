import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react"
import type { Change } from "@/lib/analytics/periods"

/**
 * Badge d'évolution vs période précédente. Neutre et honnête :
 *  - hausse → vert (positif), baisse → rouge (attention), stable → gris ;
 *  - « Nouveau » quand la période précédente était vide (jamais +∞ %) ;
 *  - rien d'affiché quand il n'y a rien à comparer (`none`).
 *
 * `polarity="inverse"` : pour une métrique où BAISSER est bon (ex. annulations),
 * on inverse uniquement la COULEUR, jamais le signe affiché.
 */
export function TrendBadge({
  change,
  polarity = "normal",
  className,
}: {
  change: Change
  polarity?: "normal" | "inverse"
  className?: string
}) {
  if (change.kind === "none") return null

  if (change.kind === "new") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ${className ?? ""}`}
      >
        <Sparkles className="size-3" aria-hidden="true" />
        Nouveau
      </span>
    )
  }

  const isFlat = change.kind === "flat"
  const isUp = change.kind === "up"
  // Couleur : dépend de la polarité de la métrique.
  const good = polarity === "inverse" ? change.kind === "down" : isUp
  const tone = isFlat
    ? "bg-muted text-muted-foreground"
    : good
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-red-500/10 text-red-600 dark:text-red-400"
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight
  const sign = change.pct !== null && change.pct > 0 ? "+" : ""

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone} ${className ?? ""}`}
      aria-label={`Évolution ${sign}${change.pct}\u00A0% par rapport à la période précédente`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {sign}
      {change.pct}
      {"\u00A0%"}
    </span>
  )
}
