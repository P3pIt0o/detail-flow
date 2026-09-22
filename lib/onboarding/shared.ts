/**
 * État partagé de l'onboarding self-service (/demarrer).
 *
 * Les réponses sont conservées côté navigateur (localStorage) le temps que
 * l'utilisateur confirme son email : à son retour sur /admin/creer-mon-espace,
 * le formulaire pré-remplit son entreprise et complète le provisioning.
 *
 * AUCUNE donnée sensible n'y est stockée (jamais de mot de passe). L'intention
 * et les activités ne servent qu'au routage/pré-remplissage : elles ne sont pas
 * persistées en base (voir provisionCompanyForUser — colonnes existantes only).
 */

export const ONBOARDING_STORAGE_KEY = "df_onboarding_v1"

/** Ce que veut faire le professionnel avec DetailFlow. */
export type OnboardingIntent = "booking" | "page" | "website"

export type OnboardingPayload = {
  intent: OnboardingIntent
  /** Site existant (parcours booking) OU domaine visé (parcours website). */
  websiteUrl?: string
  activities: string[]
  companyName: string
  ownerName: string
  city?: string
  country?: string
  phone?: string
}

/** Enregistre l'état onboarding (sans jamais lever, même si le storage échoue). */
export function saveOnboarding(payload: OnboardingPayload): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* stockage indisponible (mode privé, quota) : on ignore silencieusement. */
  }
}

/** Relit l'état onboarding, ou `null` s'il est absent/illisible. */
export function loadOnboarding(): OnboardingPayload | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OnboardingPayload
    if (!parsed || typeof parsed.companyName !== "string") return null
    return parsed
  } catch {
    return null
  }
}

/** Efface l'état onboarding (après création de l'espace). */
export function clearOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch {
    /* rien à faire */
  }
}
