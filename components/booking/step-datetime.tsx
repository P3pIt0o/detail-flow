"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateLong } from "@/lib/format"
import { getAvailabilityAction } from "@/app/(site)/reservation/actions"

type Props = {
  date: string | null
  startTime: string | null
  durationMin: number
  vehicleCount: number
  onSelectDate: (date: string) => void
  onSelectTime: (time: string) => void
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const REASON_LABELS: Record<string, string> = {
  closed: "Fermé ce jour-là.",
  time_off: "Indisponible (congés).",
  full: "Journée complète.",
  past: "Date passée.",
  no_duration: "Ajoutez d'abord une prestation.",
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function StepDateTime({
  date,
  startTime,
  durationMin,
  vehicleCount,
  onSelectDate,
  onSelectTime,
}: Props) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [slots, setSlots] = useState<string[]>([])
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadSlots = useCallback(
    async (d: string) => {
      setLoading(true)
      setReason(null)
      try {
        const res = await getAvailabilityAction(d, durationMin, vehicleCount)
        setSlots(res.slots)
        if (!res.available) setReason(res.reason ? REASON_LABELS[res.reason] : "Aucun créneau disponible.")
      } catch {
        setReason("Erreur de chargement des créneaux.")
        setSlots([])
      } finally {
        setLoading(false)
      }
    },
    [durationMin, vehicleCount],
  )

  // Recharge les créneaux si la date ou la durée change.
  useEffect(() => {
    if (date) loadSlots(date)
  }, [date, loadSlots])

  // Grille du mois affiché.
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const todayStr = toDateStr(today)

  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toDateStr(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d)))
  }

  const canGoPrev = viewMonth > new Date(today.getFullYear(), today.getMonth(), 1)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Calendrier */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            className="rounded-md p-2 text-card-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-serif text-base font-semibold capitalize text-card-foreground">
            {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(viewMonth)}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
            className="rounded-md p-2 text-card-foreground transition-colors hover:bg-muted"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-1 text-xs font-medium text-muted-foreground">
              {d}
            </span>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <span key={`empty-${i}`} />
            const isPast = cell < todayStr
            const isSelected = cell === date
            return (
              <button
                key={cell}
                type="button"
                disabled={isPast}
                onClick={() => onSelectDate(cell)}
                className={cn(
                  "aspect-square rounded-md text-sm transition-colors",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : isPast
                      ? "cursor-not-allowed text-muted-foreground/30"
                      : "text-card-foreground hover:bg-primary/15",
                )}
              >
                {Number.parseInt(cell.slice(-2), 10)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Créneaux */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-base font-semibold text-card-foreground">Créneaux disponibles</h3>
        {!date ? (
          <p className="mt-3 text-sm text-muted-foreground">Sélectionnez d'abord une date.</p>
        ) : loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Recherche des disponibilités…
          </div>
        ) : slots.length > 0 ? (
          <>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{formatDateLong(date)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSelectTime(s)}
                  aria-pressed={startTime === s}
                  className={cn(
                    "rounded-lg border py-2 text-sm transition-colors",
                    startTime === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-card-foreground hover:border-primary/50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{reason ?? "Aucun créneau disponible ce jour-là."}</p>
        )}
      </div>
    </div>
  )
}
