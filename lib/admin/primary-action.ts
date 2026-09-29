/**
 * Action principale du dashboard (gros bouton du header / feuille « Plus »).
 * Logique PURE, décidée côté serveur à partir du tenant résolu.
 *
 * SOURCE DE VÉRITÉ : `companies.bookingDistributionMode` ("link" | "widget"),
 * choisi explicitement à l'onboarding (ou backfillé par migration). Le mode
 * n'est JAMAIS déduit de websiteUrl, customSiteKey, customSitePublished,
 * bookingLinkEnabled, du slug ou d'un domaine.
 *
 * - `widget`    : « Intégrer la réservation » → code d'intégration existant.
 * - `copy_link` : comportement historique inchangé (valeur "link" OU NULL —
 *                 tenants existants, dont Spirit ACS et Rozan).
 */

export const BOOKING_DISTRIBUTION_MODES = ["link", "widget"] as const
export type BookingDistributionMode = (typeof BOOKING_DISTRIBUTION_MODES)[number]

export function isBookingDistributionMode(v: unknown): v is BookingDistributionMode {
  return v === "link" || v === "widget"
}

export type DashboardPrimaryMode = "copy_link" | "widget"

export function resolveDashboardPrimaryMode(mode: string | null | undefined): DashboardPrimaryMode {
  return mode === "widget" ? "widget" : "copy_link"
}

export type WidgetPrimaryAction = {
  /** Réservation publique réellement ouverte (bookingLinkEnabled + statut). */
  active: boolean
  /** Code d'intégration existant (`buildEmbedScriptSnippet`), slug injecté serveur. */
  scriptSnippet: string
  /** Module de réservation (`/book/<slug>`), proposé uniquement si actif. */
  moduleUrl: string | null
}
