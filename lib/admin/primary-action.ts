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

import { humanReservationUrl } from "@/lib/admin/public-link"

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
  /**
   * Lien DIRECT partageable de réservation (`humanReservationUrl` :
   * `/reservation?tenant=<slug>` ou domaine custom), toujours fourni. L'iframe
   * du widget reste sur `/p/<slug>/reservation?embed=1` (technique, inchangé).
   * Utilisé par « Copier mon lien de réservation » et « Voir mon module ».
   */
  bookingUrl: string
}

/**
 * Construit l'action widget du tenant AUTHENTIFIÉ (slug fourni par le serveur).
 * `/book/<slug>` n'est volontairement PAS utilisé : c'est une page de choix
 * (réservation / devis) dont le lien devis renvoie un 404 quand le tenant a
 * désactivé les demandes sur mesure.
 */
export function buildWidgetPrimaryAction(opts: {
  slug: string
  active: boolean
  scriptSnippet: string
  rootDomain?: string
}): WidgetPrimaryAction {
  return {
    active: opts.active,
    scriptSnippet: opts.scriptSnippet,
    bookingUrl: humanReservationUrl(opts.slug, opts.rootDomain),
  }
}

/**
 * Lien « Voir mon site » (en-tête + feuille « Plus »). Masqué pour le mode
 * widget : ces tenants distribuent leur réservation depuis leur propre site.
 * link / NULL → lien public historique inchangé.
 */
export function resolveSiteLinkUrl(mode: string | null | undefined, publicUrl: string | null): string | null {
  return resolveDashboardPrimaryMode(mode) === "widget" ? null : publicUrl
}
