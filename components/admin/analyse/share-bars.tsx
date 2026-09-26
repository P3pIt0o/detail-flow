import { formatPrice } from "@/lib/format"
import type { ServiceShare } from "@/lib/analytics/metrics"

/**
 * Barres horizontales de répartition (prestations par volume ou par CA).
 * `kind` détermine le formatage de la valeur, JAMAIS mélangé :
 *  - "count" → nombre de rendez-vous ;
 *  - "money" → montant en centimes (CA facturé).
 * On limite l'affichage aux `limit` premières entrées (le reste est agrégé).
 */
export function ShareBars({
  rows,
  kind,
  limit = 6,
}: {
  rows: ServiceShare[]
  kind: "count" | "money"
  limit?: number
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</p>
  }

  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit)
  const restValue = rest.reduce((s, r) => s + r.value, 0)
  const restShare = rest.reduce((s, r) => s + r.share, 0)

  const fmt = (v: number) => (kind === "money" ? formatPrice(v) : `${v} RDV`)
  const maxShare = Math.max(1, ...shown.map((r) => r.share))

  return (
    <ul className="flex flex-col gap-3">
      {shown.map((r) => (
        <li key={r.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {fmt(r.value)} · {r.share}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(3, (r.share / maxShare) * 100)}%` }}
            />
          </div>
        </li>
      ))}
      {rest.length > 0 ? (
        <li className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm text-muted-foreground">
          <span>Autres ({rest.length})</span>
          <span className="tabular-nums">
            {fmt(restValue)} · {restShare}%
          </span>
        </li>
      ) : null}
    </ul>
  )
}
