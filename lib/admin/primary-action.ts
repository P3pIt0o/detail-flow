/**
 * Action principale du dashboard (gros bouton du header / feuille « Plus »).
 * Logique PURE, décidée côté serveur à partir du tenant résolu.
 *
 * - `copy_link` : comportement historique inchangé (copie `resolvePublicLink`).
 * - `widget`    : « Intégrer la réservation » → code d'intégration existant +
 *                 « Voir mon module ».
 *
 * L'onboarding ne distingue pas encore Widget / Lien (seul `booking_only`
 * existe) : on N'INFÈRE PAS ce choix depuis un autre champ. Les sites
 * personnalisés historiques sont donc mappés explicitement ; tout autre tenant
 * (Spirit ACS, Rozan, standards) conserve exactement son comportement actuel.
 * customSitePublished n'intervient jamais dans ce choix.
 */

export type DashboardPrimaryMode = "copy_link" | "widget"

const LEGACY_WIDGET_CUSTOM_SITE_KEYS: ReadonlySet<string> = new Set(["cleanyzer"])

export function resolveDashboardPrimaryMode(customSiteKey: string | null | undefined): DashboardPrimaryMode {
  return customSiteKey && LEGACY_WIDGET_CUSTOM_SITE_KEYS.has(customSiteKey) ? "widget" : "copy_link"
}

export type WidgetPrimaryAction = {
  /** Réservation publique réellement ouverte (bookingLinkEnabled + statut). */
  active: boolean
  /** Code d'intégration existant (`buildEmbedScriptSnippet`), slug injecté serveur. */
  scriptSnippet: string
  /** Module de réservation (`/book/<slug>`), proposé uniquement si actif. */
  moduleUrl: string | null
}
