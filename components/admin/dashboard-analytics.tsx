import { Users, Eye, TrendingUp, TrendingDown } from "lucide-react"
import type { VisitStats } from "@/lib/analytics/queries"

/** Mini-graphique (sparkline) des pages vues sur 30 jours, sans dépendance. */
function Sparkline({ series }: { series: VisitStats["series"] }) {
  const w = 240
  const h = 40
  const values = series.map((s) => s.pageViews)
  const max = Math.max(1, ...values)
  const n = values.length

  if (n === 0) {
    return (
      <div className="flex h-10 items-center justify-center text-xs text-muted-foreground">
        Pas encore de données
      </div>
    )
  }

  // Points répartis uniformément ; barres fines pour rester lisible sur mobile.
  const barW = w / Math.max(n, 1)
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Pages vues sur les 30 derniers jours"
    >
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * (h - 2))
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - barH}
            width={Math.max(1, barW - 1)}
            height={barH}
            rx={0.5}
            className="fill-primary/70"
          />
        )
      })}
    </svg>
  )
}

/**
 * Section compacte "Visites du site" pour le tableau de bord. Réutilise le
 * style des cartes existantes. Données scopées au tenant (companyId résolu
 * côté serveur en amont).
 */
export function DashboardAnalytics({ stats }: { stats: VisitStats }) {
  const pct = stats.visitorsChangePct
  const hasTrend = pct !== null
  const positive = (pct ?? 0) >= 0

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Visites du site</h2>
        <span className="text-xs text-muted-foreground">30 derniers jours</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.uniqueVisitors30.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-muted-foreground">Visiteurs uniques</p>
        </div>

        <div>
          <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <Eye className="size-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.pageViews30.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-muted-foreground">Pages vues</p>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <div
            className={
              hasTrend && positive
                ? "mb-2 flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"
                : hasTrend
                  ? "mb-2 flex size-9 items-center justify-center rounded-lg bg-red-500/10 text-red-500"
                  : "mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            }
          >
            {hasTrend && !positive ? (
              <TrendingDown className="size-4" aria-hidden="true" />
            ) : (
              <TrendingUp className="size-4" aria-hidden="true" />
            )}
          </div>
          <p className="text-xl font-bold text-foreground sm:text-2xl">
            {hasTrend ? `${positive ? "+" : ""}${pct}\u00A0%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Évolution visiteurs</p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Pages vues / jour</span>
          <span>{stats.pageViews7.toLocaleString("fr-FR")} sur 7 j</span>
        </div>
        <Sparkline series={stats.series} />
      </div>
    </section>
  )
}
