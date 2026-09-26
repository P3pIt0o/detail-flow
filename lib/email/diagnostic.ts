import "server-only"
import { sendEmail, type SendResult } from "./send"
import { customSiteDiagnosticEmail } from "./templates"
import type { DiagnosticData } from "@/lib/diagnostic/schema"

/**
 * Transmission d'une demande de site sur mesure (questionnaire public) à
 * l'équipe DetailFlow, en réutilisant l'infrastructure email existante
 * (Resend via `sendEmail`). Aucune table, aucune migration : simple envoi.
 */

/**
 * Destinataire final de CE parcours (point 23 du cahier des charges).
 * Constante serveur dédiée : jamais exposée au client, jamais dérivée d'une
 * entrée navigateur.
 */
export const DIAGNOSTIC_RECIPIENT = "contact@detailflow.fr"

/** Message d'erreur utilisateur (jamais de détail technique ni de secret). */
export const DIAGNOSTIC_ERROR_MESSAGE =
  "Impossible d'envoyer votre demande pour le moment. Merci de réessayer."

/**
 * Traduit le résultat d'envoi en état exploitable par la Server Action.
 * Succès affiché UNIQUEMENT si Resend confirme (`res.ok === true`) — un
 * `skipped` (infra non configurée) ou une erreur provider donne un échec
 * contrôlé, jamais de fausse confirmation.
 */
export function interpretDiagnosticResult(res: SendResult): { ok: true } | { ok: false; error: string } {
  return res.ok ? { ok: true } : { ok: false, error: DIAGNOSTIC_ERROR_MESSAGE }
}

/**
 * Envoie la demande à `contact@detailflow.fr`. Ne lève jamais : renvoie le
 * résultat structuré de l'envoi. `replyTo` = email du prospect pour répondre
 * directement.
 */
export async function sendDiagnosticRequest(data: DiagnosticData): Promise<SendResult> {
  const mail = customSiteDiagnosticEmail(data)
  return sendEmail({
    to: DIAGNOSTIC_RECIPIENT,
    subject: mail.subject,
    html: mail.html,
    replyTo: data.email,
  })
}
