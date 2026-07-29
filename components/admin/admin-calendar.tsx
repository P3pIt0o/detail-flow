"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { statusMeta } from "@/lib/booking/status"
import { formatPrice } from "@/lib/format"
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog"
import type { CalendarBooking } from "@/lib/admin/types"

type ViewMode = "day" | "week" | "fortnight" | "month"

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "day", label: "Jour" },
  { key: "week", label: "7 jours" },
  { key: "fortnight", label: "15 jours" },
  { key: "month", label: "Mois" },
]

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

/* ------------------------------- Utilitaires ------------------------------ */

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
/** Lundi de la semaine contenant `d` (semaine ISO, lundi = début). */
function startOfWeek(d: Date) {
  const r = new Date(d)
  const day = (r.getDay() + 6) % 7 // 0 = lundi
  r.setDate(r.getDate() - day)
  r.setHours(0, 0, 0, 0)
  return r
}
function isSameDay(a: Date, b: Date) {
  return toISO(a) === toISO(b)
}

/* -------------------------------- Composant ------------------------------- */

export function AdminCalendar({ bookings }: { bookings: CalendarBooking[] }) {
  const [view, setView] = useState<ViewMode>("week")
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selected, setSelected] = useState<CalendarBooking | null>(null)

  // Regroupe les réservations par date ISO pour un accès O(1).
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>()
    for (const b of bookings) {
      const key = b.date.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(b)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [bookings])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function shift(dir: number) {
    if (view === "day") setAnchor(addDays(anchor, dir))
    else if (view === "week") setAnchor(addDays(anchor, dir * 7))
    else if (view === "fortnight") setAnchor(addDays(anchor, dir * 15))
    else {
      const r = new Date(anchor)
      r.setMonth(r.getMonth() + dir)
      setAnchor(r)
    }
  }

  const title = useMemo(() => {
    if (view === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    if (view === "day")
      return anchor.toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    const days = view === "week" ? 7 : 15
    const startD = view === "month" ? anchor : view === "day" ? anchor : startOfWeek(anchor)
    const endD = addDays(startD, days - 1)
    return `${startD.getDate()} ${MONTHS[startD.getMonth()]} – ${endD.getDate()} ${MONTHS[endD.getMonth()]}`
  }, [view, anchor])

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête : navigation + sélecteur de vue */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Calendrier</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{title}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Précédent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date()
                d.setHours(0, 0, 0, 0)
                setAnchor(d)
              }}
            >
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Suivant">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex rounded-lg border border-border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === v.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthView anchor={anchor} today={today} byDate={byDate} onSelect={setSelected} />
      ) : (
        <ListView
          view={view}
          anchor={anchor}
          today={today}
          byDate={byDate}
          onSelect={setSelected}
        />
      )}

      <BookingDetailDialog
        booking={selected}
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  )
}

/* ------------------------------ Vue Mois (grille) ------------------------- */

function MonthView({
  anchor,
  today,
  byDate,
  onSelect,
}: {
  anchor: Date
  today: Date
  byDate: Map<string, CalendarBooking[]>
  onSelect: (b: CalendarBooking) => void
}) {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          const iso = toISO(date)
          const dayBookings = byDate.get(iso) ?? []
          const inMonth = date.getMonth() === anchor.getMonth()
          const isToday = isSameDay(date, today)
          return (
            <div
              key={iso}
              className={cn(
                "min-h-24 border-b border-r border-border p-1.5 last:border-r-0",
                i % 7 === 6 && "border-r-0",
                !inMonth && "bg-muted/20",
              )}
            >
              <div
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  !inMonth && "opacity-40",
                )}
              >
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayBookings.slice(0, 3).map((b) => (
                  <EventChip key={b.id} booking={b} onSelect={onSelect} compact />
                ))}
                {dayBookings.length > 3 && (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    +{dayBookings.length - 3} autre{dayBookings.length - 3 > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------- Vues Jour / 7 jours / 15 jours ---------------------- */

function ListView({
  view,
  anchor,
  today,
  byDate,
  onSelect,
}: {
  view: ViewMode
  anchor: Date
  today: Date
  byDate: Map<string, CalendarBooking[]>
  onSelect: (b: CalendarBooking) => void
}) {
  const count = view === "day" ? 1 : view === "week" ? 7 : 15
  const start = view === "day" ? anchor : startOfWeek(anchor)
  const days = Array.from({ length: count }, (_, i) => addDays(start, i))

  return (
    <div className="space-y-3">
      {days.map((date) => {
        const iso = toISO(date)
        const dayBookings = byDate.get(iso) ?? []
        const isToday = isSameDay(date, today)
        const revenue = dayBookings
          .filter((b) => b.status === "confirmed" || b.status === "completed")
          .reduce((s, b) => s + b.totalCents, 0)
        return (
          <div
            key={iso}
            className={cn(
              "rounded-xl border border-border p-4",
              isToday && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold capitalize text-foreground">
                  {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </span>
                {isToday && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Aujourd&apos;hui
                  </span>
                )}
              </div>
              {revenue > 0 && (
                <span className="text-xs font-medium text-muted-foreground">
                  CA {formatPrice(revenue)}
                </span>
              )}
            </div>
            {dayBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune réservation.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {dayBookings.map((b) => (
                  <EventChip key={b.id} booking={b} onSelect={onSelect} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------ Puce événement ---------------------------- */

function EventChip({
  booking,
  onSelect,
  compact = false,
}: {
  booking: CalendarBooking
  onSelect: (b: CalendarBooking) => void
  compact?: boolean
}) {
  const meta = statusMeta(booking.status)
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSelect(booking)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
        title={`${booking.startTime} ${booking.customerName}`}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
        <span className="truncate font-medium text-foreground">{booking.startTime}</span>
        <span className="truncate text-muted-foreground">{booking.customerName}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
    >
      <span className={cn("h-8 w-1 shrink-0 rounded-full", meta.dot)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{booking.customerName}</p>
        <p className="text-xs text-muted-foreground">
          {booking.startTime}–{booking.endTime} · {booking.vehicles} véh.
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {formatPrice(booking.totalCents)}
      </span>
    </button>
  )
}
