import Link from "next/link"
import { getDashboardStats, getUpcomingBookings, getRevenueByMonth } from "@/lib/admin/queries"
import { formatPrice, formatDateShort } from "@/lib/format"
import { StatusBadge } from "@/components/admin/status-badge"
import { RevenueChart } from "@/components/admin/revenue-chart"
import { CalendarDays, Clock, Euro, Users } from "lucide-react"

export default async function DashboardPage() {
  const [stats, upcoming, revenue] = await Promise.all([
    getDashboardStats(),
    getUpcomingBookings(6),
    getRevenueByMonth(),
  ])

  const cards = [
    {
      label: "Réservations à venir",
      value: String(stats.upcomingCount),
      icon: CalendarDays,
    },
    {
      label: "En attente d'acompte",
      value: String(stats.pendingCount),
      icon: Clock,
    },
    {
      label: "CA du mois",
      value: formatPrice(stats.monthRevenueCents),
      icon: Euro,
    },
    {
      label: "Clients",
      value: String(stats.totalClients),
      icon: Users,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vue d&apos;ensemble de votre activité.
        </p>
      </header>

      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* CA par mois */}
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-3">
          <h2 className="mb-6 text-sm font-semibold text-foreground">
            Chiffre d&apos;affaires (6 derniers mois)
          </h2>
          <RevenueChart data={revenue} />
        </section>

        {/* Prochaines réservations */}
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Prochaines réservations</h2>
            <Link href="/admin/reservations" className="text-xs font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune réservation à venir.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{b.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(b.date)} · {b.startTime}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-foreground">
                      {formatPrice(b.totalCents)}
                    </span>
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
