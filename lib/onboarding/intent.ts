/**
 * Intention d'onboarding — SOURCE DE VÉRITÉ canonique (pure, sans I/O).
 *
 * Le prospect choisit un parcours AVANT l'inscription. Ce choix doit survivre à
 * toute la chaîne : CTA marketing → /demarrer → création de compte → provisioning
 * → dashboard, et rester valable après reconnexion depuis un autre appareil.
 *
 * Deux vocabulaires coexistent volontairement :
 *  - Le formulaire / localStorage (`lib/onboarding/shared.ts`) utilise des codes
 *    courts de transport : "booking" | "page" | "website".
 *  - La base (`companies.onboardingIntent`) et le dashboard utilisent la valeur
 *    métier canonique, alignée sur la contrainte SQL CHECK :
 *      "booking_only" | "public_page" | "custom_website".
 *
 * Ce module est la SEULE passerelle entre les deux, et le SEUL endroit qui
 * décide quel parcours afficher. Aucune autre source de vérité n'est créée.
 */

/** Valeur métier persistée (identique à la contrainte CHECK côté Neon). */
export const ONBOARDING_INTENTS = ["booking_only", "public_page", "custom_website"] as const
export type OnboardingIntentValue = (typeof ONBOARDING_INTENTS)[number]

/** Vrai si `v` est une valeur canonique valide (garde de type). */
export function isCanonicalIntent(v: string | null | undefined): v is OnboardingIntentValue {
  return v === "booking_only" || v === "public_page" || v === "custom_website"
}

/**
 * Convertit un code de transport (formulaire / `?start=`) en valeur canonique.
 * Toute valeur inconnue → `null` (aucune intention). Ne lève jamais.
 */
export function toCanonicalIntent(transport: string | null | undefined): OnboardingIntentValue | null {
  switch (transport) {
    case "booking":
      return "booking_only"
    case "page":
      return "public_page"
    case "website":
      return "custom_website"
    default:
      return null
  }
}

/**
 * Décide, CÔTÉ SERVEUR, quel parcours le dashboard doit afficher.
 *
 * Règles (dans l'ordre) :
 *  1. Un site ENTIÈREMENT personnalisé (`customSiteKey` non nul : Spirit ACS,
 *     Rozan, Cleanyzer, JustClean…) est PRIORITAIRE et PROTÉGÉ : il conserve
 *     exactement son comportement historique → `null` (jamais de panneau de
 *     parcours self-service).
 *  2. La valeur PERSISTÉE (`companies.onboardingIntent`) est la source de vérité.
 *     Elle garantit le même parcours après reconnexion, sur n'importe quel
 *     appareil, sans dépendre de l'URL.
 *  3. `?start=` (transport) n'est utilisé qu'en REPLI, uniquement si rien n'est
 *     persisté — filet pour les rares comptes self-service créés avant l'ajout
 *     de la colonne. Il n'est jamais la source de vérité après création.
 *  4. Sinon `null` = comportement historique strict (tenants legacy).
 */
export function resolveDashboardIntent(params: {
  /** `companies.onboardingIntent` (valeur persistée, éventuellement legacy). */
  persisted: string | null | undefined
  /** `companies.customSiteKey` (site 100 % personnalisé si non nul). */
  customSiteKey: string | null | undefined
  /** Code de transport `?start=` (repli uniquement). */
  transport?: string | null
}): OnboardingIntentValue | null {
  if (params.customSiteKey && params.customSiteKey.trim()) return null
  if (isCanonicalIntent(params.persisted)) return params.persisted
  return toCanonicalIntent(params.transport ?? null)
}
