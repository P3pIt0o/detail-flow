"use client"

import { Check, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { ServiceHighlightBadge } from "@/components/service-highlight-badge"
import { formatPriceCompact, servicePriceRange } from "@/lib/booking/v2"
import type { PriceMap, ServiceRow, VehicleRow } from "@/components/booking/shared"

type Props = {
  services: ServiceRow[]
  vehicleTypes: VehicleRow[]
  priceMap: PriceMap
  selectedId: number | null
  onSelect: (serviceId: number) => void
}

export function StepService({ services, vehicleTypes, priceMap, selectedId, onSelect }: Props) {
  if (services.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Aucune prestation n&apos;est proposée à la réservation en ligne pour le moment.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {services.map((s) => {
        const selected = selectedId === s.id
        const range = servicePriceRange(s, vehicleTypes, services, priceMap)
        const price =
          range.minCents === range.maxCents
            ? formatPriceCompact(range.minCents)
            : `dès ${formatPriceCompact(range.minCents)}`
        const duration =
          range.minDuration === range.maxDuration
            ? formatDuration(range.minDuration)
            : `dès ${formatDuration(range.minDuration)}`
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full flex-col rounded-2xl border p-4 text-left transition-colors",
                selected ? "border-primary bg-muted" : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span className="flex w-full items-start justify-between gap-2.5">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[15px] font-bold text-foreground">{s.name}</span>
                  <ServiceHighlightBadge kind={s.highlightKind} label={s.highlightLabel} />
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </span>
              {s.description?.trim() && (
                <span className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                  {s.description}
                </span>
              )}
              <span className="mt-2.5 flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {duration}
                </span>
                <span className="text-[15px] font-bold text-foreground">{price}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
