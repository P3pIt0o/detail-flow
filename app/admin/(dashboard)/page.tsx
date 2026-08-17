import Link from "next/link"
import { Euro, PackageMinus, TrendingUp, CalendarDays, ArrowRight, AlertCircle, Clock } from "lucide-react"
import {
  getDashboardStats,
  getUpcomingBookingsDetailed,
  getDashboardWeek,
} from "@/lib/admin/queries"
import { listCustomRequests } from "@/lib/custom-requests-queries"
import { formatPrice, formatDateShort } from "@/lib/format"
import { StatusBadge } from "@/components/admin/status-badge"
import { DashboardWeek } from "@/components/admin/dashboard-week"
import { withTenant } from "@/lib/tenant-link"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await searchParams
  const href = (path: string) => withTenant(path, tenant ?? null)

  // Toutes les lectures sont scopées au tenant courant (companyId résolu côté
  // serveur dans chaque requête). Une seule salve parallèle.
  const [stats, upcoming, week, requests] = await Promise.all([
    getDashboardStats(),
    getUpcomingBookingsDetailed(5),
    getDashboardWeek(),
    listCustomRequests(),
  ])

  // Demandes "à traiter" = reçues (new) ou proposition envoyée en attente de réponse.
  const pendingRequests = requests.filter((r) => r.status === "new" || r.status === "proposal_sent").length

  // KPI : 4 cartes compactes, période = mois en cours.
  const kpis = [
    { label: "CA du mois", value: formatPrice(stats.monthRevenueCents), icon: Euro, accent: true },
    { label: "Dépenses produits", value: formatPrice(stats.monthProductsCents), icon: PackageMinus, accent: false },
    { label: "Bénéfice estimé", value: formatPrice(stats.monthResultCents), icon: TrendingUp, accent: true },
    { label: "Rendez-vous du mois", value: String(stats.monthBookingsCount), icon: CalendarDays, accent: false },
  ]

  // Zone d'alertes : uniquement si une action est réellement nécessaire.
  const alerts: { label: string; href: string }[] = []
  if (stats.pendingCount > 0) {
    alerts.push({
      label: `${stats.pendingCount} réservation${stats.pendingCount > 1 ? "s" : ""} en attente d'acompte`,
      href: href("/admin/reservations"),
    })
  }
  if (pendingRequests > 0) {
    alerts.push({
      label: `${pendingRequests} demande${pendingRequests > 1 ? "s" : ""} personnalisée${pendingRequests > 1 ? "s" : ""} à traiter`,
      href: href("/admin/demandes"),
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">Votre activité en un coup d&apos;œil.</p>
      </header>

      {/* 1. KPI principaux (4 cartes compactes) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div
              className={
                accent
                  ? "mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  : "mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground"
              }
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Bénéfice estimé = chiffre d&apos;affaires − dépenses produits du mois. Estimation indicative, non comptable.
      </p>

      {/* 4. À surveiller — masqué s'il n'y a rien à signaler */}
      {alerts.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertCircle className="size-4 text-amber-500" aria-hidden="true" />
            À surveiller
          </h2>
          <ul className="flex flex-col gap-1.5">
            {alerts.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                >
                  {a.label}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Aperçu du calendrier (élément principal) */}
      <div className="mt-6">
        <DashboardWeek week={week} planningHref={href("/admin/calendrier")} />
      </div>

      {/* 3. Prochains rendez-vous */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Prochains rendez-vous</h2>
          <Link href={href("/admin/reservations")} className="text-xs font-medium text-primary hover:underline">
            Tout voir
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun rendez-vous à venir.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center rounded-lg bg-muted px-2.5 py-1.5 text-center">
                    <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="mt-0.5 text-xs font-semibold text-foreground">{b.startTime}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{b.customerName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(b.date)}</p>
                    {b.services.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {b.services.join(" · ")}
                        {b.vehicles.length > 0 && ` — ${b.vehicles.join(", ")}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-foreground">{formatPrice(b.totalCents)}</span>
                  <StatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
