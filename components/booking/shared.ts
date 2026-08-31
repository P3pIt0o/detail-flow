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
  highlightKind?: string | null
  highlightLabel?: string | null
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

/**
 * Une prestation appliquée à un véhicule, avec ses propres options.
 * Chaque ligne devient un `bookingItem` distinct côté serveur, d'où les
 * options rattachées à la ligne (et non au véhicule).
 */
export type ServiceLine = {
  /** Identifiant local de la ligne (pour la liste React). */
  lid: string
  serviceId: number | null
  optionIds: number[]
}

/**
 * Un véhicule composé par le client : un seul véhicule (type + marque + modèle)
 * peut recevoir PLUSIEURS prestations. Le type de véhicule vaut pour toutes les
 * prestations de ce véhicule (tarif différencié par type conservé).
 */
export type VehicleSelection = {
  uid: string
  vehicleTypeId: number | null
  /** Prestations appliquées à ce véhicule (au moins une requise). */
  services: ServiceLine[]
  // Détails facultatifs du véhicule (repris ensuite sur la facture).
  brand?: string
  model?: string
  plate?: string
}

/** Crée une ligne de prestation vide. */
export function newServiceLine(serviceId: number | null = null): ServiceLine {
  return {
    lid: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `l${Math.random()}`,
    serviceId,
    optionIds: [],
  }
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

/** Total (centimes) et durée (min) d'UNE ligne de prestation. */
export function serviceLineTotals(
  line: ServiceLine,
  vehicleTypeId: number | null,
  services: ServiceRow[],
  options: OptionRow[],
  priceMap: PriceMap,
): { priceCents: number; durationMin: number } {
  if (!line.serviceId || !vehicleTypeId) return { priceCents: 0, durationMin: 0 }
  const base = resolvePrice(services, priceMap, line.serviceId, vehicleTypeId)
  const opts = line.optionIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as OptionRow[]
  const optCents = opts.reduce((s, o) => s + o.priceCents, 0)
  const optMin = opts.reduce((s, o) => s + o.durationMin, 0)
  return { priceCents: base.priceCents + optCents, durationMin: base.durationMin + optMin }
}

/** Total (centimes) et durée (min) cumulés de toutes les prestations d'un véhicule. */
export function lineTotals(
  v: VehicleSelection,
  services: ServiceRow[],
  options: OptionRow[],
  priceMap: PriceMap,
): { priceCents: number; durationMin: number } {
  return v.services.reduce(
    (acc, line) => {
      const t = serviceLineTotals(line, v.vehicleTypeId, services, options, priceMap)
      return { priceCents: acc.priceCents + t.priceCents, durationMin: acc.durationMin + t.durationMin }
    },
    { priceCents: 0, durationMin: 0 },
  )
}

/** Lignes de prestation valides (prestation choisie) d'un véhicule. */
export function completeServiceLines(v: VehicleSelection): ServiceLine[] {
  return v.services.filter((l) => l.serviceId != null)
}

/** Un véhicule est complet quand le type + marque + modèle sont renseignés et
 * qu'au moins une prestation est choisie. */
export function isVehicleComplete(v: VehicleSelection): boolean {
  return (
    v.vehicleTypeId != null &&
    !!v.brand?.trim() &&
    !!v.model?.trim() &&
    completeServiceLines(v).length > 0
  )
}
