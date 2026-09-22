import "server-only"
import { sendEmail, type SendResult } from "./send"
import { customWebsiteRequestEmail } from "./templates"

export type CustomWebsiteRequestInput = {
  companyName: string
  city?: string | null
  currentSite?: string | null
  instagram?: string | null
  needs: string
  features?: string | null
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  tenantSlug: string
}

/**
 * Message d'erreur utilisateur (jamais de détail technique ni de secret).
 * Requis par le cahier des charges du parcours « site personnalisé ».
 */
export const CUSTOM_WEBSITE_ERROR_MESSAGE =
  "Impossible d'envoyer votre demande pour le moment. Veuillez réessayer."

/** Extrait l'adresse d'une valeur "Nom <email@domaine>" ou "email@domaine". */
function extractAddress(value: string | undefined | null): string | null {
  if (!value) return null
  const angle = value.match(/<([^>]+)>/)
  const raw = (angle ? angle[1] : value).trim()
  return /\S+@\S+\.\S+/.test(raw) ? raw : null
}

/**
 * Destinataires internes DetailFlow pour les demandes commerciales.
 *
 * Ordre de résolution, en réutilisant UNIQUEMENT la configuration existante
 * (aucune adresse codée en dur) :
 *  1. `SUPER_ADMIN_EMAILS` (liste des super-admins / boîte commerciale) ;
 *  2. repli sur l'adresse vérifiée de l'expéditeur `EMAIL_FROM` — c'est la
 *     boîte DetailFlow déjà utilisée pour l'envoi, donc un destinataire sûr
 *     lorsque `SUPER_ADMIN_EMAILS` n'est pas renseigné dans cet environnement.
 *
 * Exporté (pur, injection d'`env` pour les tests) : c'est la résolution qui
 * évitait auparavant que la demande parte réellement.
 */
export function resolveInternalRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = (env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length > 0) return list

  const fallback = extractAddress(env.EMAIL_FROM)
  return fallback ? [fallback] : []
}

/**
 * Traduit le résultat d'envoi en état de formulaire.
 *
 * Point 7 : succès affiché UNIQUEMENT si Resend confirme (`res.ok === true`).
 * `skipped` (infra non configurée / aucun destinataire) et toute erreur
 * provider donnent un échec contrôlé — plus jamais de fausse confirmation.
 */
export function interpretSendResult(res: SendResult): { ok: true } | { ok: false; error: string } {
  return res.ok ? { ok: true } : { ok: false, error: CUSTOM_WEBSITE_ERROR_MESSAGE }
}

/**
 * Transmet une demande de site personnalisé à l'équipe DetailFlow, en
 * réutilisant l'infrastructure email existante (Resend via `sendEmail`).
 *
 * Ne lève jamais : renvoie le résultat structuré de l'envoi. Si aucun
 * destinataire ne peut être résolu, l'envoi est ignoré proprement (`skipped`)
 * et l'appelant le traite comme un échec (aucune fausse confirmation).
 */
export async function sendCustomWebsiteRequest(input: CustomWebsiteRequestInput): Promise<SendResult> {
  const to = resolveInternalRecipients()
  if (to.length === 0) {
    console.log(
      "[v0] Demande de site personnalisé NON transmise : aucun destinataire (SUPER_ADMIN_EMAILS et EMAIL_FROM absents) —",
      input.companyName,
    )
    return { ok: false, skipped: true, error: "Aucun destinataire interne configuré" }
  }
  const mail = customWebsiteRequestEmail(input)
  return sendEmail({
    to,
    subject: mail.subject,
    html: mail.html,
    replyTo: input.contactEmail,
  })
}
