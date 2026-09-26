import { Eye, MousePointerClick, CalendarCheck } from "lucide-react"

/**
 * Entonnoir de conversion du site : visiteurs uniques → clics « Réserver » →
 * réservations terminées, avec le taux de conversion global. On ne confond
 * JAMAIS un clic avec une réservation ; le taux affiché est réservations /
 * visiteurs (déjà calculé côté serveur, `null` si aucun visiteur).
 */
export function ConversionFunnel({
  uniqueVisitors,
  bookingClicks,
  bookingsCompleted,
  conversionRate,
}: {
  uniqueVisitors: number
  bookingClicks: number
  bookingsCompleted: number
  conversionRate: number | null
}) {
  const steps = [
    { label: "Visiteurs uniques", value: uniqueVisitors, icon: Eye },
    { label: "Clics « Réserver »", value: bookingClicks, icon: MousePointerClick },
    { label: "Réservations", value: bookingsCompleted, icon: CalendarCheck },
  ]
  const max = Math.max(1, uniqueVisitors)

  if (uniqueVisitors === 0 && bookingClicks === 0 && bookingsCompleted === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Pas encore de trafic mesuré sur votre site pour cette période.
      </p>
    )
  }

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {steps.map((s) => {
          const Icon = s.icon
          return (
            <li key={s.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {s.label}
                </span>
                <span className="tabular-nums font-semibold text-foreground">{s.value.toLocaleString("fr-FR")}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (s.value / max) * 100)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Taux de conversion :{" "}
        <span className="font-semibold text-foreground">
          {conversionRate === null ? "—" : `${conversionRate.toLocaleString("fr-FR")}\u00A0%`}
        </span>{" "}
        des visiteurs réservent.
      </p>
    </div>
  )
}
