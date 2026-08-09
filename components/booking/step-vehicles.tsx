"use client"

import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPrice, formatDuration } from "@/lib/format"
import {
  resolvePrice,
  type VehicleSelection,
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

  function addVehicle() {
    onChange([
      ...vehicles,
      {
        uid: crypto.randomUUID(),
        serviceId: null,
        vehicleTypeId: null,
        optionIds: [],
      },
    ])
  }

  function removeVehicle(uid: string) {
    onChange(vehicles.filter((v) => v.uid !== uid))
  }

  function toggleOption(uid: string, optId: number) {
    const v = vehicles.find((x) => x.uid === uid)
    if (!v) return

    const optionIds = v.optionIds.includes(optId)
      ? v.optionIds.filter((id) => id !== optId)
      : [...v.optionIds, optId]

    update(uid, { optionIds })
  }

  return (
    <div className="space-y-6">
      {vehicles.map((v, index) => {
        const preview =
          v.serviceId && v.vehicleTypeId
            ? resolvePrice(
                services,
                priceMap,
                v.serviceId,
                v.vehicleTypeId,
              )
            : null

        return (
          <div
            key={v.uid}
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-card-foreground">
                Véhicule {index + 1}
              </h3>

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

            {/* Prestation */}
            <fieldset className="mb-5">
              <legend className="mb-2 text-sm font-medium text-card-foreground">
                Prestation
              </legend>

              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((s) => {
                  const cat = categories.find((c) => c.id === s.categoryId)
                  const selected = v.serviceId === s.id

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => update(v.uid, { serviceId: s.id })}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50",
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium text-card-foreground">
                          {s.name}
                        </span>

                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </span>

                      {cat && (
                        <span className="mt-0.5 text-xs text-muted-foreground">
                          {cat.name}
                        </span>
                      )}

                      <span className="mt-1 text-xs text-muted-foreground">
                        À partir de {formatPrice(s.basePriceCents)} ·{" "}
                        {formatDuration(s.durationMin)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {/* Type de véhicule */}
            <fieldset className="mb-5">
              <legend className="mb-2 text-sm font-medium text-card-foreground">
                Type de véhicule
              </legend>

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
              <legend className="mb-2 text-sm font-medium text-card-foreground">
                Détails du véhicule
              </legend>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <input
                    type="text"
                    required
                    value={v.brand ?? ""}
                    onChange={(e) =>
                      update(v.uid, { brand: e.target.value })
                    }
                    placeholder="Marque *"
                    aria-label={`Marque du véhicule ${index + 1}`}
                    aria-required="true"
                    aria-invalid={!v.brand?.trim()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />

                  {!v.brand?.trim() && (
                    <p className="mt-1 text-xs text-destructive">
                      Champ obligatoire
                    </p>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={v.model ?? ""}
                    onChange={(e) =>
                      update(v.uid, { model: e.target.value })
                    }
                    placeholder="Modèle *"
                    aria-label={`Modèle du véhicule ${index + 1}`}
                    aria-required="true"
                    aria-invalid={!v.model?.trim()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />

                  {!v.model?.trim() && (
                    <p className="mt-1 text-xs text-destructive">
                      Champ obligatoire
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* Options */}
            {options.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-card-foreground">
                  Options complémentaires{" "}
                  <span className="text-muted-foreground">
                    (facultatif)
                  </span>
                </legend>

                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((o) => {
                    const checked = v.optionIds.includes(o.id)

                    return (
                      <label
                        key={o.id}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                          checked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/50",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded border",
                              checked
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/50",
                            )}
                          >
                            {checked && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </span>

                          <span className="text-sm text-card-foreground">
                            {o.name}
                          </span>
                        </span>

                        <span className="shrink-0 text-sm text-muted-foreground">
                          +{formatPrice(o.priceCents)}
                        </span>

                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleOption(v.uid, o.id)}
                        />
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {preview && (
              <p className="mt-4 text-sm text-muted-foreground">
                Sous-total véhicule :{" "}
                <span className="font-semibold text-primary">
                  {formatPrice(
                    preview.priceCents +
                      v.optionIds.reduce(
                        (sum, id) =>
                          sum +
                          (options.find((o) => o.id === id)?.priceCents ?? 0),
                        0,
                      ),
                  )}
                </span>
              </p>
            )}
          </div>
        )
      })}

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
}                                                      }
