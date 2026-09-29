import type { LucideIcon } from "lucide-react"
import { Info } from "lucide-react"
import type { Change } from "@/lib/analytics/periods"
import { TrendBadge } from "./trend-badge"

/**
 * Carte KPI de la page Analyse. La valeur est TOUJOURS affichée ; le badge
 * d'évolution n'apparaît que si une comparaison est disponible (offre avancée).
 */
export function AnalyseKpi({
  label,
  value,
  icon: Icon,
  hint,
  change,
  polarity = "normal",
}: {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  change?: Change
  polarity?: "normal" | "inverse"
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {change ? <TrendBadge change={change} polarity={polarity} /> : null}
      </div>
      <p className="text-xl font-bold text-foreground sm:text-2xl">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {hint ? (
          <span
            className="inline-flex cursor-help text-muted-foreground/70"
            title={hint}
            tabIndex={0}
            role="note"
            aria-label={`${label} : ${hint}`}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </p>
    </div>
  )
}
