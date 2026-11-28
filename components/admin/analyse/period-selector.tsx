import Link from "next/link"
import { ANALYSE_PERIODS, PERIOD_LABELS, type AnalysePeriod } from "@/lib/analytics/periods"
import { TabScroller } from "@/components/admin/admin-tabs"

/**
 * Sélecteur de période (contrôle segmenté). Navigation par LIENS serveur —
 * l'état vit dans l'URL (`?period=`), ce qui préserve le partage et l'historique
 * et évite tout état client superflu. `hrefFor` conserve le paramètre tenant.
 * L113 : une seule ligne, glissement au doigt, période active ramenée en vue.
 */
export function PeriodSelector({
  active,
  hrefFor,
}: {
  active: AnalysePeriod
  hrefFor: (period: AnalysePeriod) => string
}) {
  return (
    <TabScroller>
      <nav
        aria-label="Choisir la période d'analyse"
        className="flex w-max min-w-full flex-nowrap gap-1 rounded-xl border border-border bg-card p-1 sm:min-w-0"
      >
        {ANALYSE_PERIODS.map((p) => {
          const isActive = p === active
          return (
            <Link
              key={p}
              href={hrefFor(p)}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-medium whitespace-nowrap text-primary-foreground"
                  : "inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              }
            >
              {PERIOD_LABELS[p]}
            </Link>
          )
        })}
      </nav>
    </TabScroller>
  )
}
