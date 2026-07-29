import { formatMonthLabel, formatPrice } from "@/lib/format"

/**
 * Graphique CA par mois, sans dépendance externe (barres CSS).
 * Léger et fiable pour un aperçu ; peut être remplacé par Recharts plus tard.
 */
export function RevenueChart({ data }: { data: { month: string; totalCents: number }[] }) {
  const recent = data.slice(-6)
  const max = Math.max(1, ...recent.map((d) => d.totalCents))

  if (recent.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune donnée de chiffre d&apos;affaires pour le moment.
      </p>
    )
  }

  return (
    <div className="flex h-48 items-end justify-between gap-3">
      {recent.map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium text-foreground">{formatPrice(d.totalCents)}</span>
          <div
            className="w-full rounded-t-md bg-primary/80 transition-all"
            style={{ height: `${Math.max(4, (d.totalCents / max) * 100)}%` }}
            role="img"
            aria-label={`${formatMonthLabel(d.month)} : ${formatPrice(d.totalCents)}`}
          />
          <span className="text-xs capitalize text-muted-foreground">
            {formatMonthLabel(d.month)}
          </span>
        </div>
      ))}
    </div>
  )
}
