import {
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  MapPin,
  Settings,
  Sparkles,
  Store,
  Users,
} from "lucide-react"
import { StatusBadge } from "@/components/admin/status-badge"
import { cn } from "@/lib/utils"
import { DEMO_UPCOMING } from "./demo-data"

/**
 * Reproduction fidèle du tableau de bord DetailFlow Pro : mêmes entrées de menu
 * que `lib/admin/nav.ts`, même carte « Cette semaine » que `DashboardWeek`,
 * même badge de statut (`StatusBadge` réel, importé tel quel).
 */

const NAV = [
  { label: "Tableau de bord", icon: LayoutDashboard, active: true },
  { label: "Calendrier", icon: CalendarDays },
  { label: "Réservations", icon: ClipboardList },
  { label: "Demandes", icon: Inbox },
  { label: "Factures", icon: FileText },
  { label: "Clients", icon: Users },
  { label: "Prestations", icon: Sparkles },
  { label: "Page publique", icon: Globe },
  { label: "Paramètres", icon: Settings },
]

const WEEK = [
  { d: "Lun", n: 21, state: "partial", count: 2 },
  { d: "Mar", n: 22, state: "partial", count: 3 },
  { d: "Mer", n: 23, state: "full", count: 4 },
  { d: "Jeu", n: 24, state: "partial", count: 4, today: true },
  { d: "Ven", n: 25, state: "open", count: 0 },
  { d: "Sam", n: 26, state: "time_off", count: 0 },
  { d: "Dim", n: 27, state: "closed", count: 0 },
] as const

const STATE: Record<string, { label: string; dot: string; cell: string }> = {
  open: { label: "Disponible", dot: "bg-emerald-500", cell: "border-border" },
  partial: { label: "Rendez-vous", dot: "bg-primary", cell: "border-primary/40 bg-primary/5" },
  full: { label: "Complet", dot: "bg-amber-500", cell: "border-border" },
  time_off: { label: "Bloqué", dot: "bg-destructive", cell: "border-border bg-muted/40" },
  closed: { label: "Fermé", dot: "bg-muted-foreground/40", cell: "border-border bg-muted/40" },
}

export function WeekStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEK.map((day) => {
        const meta = STATE[day.state]
        return (
          <div
            key={day.d}
            className={cn(
              "flex flex-col items-center rounded-lg border p-1.5 text-center",
              compact ? "min-h-16" : "min-h-20",
              meta.cell,
              "today" in day && day.today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
          >
            <span className="text-[10px] font-medium uppercase text-muted-foreground">{day.d}</span>
            <span className={cn("mt-0.5 text-sm font-bold", "today" in day && day.today ? "text-primary" : "text-foreground")}>
              {day.n}
            </span>
            <span className={cn("mt-1 size-2 rounded-full", meta.dot)} aria-hidden="true" />
            {day.count > 0 ? (
              <span className="mt-1 text-[10px] font-medium text-foreground">{day.count} RDV</span>
            ) : (
              <span className="mt-1 text-[9.5px] text-muted-foreground">{meta.label}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DashboardMock({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[460px] text-left", className)}>
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card p-3 md:flex" aria-hidden="true">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-[15px] font-bold tracking-tight">DetailFlow</span>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
            Pro
          </span>
        </div>
        <ul className="mt-5 flex flex-col gap-0.5">
          {NAV.map(({ label, icon: Icon, active }) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t border-border px-2.5 pt-3">
          <p className="text-[10.5px] text-muted-foreground">Connecté en tant que</p>
          <p className="text-[12px] font-medium">Atelier Lumière Detailing</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[17px] font-semibold tracking-tight">Tableau de bord</p>
            <p className="text-[12px] text-muted-foreground">Jeudi 24 septembre</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground sm:inline-flex">
            <CalendarCheck className="size-3.5" aria-hidden="true" />
            Nouvelle réservation
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { k: "Aujourd'hui", v: "4 RDV" },
            { k: "Acomptes reçus", v: "3" },
            { k: "Demandes", v: "2 nouvelles" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-border bg-card p-3">
              <p className="truncate text-[10.5px] text-muted-foreground">{s.k}</p>
              <p className="mt-1 truncate text-[15px] font-semibold tracking-tight">{s.v}</p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-border bg-card p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12.5px] font-semibold">Cette semaine</p>
            <p className="text-[11px] font-medium text-primary">Planning complet</p>
          </div>
          <WeekStrip compact />
        </section>

        <section className="rounded-xl border border-border bg-card">
          <p className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold">Aujourd&apos;hui</p>
          <ul className="divide-y divide-border">
            {DEMO_UPCOMING.map((b) => (
              <li key={b.time} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-10 shrink-0 font-mono text-[12px] font-medium">{b.time}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">
                    {b.client} <span className="text-muted-foreground">· {b.vehicle}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    {b.place === "Atelier" ? (
                      <Store className="size-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    )}
                    {b.service}
                  </p>
                </div>
                <StatusBadge status={b.status} className="hidden shrink-0 text-[10.5px] lg:inline-flex" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
