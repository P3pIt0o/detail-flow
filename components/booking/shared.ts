/**
 * Types et helpers partagés côté client pour le tunnel de réservation.
 * L'aperçu de prix est calculé localement pour la réactivité ; le montant
 * facturé est TOUJOURS recalculé côté serveur à la validation.
 */

export type ServiceRow = {
  id: number
  categoryId: number | null
  name: string
  slug: string
  description: string | null
  image: string | null
  basePriceCents: number
  durationMin: number
}

export type CategoryRow = { id: number; name: string; slug: string; description: string | null }
export type VehicleRow = {
  id: number
  name: string
  slug: string
  description: string | null
  examples: string | null
}
export type OptionRow = {
  id: number
  name: string
  slug: string
  description: string | null
  priceCents: number
  durationMin: number
}

export type PriceMap = Record<string, { priceCents: number; durationMin: number }>

/** Un véhicule composé par le client dans le tunnel. */
export type VehicleSelection = {
  uid: string
  serviceId: number | null
  vehicleTypeId: number | null
  optionIds: number[]
  // Détails facultatifs du véhicule (repris ensuite sur la facture).
  brand?: string
  model?: string
  plate?: string
}

/** Prix + durée d'une prestation pour un véhicule (repli sur prix de base). */
export function resolvePrice(
  services: ServiceRow[],
  priceMap: PriceMap,
  serviceId: number,
  vehicleTypeId: number,
): { priceCents: number; durationMin: number } {
  const specific = priceMap[`${serviceId}-${vehicleTypeId}`]
  if (specific) return specific
  const svc = services.find((s) => s.id === serviceId)
  return { priceCents: svc?.basePriceCents ?? 0, durationMin: svc?.durationMin ?? 60 }
}

/** Total (centimes) et durée (min) d'un véhicule composé. */
export function lineTotals(
  v: VehicleSelection,
  services: ServiceRow[],
  options: OptionRow[],
  priceMap: PriceMap,
): { priceCents: number; durationMin: number } {
  if (!v.serviceId || !v.vehicleTypeId) return { priceCents: 0, durationMin: 0 }
  const base = resolvePrice(services, priceMap, v.serviceId, v.vehicleTypeId)
  const opts = v.optionIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as OptionRow[]
  const optCents = opts.reduce((s, o) => s + o.priceCents, 0)
  const optMin = opts.reduce((s, o) => s + o.durationMin, 0)
  return { priceCents: base.priceCents + optCents, durationMin: base.durationMin + optMin }
}

/** Un véhicule est complet quand service + type sont choisis et que la marque
 * et le modèle (obligatoires) sont renseignés. */
export function isVehicleComplete(v: VehicleSelection): boolean {
  return (
    v.serviceId != null &&
    v.vehicleTypeId != null &&
    !!v.brand?.trim() &&
    !!v.model?.trim()
  )
}
