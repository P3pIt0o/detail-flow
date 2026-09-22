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

/** Destinataires internes DetailFlow (mêmes que les super-admins). */
function internalRecipients(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Transmet une demande de site personnalisé à l'équipe DetailFlow, en
 * réutilisant l'infrastructure email existante (Resend via `sendEmail`).
 *
 * Ne lève jamais : renvoie le résultat structuré de l'envoi. La liste de
 * destinataires provient de `SUPER_ADMIN_EMAILS` ; si elle est vide, l'envoi
 * est ignoré proprement (`skipped`), sans casser le parcours.
 */
export async function sendCustomWebsiteRequest(input: CustomWebsiteRequestInput): Promise<SendResult> {
  const to = internalRecipients()
  if (to.length === 0) {
    console.log("[v0] Demande de site personnalisé non transmise (SUPER_ADMIN_EMAILS manquant) —", input.companyName)
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
