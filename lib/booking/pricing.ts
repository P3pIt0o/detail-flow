/**
 * ============================================================================
 *  MOTEUR DE PRIX (100 % SERVEUR — source de vérité)
 * ============================================================================
 *  Le prix affiché côté client n'est qu'indicatif : ce module recalcule TOUT
 *  à partir de la base de données au moment de la réservation. Aucun montant
 *  fourni par le client n'est jamais utilisé pour le total facturé.
 * ============================================================================
 */

import "server-only"
import {
  getServices,
  getVehicleTypes,
  getOptions,
  getServicePrices,
  type Settings,
} from "./queries"
import type { AppliedPromo, BookingSelection, Quote, QuoteLine, TravelResult } from "./types"

/** Calcule le montant de l'acompte selon la configuration. */
export function computeDeposit(totalCents: number, settings: Settings): number {
  switch (settings.depositType) {
    case "fixed":
      return Math.min(settings.depositValue, totalCents)
    case "percent":
    case "percentage":
      return Math.round((totalCents * settings.depositValue) / 100)
    default:
      return 0
  }
}

/**
 * Construit un devis complet et vérifié à partir des sélections client.
 * `travel` est optionnel (l'adresse peut être saisie plus tard dans le tunnel).
 */
export async function buildQuote(
  selections: BookingSelection[],
  settings: Settings,
  travel: TravelResult | null,
  /** Promo déjà validée côté serveur (jamais fournie par le client). */
  promo: AppliedPromo | null = null,
): Promise<Quote> {
  // On charge les référentiels une seule fois puis on les indexe.
  const [servicesList, vehiclesList, optionsList, pricesList] = await Promise.all([
    getServices(),
    getVehicleTypes(),
    getOptions(),
    getServicePrices(),
  ])

  const serviceById = new Map(servicesList.map((s) => [s.id, s]))
  const vehicleById = new Map(vehiclesList.map((v) => [v.id, v]))
  const optionById = new Map(optionsList.map((o) => [o.id, o]))
  const priceByKey = new Map(pricesList.map((p) => [`${p.serviceId}-${p.vehicleTypeId}`, p]))

  const lines: QuoteLine[] = []

  for (const sel of selections) {
    const service = serviceById.get(sel.serviceId)
    const vehicle = vehicleById.get(sel.vehicleTypeId)
    if (!service || !vehicle) continue // sélection invalide ignorée

    // Tarif véhicule spécifique, sinon repli sur le prix de base.
    const priceRow = priceByKey.get(`${sel.serviceId}-${sel.vehicleTypeId}`)
    const priceCents = priceRow?.priceCents ?? service.basePriceCents
    const durationMin = priceRow?.durationMin ?? service.durationMin

    // Options (dédoublonnées).
    const seen = new Set<number>()
    const lineOptions = []
    for (const optId of sel.optionIds) {
      if (seen.has(optId)) continue
      seen.add(optId)
      const opt = optionById.get(optId)
      if (!opt) continue
      lineOptions.push({
        optionId: opt.id,
        optionName: opt.name,
        priceCents: opt.priceCents,
        durationMin: opt.durationMin,
      })
    }

    const optionsCents = lineOptions.reduce((sum, o) => sum + o.priceCents, 0)
    const optionsDuration = lineOptions.reduce((sum, o) => sum + o.durationMin, 0)

    lines.push({
      uid: sel.uid,
      serviceId: service.id,
      serviceName: service.name,
      vehicleTypeId: vehicle.id,
      vehicleTypeName: vehicle.name,
      priceCents,
      durationMin,
      options: lineOptions,
      lineTotalCents: priceCents + optionsCents,
      lineDurationMin: durationMin + optionsDuration,
    })
  }

  const servicesCents = lines.reduce((sum, l) => sum + l.priceCents, 0)
  const optionsCents = lines.reduce(
    (sum, l) => sum + l.options.reduce((s, o) => s + o.priceCents, 0),
    0,
  )
  const totalDurationMin = lines.reduce((sum, l) => sum + l.lineDurationMin, 0)
  const travelFeeCents = travel?.ok ? travel.feeCents : 0

  const subtotalCents = servicesCents + optionsCents
  // Assiette remisable = services + options (le déplacement n'est jamais remisé).
  const eligibleSubtotalCents = subtotalCents
  // Remise bornée à l'assiette éligible : jamais de total négatif.
  const discountCents = promo ? Math.max(0, Math.min(promo.discountCents, eligibleSubtotalCents)) : 0
  const appliedPromo: AppliedPromo | null = promo ? { ...promo, discountCents } : null
  const totalCents = subtotalCents + travelFeeCents - discountCents
  const depositCents = computeDeposit(totalCents, settings)

  return {
    lines,
    servicesCents,
    optionsCents,
    travelFeeCents,
    subtotalCents,
    eligibleSubtotalCents,
    discountCents,
    promo: appliedPromo,
    totalCents,
    depositCents,
    totalDurationMin,
    travel,
  }
}
