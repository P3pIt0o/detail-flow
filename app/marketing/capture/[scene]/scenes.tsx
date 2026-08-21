"use client"

import Link from "next/link"
import { CalendarDays, Clock, Euro, Users, PackageMinus, TrendingUp } from "lucide-react"

import { StepVehicles } from "@/components/booking/step-vehicles"
import { BookingSummary } from "@/components/booking/booking-summary"
import { AdminCalendar } from "@/components/admin/admin-calendar"
import { InvoiceView } from "@/components/admin/invoice-view"
import { RevenueChart } from "@/components/admin/revenue-chart"
import { StatusBadge } from "@/components/admin/status-badge"
import { formatPrice, formatDateShort } from "@/lib/format"
import {
  DEMO_SERVICES,
  DEMO_CATEGORIES,
  DEMO_VEHICLE_TYPES,
  DEMO_OPTIONS,
  DEMO_PRICE_MAP,
  DEMO_VEHICLE_SELECTION,
  DEMO_TRAVEL,
  buildDemoCalendarBookings,
  DEMO_INVOICE,
  DEMO_INVOICE_ITEMS,
  DEMO_INVOICE_PAYMENTS,
  DEMO_INVOICE_EVENTS,
  DEMO_DASHBOARD_STATS,
  DEMO_DASHBOARD_REVENUE,
  buildDemoUpcoming,
} from "@/lib/marketing/preview-demo"

export type Scene = "booking" | "quote" | "calendar" | "invoice" | "dashboard"

export function SceneContent({ scene }: { scene: Scene }) {
  switch (scene) {
    case "booking":
      return (
        <div className="mx-auto max-w-3xl">
          <StepVehicles
            vehicles={DEMO_VEHICLE_SELECTION}
            onChange={() => {}}
            services={DEMO_SERVICES}
            categories={DEMO_CATEGORIES}
            vehicleTypes={DEMO_VEHICLE_TYPES}
            options={DEMO_OPTIONS}
            priceMap={DEMO_PRICE_MAP}
          />
        </div>
      )
    case "quote":
      return (
        <div className="mx-auto max-w-md">
          <BookingSummary
            vehicles={DEMO_VEHICLE_SELECTION}
            services={DEMO_SERVICES}
            vehicleTypes={DEMO_VEHICLE_TYPES}
            options={DEMO_OPTIONS}
            priceMap={DEMO_PRICE_MAP}
            travel={DEMO_TRAVEL}
            depositType="percent"
            depositValue={30}
          />
        </div>
      )
    case "calendar":
      return <AdminCalendar bookings={buildDemoCalendarBookings()} />
    case "invoice":
      return (
        <InvoiceView
          invoice={DEMO_INVOICE}
          items={DEMO_INVOICE_ITEMS}
          payments={DEMO_INVOICE_PAYMENTS}
          events={DEMO_INVOICE_EVENTS}
        />
      )
    case "dashboard":
      return <DashboardPreview />
    default:
      return null
  }
}

/* Réplique fidèle du tableau de bord admin, alimentée en données de démo. */
function DashboardPreview() {
  const stats = DEMO_DASHBOARD_STATS
  const upcoming = buildDemoUpcoming()
  const cards = [
    { label: "Réservations à venir", value: String(stats.upcomingCount), icon: CalendarDays },
    { label: "En attente d'acompte", value: String(stats.pendingCount), icon: Clock },
    { label: "CA du mois", value: formatPrice(stats.monthRevenueCents), icon: Euro },
    { label: "Clients", value: String(stats.totalClients), icon: Users },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vue d&apos;ensemble de votre activité.</p>
      </header>

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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Euro className="size-4" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatPrice(stats.monthRevenueCents)}</p>
          <p className="text-xs text-muted-foreground">Chiffre d&apos;affaires (mois)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <PackageMinus className="size-4" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatPrice(stats.monthProductsCents)}</p>
          <p className="text-xs text-muted-foreground">Charges produits / consommables</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="size-4" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatPrice(stats.monthResultCents)}</p>
          <p className="text-xs text-muted-foreground">Résultat estimé</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-3">
          <h2 className="mb-6 text-sm font-semibold text-foreground">Chiffre d&apos;affaires (6 derniers mois)</h2>
          <RevenueChart data={DEMO_DASHBOARD_REVENUE} />
        </section>

        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Prochaines réservations</h2>
            <Link href="#" className="text-xs font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </div>
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
                  <span className="text-sm font-semibold text-foreground">{formatPrice(b.totalCents)}</span>
                  <StatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
