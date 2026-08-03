/**
 * ============================================================================
 *  TYPES DU MOTEUR DE RÉSERVATION
 * ============================================================================
 *  Types partagés entre le serveur (calculs) et le client (UI). Aucune
 *  logique ici : uniquement les formes de données échangées.
 * ============================================================================
 */

/** Un véhicule choisi par le client, avec sa prestation et ses options. */
export type BookingSelection = {
  /** Identifiant local (généré côté client pour la liste) */
  uid: string
  serviceId: number
  vehicleTypeId: number
  /** Identifiants des options cochées pour ce véhicule */
  optionIds: number[]
  /** Détails facultatifs du véhicule (repris sur la facture) */
  brand?: string
  model?: string
  plate?: string
}

/** Détail chiffré d'une ligne (retourné par le moteur de prix). */
export type QuoteLine = {
  uid: string
  serviceId: number
  serviceName: string
  vehicleTypeId: number
  vehicleTypeName: string
  priceCents: number
  durationMin: number
  options: {
    optionId: number
    optionName: string
    priceCents: number
    durationMin: number
  }[]
  lineTotalCents: number
  lineDurationMin: number
}

/** Résultat complet du calcul de devis (100 % serveur). */
export type Quote = {
  lines: QuoteLine[]
  servicesCents: number
  optionsCents: number
  travelFeeCents: number
  subtotalCents: number
  totalCents: number
  depositCents: number
  totalDurationMin: number
  travel: TravelResult | null
}

/**
 * Moyens de paiement possibles pour l'acompte. Aucun fournisseur n'est imposé :
 * ce ne sont que des libellés d'instructions manuelles (pas d'intégration).
 */
export const DEPOSIT_METHODS = ["transfer", "wero", "stripe", "other"] as const
export type DepositMethod = (typeof DEPOSIT_METHODS)[number]

export const DEPOSIT_METHOD_LABELS: Record<DepositMethod, string> = {
  transfer: "Virement bancaire (IBAN)",
  wero: "Wero",
  stripe: "Paiement en ligne",
  other: "Autre",
}

/** Parse la liste CSV stockée en base en libellés lisibles. */
export function parseDepositMethods(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DepositMethod => (DEPOSIT_METHODS as readonly string[]).includes(s))
    .map((s) => DEPOSIT_METHOD_LABELS[s])
}

/** Résultat du calcul de déplacement. */
export type TravelResult = {
  ok: boolean
  /** Code d'erreur éventuel pour l'affichage */
  error?: "address_not_found" | "out_of_range" | "route_failed"
  address: string
  lat: number | null
  lng: number | null
  distanceKm: number
  billedDistanceKm: number
  feeCents: number
}
