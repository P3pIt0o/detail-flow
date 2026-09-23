"use client"

import { useState } from "react"
import useSWR from "swr"
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatKm } from "@/lib/format"
import { dateWindow, formatPriceCompact, formatSlotLabel, groupSlots } from "@/lib/booking/v2"
import { computeTravelAction, getAvailabilityRangeAction } from "@/app/(site)/reservation/actions"
import { TRAVEL_ERRORS } from "@/components/booking/step-contact"
import type { TravelResult } from "@/lib/booking/types"
import { SectionLabel, bv2InputClass, bv2LabelClass } from "./step-header"

const WINDOW_DAYS = 14

const REASON_LABELS: Record<string, string> = {
  closed: "Fermé",
  time_off: "Congés",
  full: "Complet",
  past: "Indisponible",
  no_duration: "Indisponible",
}

const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" })

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map((n) => Number.parseInt(n, 10))
  return new Date(y, m - 1, d)
}

function stripDot(s: string): string {
  return s.replace(/\.$/, "")
}

type Props = {
  date: string | null
  startTime: string | null
  durationMin: number
  vehicleCount: number
  onSelectSlot: (date: string, time: string) => void
  address: string
  onAddress: (address: string) => void
  travel: TravelResult | null
  onTravel: (travel: TravelResult | null) => void
  roundTrip: boolean
  freeDistanceKm: number
}

export function StepDateTime({
  date,
  startTime,
  durationMin,
  vehicleCount,
  onSelectSlot,
  address,
  onAddress,
  travel,
  onTravel,
  roundTrip,
  freeDistanceKm,
}: Props) {
  const [offset, setOffset] = useState(0)
  const [pickedDate, setPickedDate] = useState<string | null>(date)
  const [calculating, setCalculating] = useState(false)

  const dates = dateWindow(new Date(), offset, WINDOW_DAYS)
  const { data, error, isLoading } = useSWR(
    durationMin > 0 ? ["bv2-availability", dates[0], durationMin, vehicleCount] : null,
    () => getAvailabilityRangeAction(dates, durationMin, vehicleCount),
    { revalidateOnFocus: false, keepPreviousData: false },
  )

  const byDate = new Map((data ?? []).map((d) => [d.date, d]))
  const firstAvailable = data?.find((d) => d.available && d.slots.length > 0)?.date ?? null
  // Date affichée : choix explicite si visible dans la fenêtre, sinon 1re date disponible (clic évité).
  const activeDate = pickedDate && byDate.has(pickedDate) ? pickedDate : firstAvailable
  const activeDay = activeDate ? byDate.get(activeDate) : undefined
  const { morning, afternoon } = groupSlots(activeDay?.slots ?? [])

  async function checkAddress() {
    if (address.trim().length < 5 || calculating) return
    setCalculating(true)
    try {
      onTravel(await computeTravelAction(address))
    } catch {
      onTravel({
        ok: false,
        error: "route_failed",
        address,
        lat: null,
        lng: null,
        distanceKm: 0,
        billedDistanceKm: 0,
        feeCents: 0,
      })
    } finally {
      setCalculating(false)
    }
  }

  function renderSlots(label: string, slots: string[]) {
    if (slots.length === 0 || !activeDate) return null
    return (
      <>
        <SectionLabel>{label}</SectionLabel>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((s) => {
            const selected = date === activeDate && startTime === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelectSlot(activeDate, s)}
                aria-pressed={selected}
                className={cn(
                  "min-h-11 rounded-lg border text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50",
                )}
              >
                {formatSlotLabel(s)}
              </button>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div>
      {/* Lieu : le moteur facture le déplacement depuis l'adresse d'intervention (obligatoire). */}
      <SectionLabel className="mt-0">LIEU D&apos;INTERVENTION</SectionLabel>
      <div className="rounded-2xl border border-border bg-card p-4">
        <label htmlFor="bv2-address" className={bv2LabelClass}>
          Adresse complète
        </label>
        <div className="flex gap-2">
          <input
            id="bv2-address"
            value={address}
            onChange={(e) => {
              onAddress(e.target.value)
              onTravel(null)
            }}
            onBlur={() => {
              if (!travel) checkAddress()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                checkAddress()
              }
            }}
            placeholder="N°, rue, code postal, ville"
            autoComplete="street-address"
            required
            className={cn(bv2InputClass, "bg-background")}
          />
          <button
            type="button"
            onClick={checkAddress}
            disabled={calculating || address.trim().length < 5}
            aria-label="Vérifier l'adresse"
            className="flex min-w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
          >
            {calculating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <MapPin className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <div aria-live="polite">
          {travel && !travel.ok && (
            <p className="mt-2.5 flex items-start gap-2 text-[13px] leading-relaxed text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {travel.error ? TRAVEL_ERRORS[travel.error] : "Calcul impossible."}
            </p>
          )}
          {travel?.ok && (
            <div className="mt-2.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Zone couverte · {formatKm(travel.distanceKm)}
              </span>
              <span className="font-semibold text-foreground">
                {travel.feeCents === 0 ? "Déplacement offert" : `+${formatPriceCompact(travel.feeCents)} déplacement`}
              </span>
            </div>
          )}
          {!travel && freeDistanceKm > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Déplacement offert jusqu&apos;à {formatKm(freeDistanceKm)}
              {roundTrip ? " (facturé aller-retour au-delà)" : ""}.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <SectionLabel className="my-0">DATE</SectionLabel>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - WINDOW_DAYS))}
            disabled={offset === 0}
            aria-label="Dates précédentes"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + WINDOW_DAYS)}
            disabled={offset >= 180}
            aria-label="Dates suivantes"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="-mx-4 mt-2.5 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {dates.map((key) => {
          const day = byDate.get(key)
          const d = parseKey(key)
          const available = Boolean(day?.available && day.slots.length > 0)
          const selected = key === activeDate
          return (
            <button
              key={key}
              type="button"
              disabled={!available}
              onClick={() => setPickedDate(key)}
              aria-pressed={selected}
              aria-label={d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              className={cn(
                "flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border px-1 py-2.5 transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : available
                    ? "border-border bg-card text-foreground hover:border-primary/50"
                    : "border-border bg-card text-muted-foreground opacity-50",
              )}
            >
              <span className="text-[11px] font-medium capitalize">{stripDot(weekdayFmt.format(d))}</span>
              <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
              <span className="text-[11px]">
                {isLoading || !day
                  ? stripDot(monthFmt.format(d))
                  : available
                    ? stripDot(monthFmt.format(d))
                    : (day.publicLabel ?? REASON_LABELS[day.reason ?? "full"] ?? "Complet")}
              </span>
            </button>
          )
        })}
      </div>

      <div aria-live="polite">
        {isLoading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Recherche des disponibilités…
          </p>
        ) : error ? (
          <p className="mt-5 text-sm text-destructive">Impossible de charger les disponibilités. Réessayez.</p>
        ) : !activeDate ? (
          <p className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
            Aucun créneau disponible sur ces dates. Consultez les dates suivantes.
          </p>
        ) : (
          <>
            {renderSlots("MATIN", morning)}
            {renderSlots("APRÈS-MIDI", afternoon)}
          </>
        )}
      </div>
    </div>
  )
}
