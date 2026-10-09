/**
 * Traductions MÉTIER de l'espace pro « Abonnements clients ». Seule source des
 * textes affichés : aucun code, enum ou terme Stripe ne doit atteindre l'écran.
 */
import type { CustomerSubscriptionErrorCode } from "./errors"

export const ERROR_MESSAGES: Record<CustomerSubscriptionErrorCode, string> = {
  FEATURE_DISABLED: "Les abonnements clients ne sont pas inclus dans votre offre DetailFlow actuelle.",
  LIMIT_REACHED: "Vous avez atteint la limite d’abonnements clients de votre offre. Passez à Indépendant pour augmenter votre capacité. Les abonnements en cours continuent normalement.",
  FORBIDDEN: "Seuls le propriétaire et les administrateurs peuvent faire cette modification.",
  INVALID_PLAN: "Certaines informations de la formule sont incomplètes ou incorrectes.",
  PLAN_NOT_ACTIVE: "Cette formule n'est pas publiée. Publiez-la avant de continuer.",
  SERVICE_NOT_FOUND: "Choisissez une prestation de votre catalogue.",
  CLIENT_NOT_FOUND: "Ce client est introuvable.",
  STRIPE_NOT_CONNECTED: "Connectez d'abord votre compte de paiement pour publier une formule.",
  PAYMENTS_DISABLED: "Les paiements en ligne sont désactivés sur votre compte. Activez-les pour publier une formule.",
  INVALID_INTERVAL: "La fréquence de paiement n'est pas valide.",
  INVALID_COMMITMENT: "La durée d'engagement n'est pas valide.",
  INVALID_RENEWAL: "Le choix de fin d'engagement n'est pas compatible avec vos réglages.",
  INVALID_PAYMENT_MODE: "Choisissez au moins un mode de paiement et, pour le prépayé, un nombre de périodes.",
  INVALID_VEHICLE: "Les informations du véhicule sont incomplètes.",
  INVALID_CUSTOMER: "Les coordonnées du client sont incomplètes.",
  INVALID_REASON: "Indiquez un motif (3 caractères minimum).",
  SUBSCRIPTION_NOT_FOUND: "Cet abonnement est introuvable.",
  SUBSCRIPTION_NOT_MUTABLE: "Cette action n'est plus possible pour cet abonnement.",
  SUBSCRIPTION_NOT_USABLE: "Cet abonnement ne permet pas cette utilisation pour le moment.",
  PAST_DUE: "Un paiement est à régulariser sur cet abonnement.",
  ALREADY_CANCELLED: "Cet abonnement est déjà terminé.",
  PLAN_CHANGE_NOT_SUPPORTED: "Le changement de formule n'est pas encore disponible.",
  CONFLICT: "Cette action vient déjà d'être effectuée. Actualisez la page.",
  CHECKOUT_NOT_ALLOWED: "Le paiement n'est pas possible pour cet abonnement.",
  CHECKOUT_ALREADY_COMPLETED: "Le paiement a déjà été effectué.",
  INITIAL_CLEANING_PAYMENT_REQUIRED: "Le nettoyage initial doit d'abord être réglé.",
  INVALID_RETURN_URL: "Une erreur de configuration empêche le paiement. Contactez le support.",
  CHECKOUT_CONFLICT: "Un paiement est déjà en cours pour cet abonnement.",
  PROVIDER_ERROR: "Le service de paiement ne répond pas. Réessayez dans quelques instants.",
  PROVIDER_DATA_UNAVAILABLE: "Le service de paiement ne répond pas. Réessayez dans quelques instants.",
  REQUESTS_DISABLED: "Les demandes d'abonnement sont désactivées.",
  PLAN_NOT_AVAILABLE: "Cette formule n'est plus proposée.",
  NOT_ACCEPTING_REQUESTS: "Les demandes d'abonnement sont désactivées.",
  INVALID_SUBMISSION: "La demande est incomplète.",
  INVALID_MESSAGE: "Le message est trop long (1 000 caractères maximum).",
  RATE_LIMITED: "Trop de tentatives. Patientez quelques instants.",
  REQUEST_NOT_FOUND: "Cette demande est introuvable.",
  REQUEST_NOT_PENDING: "Cette demande a déjà été traitée ou a expiré.",
  EARLY_CANCELLATION_MANUAL_REVIEW:
    "Formule prépayée : l'arrêt anticipé ne peut pas être appliqué automatiquement. Refusez la demande ou contactez votre client ; aucun remboursement n'est effectué automatiquement.",
  PLAN_CHANGED_REQUIRES_CONFIRMATION: "Cette formule a changé depuis la demande du client.",
  INTERNAL_ERROR: "Une erreur inattendue est survenue. Réessayez.",
}

export function errorMessage(code: string | undefined | null): string {
  return (code && ERROR_MESSAGES[code as CustomerSubscriptionErrorCode]) || ERROR_MESSAGES.INTERNAL_ERROR
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info"

export const SUBSCRIPTION_STATUS_UI: Record<string, { label: string; tone: Tone }> = {
  pending_initial_cleaning: { label: "Nettoyage initial à faire", tone: "info" },
  pending_payment: { label: "En attente de paiement", tone: "info" },
  active: { label: "Actif", tone: "success" },
  past_due: { label: "Paiement à régulariser", tone: "danger" },
  cancel_scheduled: { label: "Arrêt programmé", tone: "warning" },
  suspended: { label: "Suspendu", tone: "warning" },
  cancelled: { label: "Terminé", tone: "neutral" },
  expired: { label: "Terminé", tone: "neutral" },
  ended: { label: "Terminé", tone: "neutral" },
}
export const subscriptionStatusUi = (s: string) => SUBSCRIPTION_STATUS_UI[s] ?? { label: "En cours de traitement", tone: "neutral" as Tone }

export const PLAN_STATUS_UI: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  active: { label: "Publiée", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
}

export const VISIBILITY_UI: Record<string, { label: string; help: string }> = {
  public: { label: "Publique", help: "Affichée dans la liste de vos formules." },
  unlisted: { label: "Lien uniquement", help: "Cachée de la liste : seuls les clients qui ont le lien peuvent la voir." },
  private: { label: "Privée", help: "Jamais visible par les clients. Utile pour préparer ou réserver une formule." },
}

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  recurring: "Échéance",
  prepaid: "Prépaiement",
  initial_cleaning: "Nettoyage initial",
  adjustment: "Ajustement",
}

export const PAYMENT_STATUS_UI: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "En attente", tone: "info" },
  processing: { label: "En cours", tone: "info" },
  paid: { label: "Payé", tone: "success" },
  failed: { label: "Échoué", tone: "danger" },
  cancelled: { label: "Annulé", tone: "neutral" },
  refunded: { label: "Remboursé", tone: "neutral" },
  partially_refunded: { label: "Remboursé en partie", tone: "warning" },
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: "En cours",
  succeeded: "Effectué",
  failed: "Échoué",
  cancelled: "Annulé",
}

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  request_received: "Demande reçue",
  request_received_pro: "Nouvelle demande",
  request_accepted: "Demande acceptée",
  request_rejected: "Demande refusée",
  activation: "Activation",
  subscription_activated: "Activation",
  payment_succeeded: "Paiement reçu",
  payment_failed: "Paiement échoué",
  payment_failed_pro: "Paiement échoué",
  payment_action_required: "Paiement à confirmer",
  billing_notice: "Rappel d'échéance",
  renewal_notice: "Rappel de renouvellement",
  commitment_ending_notice: "Fin d'engagement proche",
  term_ending_notice: "Fin d'abonnement proche",
  renewal_opt_out_confirmed: "Non-renouvellement confirmé",
  renewal_opt_out_pro: "Non-renouvellement demandé",
  renewal_opt_out_revoked: "Renouvellement rétabli",
  cancellation_scheduled: "Arrêt programmé",
  subscription_ended: "Fin d'abonnement",
  early_cancellation_requested_pro: "Demande d'arrêt anticipé",
  early_cancellation_decided: "Réponse à la demande d'arrêt",
  refund_succeeded: "Remboursement",
}
export const emailTypeLabel = (t: string) => EMAIL_TYPE_LABELS[t] ?? "Notification"

export const EMAIL_STATUS_UI: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "À venir", tone: "info" },
  sending: { label: "En cours d'envoi", tone: "info" },
  sent: { label: "Envoyé", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
  skipped: { label: "Non envoyé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
}
export const RECIPIENT_LABELS: Record<string, string> = { client: "Client", professional: "Vous" }

/** Aides courtes « Comment ça marche ? » (quelques lignes maximum). */
export const HELP = {
  commitment: "Durée minimale pendant laquelle la formule reste active. Avant cette date, le client ne peut pas arrêter seul.",
  renewal: "Ce qui se passe quand l'engagement arrive à sa fin.",
  prepaid: "Votre client paie plusieurs périodes en une seule fois. Aucun prélèvement ensuite : la formule s'arrête à la fin de la période payée.",
  recurring: "Votre client est prélevé automatiquement à chaque période, sans rien faire.",
  initialCleaning: "Une première prestation, payée à la souscription, pour remettre le véhicule à niveau avant l'entretien régulier.",
  reminder: "Le client recevra un rappel avant son échéance ou son renouvellement.",
  uses: "Nombre de prestations que le client peut réserver pendant chaque période payée. Les prestations non utilisées ne sont pas reportées.",
  publicMode: "Ce réglage décide comment vos clients peuvent rejoindre une formule. Il ne modifie jamais les abonnements déjà en cours.",
  commission: "DetailFlow prélève une petite commission sur chaque paiement d'abonnement encaissé. Elle s'ajoute aux frais du service de paiement. Vos clients ne la voient pas.",
  editing: "Les modifications s'appliqueront uniquement aux nouveaux abonnements. Vos abonnés actuels gardent les conditions qu'ils ont acceptées.",
  earlyCancellation: "Une demande d'arrêt anticipé n'est pas un remboursement. Rien n'est remboursé automatiquement.",
} as const

export const PUBLIC_MODE_UI = {
  disabled: { label: "Désactivé", help: "Vos formules restent enregistrées mais ne sont pas proposées aux clients." },
  request: { label: "Sur demande", help: "Vous gardez le contrôle. Le client vous envoie une demande et vous décidez de l'accepter avant qu'il puisse payer." },
  direct: { label: "Souscription directe", help: "Le client peut souscrire et payer directement, sans validation de votre part." },
} as const

export const REMINDER_PRESETS = [3, 7, 15, 30] as const
