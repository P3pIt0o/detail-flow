"use client"

import Link from "next/link"
import useSWR from "swr"
import { CalendarPlus, Calendar, Check, Clock, Info, Loader2, MapPin } from "lucide-react"
import { formatDateLong, formatDuration } from "@/lib/format"
import { buildBookingIcs, formatPriceCompact, formatSlotLabel } from "@/lib/booking/v2"
import { withTenant } from "@/lib/tenant-link"
import { getBookingSummaryAction } from "@/app/(site)/reservation/actions"

type Props = { reference: string; tenant: string | null }

export function SuccessScreen({ reference, tenant }: Props) {
  const { data: summary, isLoading } = useSWR(["bv2-summary", reference], () => getBookingSummaryAction(reference), {
    revalidateOnFocus: false,
  })

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Finalisation…
      </p>
    )
  }

  const detailHref = withTenant(`/reservation/confirmation?ref=${encodeURIComponent(reference)}`, tenant)
  const confirmed = summary?.status === "confirmed"
  const awaitingDeposit = summary?.status === "pending_deposit" && summary.depositCents > 0
  const services = summary ? Array.from(new Set(summary.items.map((i) => i.serviceName))).join(", ") : ""

  function addToCalendar() {
    if (!summary) return
    const ics = buildBookingIcs({
      uid: `${summary.reference}@detailflow`,
      title: services || "Rendez-vous",
      description: `Référence ${summary.reference}`,
      location: summary.address,
      date: summary.date,
      startTime: summary.startTime,
      endTime: summary.endTime,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `rendez-vous-${summary.reference}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success text-success-foreground">
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-balance text-2xl font-bold text-foreground">
        {confirmed ? "Rendez-vous confirmé" : "Réservation enregistrée"}
      </h1>
      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
        Un email récapitulatif vous a été envoyé. Référence{" "}
        <span className="font-semibold text-foreground">{reference}</span>
      </p>

      {summary && (
        <div className="mt-6 w-full rounded-2xl border border-border bg-card p-4 text-left">
          <p className="text-[15px] font-bold text-foreground">{services}</p>
          {summary.items.map((it, i) => (
            <p key={i} className="mt-0.5 text-[13px] text-muted-foreground">
              {[it.vehicle, it.vehicleTypeName].filter(Boolean).join(" · ")}
              {it.options.length > 0 && ` · ${it.options.join(", ")}`}
            </p>
          ))}
          <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-[13px] text-foreground">
            <li className="flex items-center gap-2.5">
              <Calendar className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="capitalize">{formatDateLong(summary.date)}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {formatSlotLabel(summary.startTime)} · {formatDuration(summary.totalDurationMin)}
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {summary.locationType === "workshop" ? `À l'atelier — ${summary.address}` : summary.address}
            </li>
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-lg font-bold text-foreground">{formatPriceCompact(summary.totalCents)}</span>
          </div>
        </div>
      )}

      {awaitingDeposit && summary && (
        <div className="mt-3 flex w-full items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-foreground">
            <span className="font-semibold">Acompte de {formatPriceCompact(summary.depositCents)} à régler</span> pour
            confirmer définitivement votre créneau. Les instructions sont dans l&apos;email et sur la page de détail.
          </p>
        </div>
      )}

      <div className="mt-6 flex w-full flex-col gap-2.5">
        {summary && (
          <button
            type="button"
            onClick={addToCalendar}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Ajouter au calendrier
          </button>
        )}
        <Link
          href={detailHref}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Voir le détail et gérer mon rendez-vous
        </Link>
      </div>
    </div>
  )
}
