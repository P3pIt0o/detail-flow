"use client"

import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPrice, formatDuration } from "@/lib/format"
import { VehicleCategoryHelp } from "./vehicle-category-help"
import { ServiceHighlightBadge } from "@/components/service-highlight-badge"
import {
  serviceLineTotals,
  newServiceLine,
  type VehicleSelection,
  type ServiceLine,
  type ServiceRow,
  type CategoryRow,
  type VehicleRow,
  type OptionRow,
  type PriceMap,
} from "./shared"

type Props = {
  vehicles: VehicleSelection[]
  onChange: (vehicles: VehicleSelection[]) => void
  services: ServiceRow[]
  categories: CategoryRow[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  priceMap: PriceMap
}

export function StepVehicles({
  vehicles,
  onChange,
  services,
  categories,
  vehicleTypes,
  options,
  priceMap,
}: Props) {
  function update(uid: string, patch: Partial<VehicleSelection>) {
    onChange(vehicles.map((v) => (v.uid === uid ? { ...v, ...patch } : v)))
  }

  function updateLines(uid: string, lines: ServiceLine[]) {
    update(uid, { services: lines })
  }

  function addVehicle() {
    onChange([
      ...vehicles,
      {
        uid: crypto.randomUUID(),
        vehicleTypeId: null,
        services: [newServiceLine()],
      },
    ])
  }

  function removeVehicle(uid: string) {
    onChange(vehicles.filter((v) => v.uid !== uid))
  }

  function addServiceLine(v: VehicleSelection) {
    updateLines(v.uid, [...v.services, newServiceLine()])
  }

  function removeServiceLine(v: VehicleSelection, lid: string) {
    updateLines(v.uid, v.services.filter((l) => l.lid !== lid))
  }

  function setLineService(v: VehicleSelection, lid: string, serviceId: number) {
    updateLines(
      v.uid,
      v.services.map((l) => (l.lid === lid ? { ...l, serviceId } : l)),
    )
  }

  function toggleLineOption(v: VehicleSelection, lid: string, optId: number) {
    updateLines(
      v.uid,
      v.services.map((l) => {
        if (l.lid !== lid) return l
        const optionIds = l.optionIds.includes(optId)
          ? l.optionIds.filter((id) => id !== optId)
          : [...l.optionIds, optId]
        return { ...l, optionIds }
      }),
    )
  }

  return (
    <div className="space-y-6">
      {vehicles.map((v, index) => (
        <div key={v.uid} className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-card-foreground">Véhicule {index + 1}</h3>

            {vehicles.length > 1 && (
              <button
                type="button"
                onClick={() => removeVehicle(v.uid)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Retirer
              </button>
            )}
          </div>

          {/* Type de véhicule — s'applique à toutes les prestations du véhicule */}
          <fieldset className="mb-5">
            <legend className="mb-1 text-sm font-medium text-card-foreground">Type de véhicule</legend>

            <div className="mb-2">
              <VehicleCategoryHelp
                vehicleTypes={vehicleTypes}
                onSelect={(vehicleTypeId) => update(v.uid, { vehicleTypeId })}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {vehicleTypes.map((t) => {
                const selected = v.vehicleTypeId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update(v.uid, { vehicleTypeId: t.id })}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-card-foreground hover:border-primary/50",
                    )}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Détails du véhicule — marque et modèle obligatoires */}
          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-medium text-card-foreground">Détails du véhicule</legend>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <input
                  type="text"
                  required
                  value={v.brand ?? ""}
                  onChange={(e) => update(v.uid, { brand: e.target.value })}
                  placeholder="Marque *"
                  aria-label={`Marque du véhicule ${index + 1}`}
                  aria-required="true"
                  aria-invalid={!v.brand?.trim()}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {!v.brand?.trim() && <p className="mt-1 text-xs text-destructive">Champ obligatoire</p>}
              </div>

              <div>
                <input
                  type="text"
                  required
                  value={v.model ?? ""}
                  onChange={(e) => update(v.uid, { model: e.target.value })}
                  placeholder="Modèle *"
                  aria-label={`Modèle du véhicule ${index + 1}`}
                  aria-required="true"
                  aria-invalid={!v.model?.trim()}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {!v.model?.trim() && <p className="mt-1 text-xs text-destructive">Champ obligatoire</p>}
              </div>
            </div>
          </fieldset>

          {/* Prestations — une ou plusieurs, chacune avec ses propres options */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-card-foreground">Prestations</legend>

            <div className="space-y-4">
              {v.services.map((line, lineIndex) => {
                const preview = serviceLineTotals(line, v.vehicleTypeId, services, options, priceMap)
                return (
                  <div key={line.lid} className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-card-foreground">Prestation {lineIndex + 1}</span>
                      {v.services.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeServiceLine(v, line.lid)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Retirer
                        </button>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {services.map((s) => {
                        const cat = categories.find((c) => c.id === s.categoryId)
                        const selected = line.serviceId === s.id
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setLineService(v, line.lid, s.id)}
                            aria-pressed={selected}
                            className={cn(
                              "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-border bg-card hover:border-primary/50",
                            )}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="text-sm font-medium text-card-foreground">{s.name}</span>
                                <ServiceHighlightBadge kind={s.highlightKind} label={s.highlightLabel} />
                              </span>
                              {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                            </span>
                            {cat && <span className="mt-0.5 text-xs text-muted-foreground">{cat.name}</span>}
                            <span className="mt-1 text-xs text-muted-foreground">
                              À partir de {formatPrice(s.basePriceCents)} · {formatDuration(s.durationMin)}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Options de cette prestation */}
                    {options.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Options complémentaires (facultatif)
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {options.map((o) => {
                            const checked = line.optionIds.includes(o.id)
                            return (
                              <label
                                key={o.id}
                                className={cn(
                                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                                  checked
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-card hover:border-primary/50",
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "flex h-4 w-4 items-center justify-center rounded border",
                                      checked ? "border-primary bg-primary" : "border-muted-foreground/50",
                                    )}
                                  >
                                    {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                                  </span>
                                  <span className="text-sm text-card-foreground">{o.name}</span>
                                </span>
                                <span className="shrink-0 text-sm text-muted-foreground">
                                  +{formatPrice(o.priceCents)}
                                </span>
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={checked}
                                  onChange={() => toggleLineOption(v, line.lid, o.id)}
                                />
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {line.serviceId && v.vehicleTypeId && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sous-total prestation :{" "}
                        <span className="font-semibold text-primary">{formatPrice(preview.priceCents)}</span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => addServiceLine(v)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-card-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Ajouter une prestation
            </button>
          </fieldset>
        </div>
      ))}

      <button
        type="button"
        onClick={addVehicle}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 py-4 text-sm font-medium text-card-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        Ajouter un véhicule
      </button>
    </div>
  )
}
