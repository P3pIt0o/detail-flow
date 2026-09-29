import { TrendingUp, AlertTriangle, Info } from "lucide-react"
import type { AnalyseInsight } from "@/lib/analytics/insights"

/**
 * Liste « Ce que vos chiffres suggèrent ». Rendu factuel et calme : aucune
 * alerte anxiogène, uniquement des observations issues du moteur déterministe.
 */
export function InsightsList({ insights }: { insights: AnalyseInsight[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((insight, i) => {
        const Icon = insight.type === "positive" ? TrendingUp : insight.type === "attention" ? AlertTriangle : Info
        const tone =
          insight.type === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : insight.type === "attention"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
        return (
          <li key={`${insight.metric}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <span className={`mt-0.5 shrink-0 ${tone}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{insight.title}</p>
              <p className="text-sm text-muted-foreground text-pretty">{insight.message}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
