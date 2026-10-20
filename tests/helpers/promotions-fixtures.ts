/**
 * Données d'EXEMPLE pour les tests du moteur de promotions (aucune valeur
 * commerciale réelle, sauf les identifiants/prix Cleanyzer validés le 20/10/2026 :
 * prestation phares 158 = 65 €, option phares 98 = 50 €, entreprise 104).
 */
import type { Cart, CartVehicle, MultiOptionsPromotion, MultiServicesPromotion, Promotion, ServiceOptionPromotion } from "@/lib/booking/promotions"

export const CLZ = {
  companyId: 104,
  pharesService: 158,
  pharesOption: 98,
  lavageInterieurEco: 143,
  lavageExterieurEco: 146,
}

export const veh = (key: string, services: [number, number][] = [], options: [number, number][] = []): CartVehicle => ({
  key,
  services: services.map(([serviceId, priceCents]) => ({ serviceId, priceCents })),
  options: options.map(([optionId, priceCents]) => ({ optionId, priceCents })),
})

export const cart = (...vehicles: CartVehicle[]): Cart => ({ vehicles })

const base = { active: true, priority: 0, stackable: false, stackableWithPromoCode: false, startsAt: null, endsAt: null }

export function multiServices(p: Partial<MultiServicesPromotion> = {}): MultiServicesPromotion {
  return {
    ...base,
    id: 1,
    name: "Plusieurs prestations",
    kind: "multi_services",
    eligibleServiceIds: null,
    includeOptions: false,
    tiers: [
      { minQuantity: 2, value: { type: "percent", bps: 1000 } },
      { minQuantity: 3, value: { type: "percent", bps: 1500 } },
      { minQuantity: 4, value: { type: "percent", bps: 2000 } },
    ],
    ...p,
  }
}

export function fixedTotal(p: Partial<MultiServicesPromotion> = {}): MultiServicesPromotion {
  return multiServices({
    id: 2,
    name: "Prix total",
    tiers: [
      { minQuantity: 2, value: { type: "fixed_total", cents: 10000 } },
      { minQuantity: 3, value: { type: "fixed_total", cents: 15000 } },
      { minQuantity: 4, value: { type: "fixed_total", cents: 19000 } },
    ],
    ...p,
  })
}

export function serviceOption(p: Partial<ServiceOptionPromotion> = {}): ServiceOptionPromotion {
  return {
    ...base,
    id: 3,
    name: "Intérieur + cuir",
    kind: "service_option",
    trigger: { serviceId: 10, optionId: 100, appliesTo: "both" },
    tiers: [{ minQuantity: 1, value: { type: "amount", cents: 1500 } }],
    ...p,
  }
}

export function multiOptions(p: Partial<MultiOptionsPromotion> = {}): MultiOptionsPromotion {
  return {
    ...base,
    id: 4,
    name: "Plusieurs options",
    kind: "multi_options",
    eligibleOptionIds: null,
    tiers: [
      { minQuantity: 2, value: { type: "percent", bps: 500 } },
      { minQuantity: 3, value: { type: "percent", bps: 1000 } },
    ],
    ...p,
  }
}

export const asPromo = (p: Promotion) => p
