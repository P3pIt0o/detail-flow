/**
 * Lieu d'intervention — logique PURE (aucun accès réseau), partagée entre
 * l'admin, Booking V2 (site + widget) et la création serveur de réservation.
 *
 * Règle clé : le client ne répond jamais à une question inutile.
 *  - déplacement seul → intervention chez le client, adresse demandée ;
 *  - atelier seul     → atelier imposé, aucune adresse client, aucun frais ;
 *  - les deux         → le client choisit.
 */

export type LocationType = "client" | "workshop"

export type LocationConfig = {
  mobileEnabled: boolean
  workshopEnabled: boolean
  workshopAddress: string
  workshopPostalCode: string
  workshopCity: string
}

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  mobileEnabled: true,
  workshopEnabled: false,
  workshopAddress: "",
  workshopPostalCode: "",
  workshopCity: "",
}

/** Configuration publique consommée par le tunnel (aucune donnée inutile). */
export type PublicLocation = {
  mobile: boolean
  workshop: boolean
  /** Adresse complète de l'atelier, uniquement si l'atelier est proposé. */
  workshopAddress: string | null
}

export function isWorkshopAddressComplete(c: Pick<LocationConfig, "workshopAddress" | "workshopPostalCode" | "workshopCity">) {
  return Boolean(c.workshopAddress.trim() && c.workshopPostalCode.trim() && c.workshopCity.trim())
}

export function formatWorkshopAddress(c: Pick<LocationConfig, "workshopAddress" | "workshopPostalCode" | "workshopCity">) {
  const cityLine = [c.workshopPostalCode.trim(), c.workshopCity.trim()].filter(Boolean).join(" ")
  return [c.workshopAddress.trim(), cityLine].filter(Boolean).join(", ")
}

/**
 * Modes EFFECTIVEMENT proposés au client. L'atelier n'est proposé que si son
 * adresse est complète. Si aucun mode n'est exploitable, on retombe sur le
 * déplacement (comportement historique) : la réservation n'est jamais cassée.
 */
export function toPublicLocation(c: LocationConfig): PublicLocation {
  const workshop = c.workshopEnabled && isWorkshopAddressComplete(c)
  const mobile = c.mobileEnabled || !workshop
  return { mobile, workshop, workshopAddress: workshop ? formatWorkshopAddress(c) : null }
}

/** Mode retenu pour une réservation (autorité serveur, jamais le seul choix client). */
export function resolveLocationType(loc: PublicLocation, requested?: LocationType | null): LocationType {
  if (loc.workshop && !loc.mobile) return "workshop"
  if (loc.mobile && !loc.workshop) return "client"
  return requested === "workshop" ? "workshop" : "client"
}

/** Résumé court pour l'admin : « Atelier + déplacement », etc. */
export function describeLocation(c: LocationConfig): string {
  const workshop = c.workshopEnabled
  const mobile = c.mobileEnabled
  if (workshop && mobile) return "Atelier + déplacement"
  if (workshop) return "Atelier uniquement"
  if (mobile) return "Déplacement chez le client"
  return "Aucun lieu choisi"
}
