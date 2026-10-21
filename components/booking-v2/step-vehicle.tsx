"use client"

import { Check, Plus, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { addExtraService, extraServiceCandidates, formatPriceCompact, isPlateValid, needsPlate, newV2Vehicle, removeExtraService, type V2Vehicle } from "@/lib/booking/v2"
import { resolvePrice, type OptionRow, type PriceMap, type ServiceRow, type VehicleRow } from "@/components/booking/shared"
import type { BookingSuggestion } from "@/lib/booking/promotions-apply"
import { SectionLabel, bv2InputClass, bv2LabelClass } from "./step-header"

type Props = {
  vehicles: V2Vehicle[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  /** L22 : prestations ajoutables à chaque véhicule (panier libre). */
  services: ServiceRow[]
  priceMap: PriceMap
  serviceId: number | null
  /** Au plus 2 suggestions calculées par le serveur ; jamais ajoutées sans clic. */
  suggestions: BookingSuggestion[]
  onSuggestion: (s: BookingSuggestion) => void
  maxVehicles: number
  onChange: (vehicles: V2Vehicle[]) => void
}

export function StepVehicle({ vehicles, vehicleTypes, options, services, priceMap, serviceId, suggestions, onSuggestion, maxVehicles, onChange }: Props) {
  function update(uid: string, patch: Partial<V2Vehicle>) {
    onChange(vehicles.map((v) => (v.uid === uid ? { ...v, ...patch } : v)))
  }

  function toggleOption(v: V2Vehicle, optionId: number) {
    const optionIds = v.optionIds.includes(optionId)
      ? v.optionIds.filter((id) => id !== optionId)
      : [...v.optionIds, optionId]
    update(v.uid, { optionIds })
  }

  // Capacité inchangée (D5) : une prestation = une place, comme au serveur.
  const placesUsed = vehicles.reduce((n, v) => n + 1 + (v.extraServiceIds ?? []).filter((id) => id !== serviceId).length, 0)
  const placesLeft = Math.max(1, maxVehicles) - placesUsed
  const canAdd = placesLeft > 0
  const mainService = services.find((s) => s.id === serviceId)
  const priceFor = (v: V2Vehicle, id: number) =>
    v.vehicleTypeId != null ? resolvePrice(services, priceMap, id, v.vehicleTypeId).priceCents : (services.find((s) => s.id === id)?.basePriceCents ?? 0)
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

          {mainService && (
            <>
              <SectionLabel>PRESTATIONS</SectionLabel>
              <ul className="flex flex-col gap-2">
                <li className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-primary/10 px-3 py-2.5">
                  <span className="text-[13.5px] font-semibold text-foreground">{mainService.name}</span>
                  <span className="shrink-0 text-[13px] font-bold text-primary">{formatPriceCompact(priceFor(v, mainService.id))}</span>
                </li>
                {(v.extraServiceIds ?? []).filter((id) => id !== serviceId).map((id) => {
                  const s = services.find((x) => x.id === id)
                  if (!s) return null
                  return (
                    <li key={id} className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-primary/10 px-3 py-2.5">
                      <span className="text-[13.5px] font-semibold text-foreground">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-bold text-primary">+{formatPriceCompact(priceFor(v, id))}</span>
                        <button
                          type="button"
                          aria-label={`Retirer ${s.name}`}
                          onClick={() => onChange(vehicles.map((x) => (x.uid === v.uid ? removeExtraService(x, id) : x)))}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {needsPlate(v, serviceId) && (
                <div className="mt-3">
                  <label htmlFor={`plate-${v.uid}`} className={bv2LabelClass}>
                    Immatriculation
                  </label>
                  <input
                    id={`plate-${v.uid}`}
                    value={v.plate ?? ""}
                    onChange={(e) => update(v.uid, { plate: e.target.value.toUpperCase() })}
                    placeholder="Ex. AB-123-CD"
                    autoComplete="off"
                    required
                    aria-invalid={Boolean(v.plate) && !isPlateValid(v.plate)}
                    className={cn(bv2InputClass, "bg-background uppercase placeholder:normal-case")}
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Demandée car ce véhicule reçoit plusieurs prestations : elle permet de ne jamais vous facturer deux fois le même traitement.
                  </p>
                </div>
              )}
              {extraServiceCandidates(services, v, serviceId).length > 0 && placesLeft <= 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nombre maximal de prestations par réservation atteint. Pour en ajouter d&apos;autres, contactez directement le professionnel.
                </p>
              )}
              {extraServiceCandidates(services, v, serviceId).length > 0 && placesLeft > 0 && (
                <div className="mt-2">
                  <label htmlFor={`add-${v.uid}`} className="sr-only">
                    Ajouter une prestation
                  </label>
                  <select
                    id={`add-${v.uid}`}
                    value=""
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id) onChange(vehicles.map((x) => (x.uid === v.uid ? addExtraService(x, id, serviceId) : x)))
                    }}
                    className={cn(bv2InputClass, "bg-background text-[13.5px]")}
                  >
                    <option value="">+ Ajouter une prestation pour ce véhicule</option>
                    {extraServiceCandidates(services, v, serviceId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {formatPriceCompact(priceFor(v, s.id))}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

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

      {suggestions.length > 0 && (
        <div className="mb-3.5 flex flex-col gap-2" aria-label="Suggestions">
          {suggestions.map((sg, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-3">
              <span className="flex min-w-0 items-start gap-2 text-[13px] text-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-pretty">{sg.text}</span>
              </span>
              {sg.add && (
                <button
                  type="button"
                  onClick={() => onSuggestion(sg)}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Ajouter
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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
