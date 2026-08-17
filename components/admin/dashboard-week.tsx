"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DashboardWeekDay } from "@/lib/admin/queries"

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

/** Légende / style de chaque état de journée (mêmes règles que le tunnel). */
const STATE_META: Record<
  DashboardWeekDay["state"],
  { label: string; dot: string; cell: string }
> = {
  open: { label: "Disponible", dot: "bg-emerald-500", cell: "border-border" },
  partial: { label: "Rendez-vous", dot: "bg-primary", cell: "border-primary/40 bg-primary/5" },
  full: { label: "Complet", dot: "bg-amber-500", cell: "border-border" },
  time_off: { label: "Bloqué", dot: "bg-destructive", cell: "border-border bg-muted/40" },
  closed: { label: "Fermé", dot: "bg-muted-foreground/40", cell: "border-border bg-muted/40" },
  past: { label: "Passé", dot: "bg-muted-foreground/30", cell: "border-border opacity-60" },
}

function dayNumber(iso: string) {
  return Number(iso.slice(8, 10))
}
function isToday(iso: string) {
  const d = new Date()
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return iso === local
}

/**
 * Aperçu compact de la semaine en cours. Lecture seule : l'état de chaque jour
 * (disponible / rendez-vous / complet / bloqué / fermé) provient du moteur de
 * disponibilité partagé, calculé côté serveur. Le planning complet reste la
 * page Calendrier.
 */
export function DashboardWeek({ week, planningHref }: { week: DashboardWeekDay[]; planningHref: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Cette semaine</h2>
        <Link
          href={planningHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Planning complet
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* 7 colonnes en desktop, grille 7 compacte en mobile (jamais un calendrier desktop réduit). */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.map((d, i) => {
          const meta = STATE_META[d.state]
          const today = isToday(d.date)
          return (
            <div
              key={d.date}
              className={cn(
                "flex min-h-20 flex-col items-center rounded-lg border p-1.5 text-center sm:min-h-24 sm:p-2",
                meta.cell,
                today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              <span className="text-[10px] font-medium uppercase text-muted-foreground sm:text-xs">
                {WEEKDAYS[i]}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-sm font-bold sm:text-base",
                  today ? "text-primary" : "text-foreground",
                )}
              >
                {dayNumber(d.date)}
              </span>
              <span className={cn("mt-1 size-2 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
              {d.bookingsCount > 0 ? (
                <span className="mt-1 text-[10px] font-medium text-foreground sm:text-xs">
                  {d.bookingsCount} RDV
                </span>
              ) : (
                <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">{meta.label}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Légende sobre. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {(["partial", "open", "full", "time_off", "closed"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-2 rounded-full", STATE_META[s].dot)} aria-hidden="true" />
            {STATE_META[s].label}
          </li>
        ))}
      </ul>
    </section>
  )
}
