"use client"

import { formatPrice, formatDuration, formatKm } from "@/lib/format"
import { lineTotals, type VehicleSelection, type ServiceRow, type OptionRow, type VehicleRow, type PriceMap } from "./shared"
import type { TravelResult } from "@/lib/booking/types"

type Props = {
  vehicles: VehicleSelection[]
  services: ServiceRow[]
  vehicleTypes: VehicleRow[]
  options: OptionRow[]
  priceMap: PriceMap
  travel: TravelResult | null
  depositType: string
  depositValue: number
  /** Remise promo (centimes) validée côté serveur — 0 si aucun code. */
  discountCents?: number
  /** Code promo appliqué (affichage). */
  promoCode?: string | null
}

/** Calcule l'acompte côté client (aperçu). */
function previewDeposit(totalCents: number, type: string, value: number): number {
  if (type === "fixed") return Math.min(value, totalCents)
  if (type === "percent" || type === "percentage") return Math.round((totalCents * value) / 100)
  return 0
}

export function BookingSummary({
  vehicles,
  services,
  vehicleTypes,
  options,
  priceMap,
  travel,
  depositType,
  depositValue,
  discountCents = 0,
  promoCode = null,
}: Props) {
  const complete = vehicles.filter((v) => v.serviceId && v.vehicleTypeId)

  const servicesCents = complete.reduce(
    (sum, v) => sum + lineTotals(v, services, options, priceMap).priceCents,
    0,
  )
  const totalDuration = complete.reduce(
    (sum, v) => sum + lineTotals(v, services, options, priceMap).durationMin,
    0,
  )
  const travelFee = travel?.ok ? travel.feeCents : 0
  // Remise bornée au sous-total prestations (jamais de total négatif).
  const discount = Math.max(0, Math.min(discountCents, servicesCents))
  const total = servicesCents + travelFee - discount
  const deposit = previewDeposit(total, depositType, depositValue)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-serif text-lg font-semibold text-card-foreground">Votre devis</h3>

      {complete.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Ajoutez un véhicule et une prestation pour voir le montant.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {complete.map((v) => {
            const svc = services.find((s) => s.id === v.serviceId)
            const veh = vehicleTypes.find((t) => t.id === v.vehicleTypeId)
            const { priceCents, durationMin } = lineTotals(v, services, options, priceMap)
            const chosenOptions = v.optionIds
              .map((id) => options.find((o) => o.id === id))
              .filter(Boolean) as OptionRow[]
            return (
              <li key={v.uid} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{svc?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {veh?.name} · {formatDuration(durationMin)}
                    </p>
                    {chosenOptions.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {chosenOptions.map((o) => (
                          <li key={o.id} className="text-xs text-muted-foreground">
                            + {o.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-card-foreground">
                    {formatPrice(priceCents)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {complete.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <Row label="Prestations" value={formatPrice(servicesCents)} />
          {travel?.ok ? (
            <>
              <Row
                label={`Déplacement (${formatKm(travel.billedDistanceKm)}${travel.billedDistanceKm === 0 ? " facturé" : ""})`}
                value={travelFee === 0 ? "Offert" : formatPrice(travelFee)}
                muted
              />
            </>
          ) : (
            <Row label="Déplacement" value="À calculer" muted />
          )}
          {discount > 0 && (
            <Row label={promoCode ? `Remise (${promoCode})` : "Remise"} value={`-${formatPrice(discount)}`} />
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold text-card-foreground">Total</span>
            <span className="text-lg font-bold text-primary">{formatPrice(total)}</span>
          </div>
          {deposit > 0 && (
            <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-card-foreground">
              Acompte à régler à la réservation :{" "}
              <span className="font-semibold text-primary">{formatPrice(deposit)}</span>
              <span className="block text-muted-foreground">
                Solde de {formatPrice(total - deposit)} réglé le jour du rendez-vous.
              </span>
            </div>
          )}
          {totalDuration > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">Durée totale estimée : {formatDuration(totalDuration)}</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : "text-card-foreground"}>{label}</span>
      <span className={muted ? "text-muted-foreground" : "text-card-foreground"}>{value}</span>
    </div>
  )
}
