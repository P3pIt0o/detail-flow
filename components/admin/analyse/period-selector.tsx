import Link from "next/link"
import { ANALYSE_PERIODS, PERIOD_LABELS, type AnalysePeriod } from "@/lib/analytics/periods"

/**
 * Sélecteur de période (contrôle segmenté). Navigation par LIENS serveur —
 * l'état vit dans l'URL (`?period=`), ce qui préserve le partage et l'historique
 * et évite tout état client superflu. `hrefFor` conserve le paramètre tenant.
 */
export function PeriodSelector({
  active,
  hrefFor,
}: {
  active: AnalysePeriod
  hrefFor: (period: AnalysePeriod) => string
}) {
  return (
    <nav aria-label="Choisir la période d'analyse" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {ANALYSE_PERIODS.map((p) => {
        const isActive = p === active
        return (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                : "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            {PERIOD_LABELS[p]}
          </Link>
        )
      })}
    </nav>
  )
}
