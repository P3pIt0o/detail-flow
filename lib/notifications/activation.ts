/**
 * Règles d'ACTIVATION des automatisations LOT D (fichier PUR, testable).
 *
 * Désactiver est toujours permis. Activer exige, côté serveur :
 *  - le droit de licence (email_reminders / review_requests) ;
 *  - la disponibilité globale (flag serveur) pour une NOUVELLE activation ;
 *  - un destinataire pro valide (rappel) ou un lien d'avis résolvable (avis).
 * La présence de la migration est vérifiée ensuite par settings-store.
 */
import { isValidNotificationEmail } from "./runtime"
import { resolveEffectiveReviewLink } from "./review-link"

export const RUNTIME_DISABLED_MESSAGE = "Les automatisations sont en cours d’activation."
export const PRO_EMAIL_REQUIRED_MESSAGE =
  "Renseignez une adresse email professionnelle valide avant d’activer les rappels."
export const REVIEW_LINK_REQUIRED_MESSAGE =
  "Ajoutez un lien d’avis Google valide avant d’activer les demandes d’avis."

export type ActivationCheck =
  | { ok: true }
  | { ok: false; reason: "locked" | "runtime_disabled" | "no_pro_email" | "no_review_link"; error?: string }

type Common = {
  enabled: boolean
  /** Réglage déjà actif en base : ce n'est pas une NOUVELLE activation. */
  alreadyEnabled: boolean
  runtimeEnabled: boolean
  licensed: boolean
}

function commonGuards(input: Common): ActivationCheck | null {
  if (!input.enabled) return { ok: true }
  if (!input.licensed) return { ok: false, reason: "locked" }
  if (!input.runtimeEnabled && !input.alreadyEnabled) {
    return { ok: false, reason: "runtime_disabled", error: RUNTIME_DISABLED_MESSAGE }
  }
  return null
}

export function checkProReminderActivation(input: Common & { businessEmail: string | null | undefined }): ActivationCheck {
  const early = commonGuards(input)
  if (early) return early
  if (!isValidNotificationEmail(input.businessEmail)) {
    return { ok: false, reason: "no_pro_email", error: PRO_EMAIL_REQUIRED_MESSAGE }
  }
  return { ok: true }
}

export function checkReviewRequestActivation(
  input: Common & { placeId: string | null | undefined; manualLink: string | null | undefined },
): ActivationCheck {
  const early = commonGuards(input)
  if (early) return early
  if (!resolveEffectiveReviewLink({ placeId: input.placeId, manualLink: input.manualLink })) {
    return { ok: false, reason: "no_review_link", error: REVIEW_LINK_REQUIRED_MESSAGE }
  }
  return { ok: true }
}
