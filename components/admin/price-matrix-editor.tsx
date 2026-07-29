"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setServicePrice } from "@/app/admin/(dashboard)/prestations/actions"

type Service = { id: number; name: string; basePriceCents: number; baseDurationMin: number }
type VehicleType = { id: number; name: string }
type PriceCell = {
  serviceId: number
  vehicleTypeId: number
  priceCents: number | null
  durationMin: number | null
}

type Props = {
  services: Service[]
  vehicleTypes: VehicleType[]
  prices: PriceCell[]
}

/**
 * Éditeur de la matrice tarifaire : chaque cellule = (prestation × type de
 * véhicule). Une cellule vide hérite du prix/durée de base de la prestation.
 * L'édition se fait au clic sur une cellule, sauvegarde à la validation.
 */
export function PriceMatrixEditor({ services, vehicleTypes, prices }: Props) {
  const [editing, setEditing] = useState<{ s: number; v: number } | null>(null)
  const [priceInput, setPriceInput] = useState("")
  const [durationInput, setDurationInput] = useState("")
  const [pending, startTransition] = useTransition()

  function cellFor(serviceId: number, vehicleTypeId: number) {
    return prices.find((p) => p.serviceId === serviceId && p.vehicleTypeId === vehicleTypeId)
  }

  function startEdit(service: Service, vehicleTypeId: number) {
    const cell = cellFor(service.id, vehicleTypeId)
    setPriceInput(cell?.priceCents != null ? (cell.priceCents / 100).toString() : "")
    setDurationInput(cell?.durationMin != null ? cell.durationMin.toString() : "")
    setEditing({ s: service.id, v: vehicleTypeId })
  }

  function save() {
    if (!editing) return
    // Prix vide => on repasse la cellule sur le tarif de base (priceCents null).
    const trimmedPrice = priceInput.trim()
    const priceCents =
      trimmedPrice === "" ? null : Math.round(Number.parseFloat(trimmedPrice.replace(",", ".")) * 100)
    const durationMin = durationInput.trim() === "" ? null : Math.round(Number(durationInput))
    startTransition(async () => {
      await setServicePrice({
        serviceId: editing.s,
        vehicleTypeId: editing.v,
        priceCents: priceCents != null && Number.isNaN(priceCents) ? null : priceCents,
        durationMin,
      })
      setEditing(null)
    })
  }

  if (services.length === 0 || vehicleTypes.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Ajoutez au moins une prestation et un type de véhicule pour définir la grille tarifaire.
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-pretty">
        Définissez le prix et la durée pour chaque combinaison prestation / véhicule. Une cellule
        laissée vide utilise le tarif de base de la prestation.
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-left font-semibold sticky left-0 bg-muted/40">Prestation</th>
              {vehicleTypes.map((v) => (
                <th key={v.id} className="p-3 text-center font-semibold whitespace-nowrap">
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="border-b last:border-0">
                <td className="p-3 font-medium sticky left-0 bg-background">
                  <div>{service.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Base : {(service.basePriceCents / 100).toFixed(2)} € · {service.baseDurationMin}{" "}
                    min
                  </div>
                </td>
                {vehicleTypes.map((v) => {
                  const cell = cellFor(service.id, v.id)
                  const isEditing = editing?.s === service.id && editing?.v === v.id
                  const hasCustom = cell?.priceCents != null
                  return (
                    <td key={v.id} className="p-2 text-center">
                      {isEditing ? (
                        <div className="flex flex-col gap-1 min-w-32">
                          <Input
                            type="number"
                            step="0.01"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder="Prix €"
                            className="h-8 text-center"
                            aria-label="Prix en euros"
                          />
                          <Input
                            type="number"
                            value={durationInput}
                            onChange={(e) => setDurationInput(e.target.value)}
                            placeholder="Durée min"
                            className="h-8 text-center"
                            aria-label="Durée en minutes"
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 flex-1" onClick={save} disabled={pending}>
                              OK
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => setEditing(null)}
                              disabled={pending}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(service, v.id)}
                          className={`w-full rounded-md px-2 py-1.5 transition-colors hover:bg-muted ${
                            hasCustom ? "font-semibold text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {hasCustom ? (
                            <>
                              {(cell!.priceCents! / 100).toFixed(2)} €
                              <span className="block text-xs font-normal text-muted-foreground">
                                {cell!.durationMin ?? service.baseDurationMin} min
                              </span>
                            </>
                          ) : (
                            <span className="text-xs">— base —</span>
                          )}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
