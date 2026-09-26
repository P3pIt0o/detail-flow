"use client"

import { useId, useMemo, useState } from "react"
import { formatDateShort, formatMonthLabel, formatMoney } from "@/lib/format"
import type { Granularity } from "@/lib/analytics/periods"

/**
 * Graphique d'évolution du CA facturé — SVG léger, sans dépendance externe
 * (cohérent avec le reste de l'app). Responsive (viewBox), thème via tokens
 * (primary/border), accessible : tableau de données en `sr-only` + survol/focus
 * clavier révélant la valeur exacte. Aucune donnée fictive n'est inventée : les
 * buckets vides valent 0 (série continue calculée côté serveur).
 */
export function RevenueAreaChart({
  data,
  granularity,
  currencyCode = null,
}: {
  data: { bucket: string; totalCents: number }[]
  granularity: Granularity
  currencyCode?: string | null
}) {
  const money = (cents: number) => formatMoney(cents, currencyCode)
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)

  const W = 640
  const H = 200
  const PAD_X = 8
  const PAD_TOP = 16
  const PAD_BOTTOM = 8

  const label = (bucket: string) => (granularity === "month" ? formatMonthLabel(bucket) : formatDateShort(bucket))

  const { points, areaPath, linePath, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.totalCents))
    const innerW = W - PAD_X * 2
    const innerH = H - PAD_TOP - PAD_BOTTOM
    const n = data.length
    const xFor = (i: number) => (n <= 1 ? PAD_X + innerW / 2 : PAD_X + (i / (n - 1)) * innerW)
    const yFor = (v: number) => PAD_TOP + innerH - (v / max) * innerH
    const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.totalCents), ...d }))
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    const areaPath =
      points.length > 0
        ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${points[0].x.toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`
        : ""
    return { points, areaPath, linePath, max }
  }, [data])

  if (data.length === 0 || max <= 1) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aucun chiffre d&apos;affaires facturé sur cette période.
      </p>
    )
  }

  // Étiquettes d'axe X : ~5 réparties pour rester lisibles.
  const tickStep = Math.max(1, Math.ceil(data.length / 5))
  const activePoint = active !== null ? points[active] : null

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-48 w-full"
          role="img"
          aria-label="Évolution du chiffre d'affaires facturé sur la période"
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {activePoint ? (
            <line
              x1={activePoint.x}
              y1={PAD_TOP}
              x2={activePoint.x}
              y2={H - PAD_BOTTOM}
              stroke="var(--color-border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {points.map((p, i) => (
            <circle
              key={p.bucket}
              cx={p.x}
              cy={p.y}
              r={active === i ? 4 : 2.5}
              fill="var(--color-primary)"
              stroke="var(--color-card)"
              strokeWidth="1.5"
            />
          ))}
          {/* Zones de survol/focus larges pour pointeur et clavier. */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.bucket}`}
              x={p.x - (W / points.length) / 2}
              y={0}
              width={W / points.length}
              height={H}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${label(p.bucket)} : ${money(p.totalCents)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {activePoint ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-center shadow-sm"
            style={{ left: `${(activePoint.x / W) * 100}%` }}
          >
            <p className="text-sm font-semibold text-foreground">{money(activePoint.totalCents)}</p>
            <p className="text-xs capitalize text-muted-foreground">{label(activePoint.bucket)}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-xs capitalize text-muted-foreground" aria-hidden="true">
        {data.map((d, i) => (i % tickStep === 0 ? <span key={d.bucket}>{label(d.bucket)}</span> : null))}
      </div>

      <figcaption className="sr-only">
        <table>
          <caption>Chiffre d&apos;affaires facturé par période</caption>
          <thead>
            <tr>
              <th scope="col">Période</th>
              <th scope="col">CA facturé</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.bucket}>
                <td>{label(d.bucket)}</td>
                <td>{money(d.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
