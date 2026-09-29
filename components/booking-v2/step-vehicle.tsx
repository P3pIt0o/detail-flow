"use client"

import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { formatPriceCompact, newV2Vehicle, type V2Vehicle } from "@/lib/booking/v2"
import type { OptionRow, VehicleRow } from "@/components/booking/shared"
import { SectionLabel, bv2InputClass, bv2LabelClass } from "./step-header"

type Props = {
  vehicles: V2Vehicle[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  maxVehicles: number
  onChange: (vehicles: V2Vehicle[]) => void
}

export function StepVehicle({ vehicles, vehicleTypes, options, maxVehicles, onChange }: Props) {
  function update(uid: string, patch: Partial<V2Vehicle>) {
    onChange(vehicles.map((v) => (v.uid === uid ? { ...v, ...patch } : v)))
  }

  function toggleOption(v: V2Vehicle, optionId: number) {
    const optionIds = v.optionIds.includes(optionId)
      ? v.optionIds.filter((id) => id !== optionId)
      : [...v.optionIds, optionId]
    update(v.uid, { optionIds })
  }

  const canAdd = vehicles.length < Math.max(1, maxVehicles)
  const showTypes = vehicleTypes.length > 1

  return (
    <div>
      {vehicles.map((v, index) => (
        <fieldset key={v.uid} className="mb-3.5 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <legend className="text-sm font-bold text-foreground">Véhicule {index + 1}</legend>
            {vehicles.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(vehicles.filter((x) => x.uid !== v.uid))}
                className="text-[13px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Supprimer
              </button>
            )}
          </div>

          {showTypes && (
            <div className="mb-3.5">
              <p className={bv2LabelClass} id={`type-${v.uid}`}>
                Type de véhicule
              </p>
              <div role="group" aria-labelledby={`type-${v.uid}`} className="grid grid-cols-2 gap-2">
                {vehicleTypes.map((t) => {
                  const selected = v.vehicleTypeId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => update(v.uid, { vehicleTypeId: t.id })}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-12 flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-colors",
                        selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50",
                      )}
                    >
                      <span className="text-[13.5px] font-semibold text-foreground">{t.name}</span>
                      {t.examples?.trim() && (
                        <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{t.examples}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor={`brand-${v.uid}`} className={bv2LabelClass}>
                Marque
              </label>
              <input
                id={`brand-${v.uid}`}
                value={v.brand}
                onChange={(e) => update(v.uid, { brand: e.target.value })}
                placeholder="Ex. Peugeot"
                autoComplete="off"
                required
                className={cn(bv2InputClass, "bg-background")}
              />
            </div>
            <div>
              <label htmlFor={`model-${v.uid}`} className={bv2LabelClass}>
                Modèle
              </label>
              <input
                id={`model-${v.uid}`}
                value={v.model}
                onChange={(e) => update(v.uid, { model: e.target.value })}
                placeholder="Ex. 308"
                autoComplete="off"
                required
                className={cn(bv2InputClass, "bg-background")}
              />
            </div>
          </div>

          {options.length > 0 && (
            <>
              <SectionLabel>OPTIONS</SectionLabel>
              <div className="flex flex-col gap-2">
                {options.map((o) => {
                  const selected = v.optionIds.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleOption(v, o.id)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                          aria-hidden="true"
                        >
                          {selected && <Check className="size-2.5" strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-foreground">{o.name}</span>
                          {o.durationMin > 0 && (
                            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                              +{formatDuration(o.durationMin)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-bold text-primary">
                        +{formatPriceCompact(o.priceCents)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </fieldset>
      ))}

      {canAdd && (
        <button
          type="button"
          onClick={() => onChange([...vehicles, newV2Vehicle(vehicleTypes)])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border p-3.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          Ajouter un véhicule
        </button>
      )}
    </div>
  )
}
