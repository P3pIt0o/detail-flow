import "server-only"
import { Resend } from "resend"

/**
 * Client Resend + helper d'envoi centralisé.
 *
 * - `RESEND_API_KEY` : requis pour envoyer réellement. Absent → on log et on
 *   ignore (utile en preview / avant configuration).
 * - `EMAIL_FROM` : expéditeur vérifié (ex. "DetailFlow <contact@mondomaine.fr>").
 *   Par défaut on utilise l'expéditeur de test Resend `onboarding@resend.dev`,
 *   qui fonctionne sans domaine vérifié mais n'envoie qu'à des adresses de test
 *   limitées. Le professionnel devra vérifier son domaine pour la production.
 */

const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

const DEFAULT_FROM = "DetailFlow <onboarding@resend.dev>"

export type SendResult = { ok: boolean; id?: string; error?: string; skipped?: boolean }

type EmailAttachment = {
  filename: string
  content: Buffer
}

type SendArgs = {
  to: string | string[]
  subject: string
  html: string
  /** Nom d'expéditeur affiché (ex. nom de l'entreprise). */
  fromName?: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

/** Construit l'adresse "from" en respectant EMAIL_FROM si fourni. */
function resolveFrom(fromName?: string): string {
  const configured = process.env.EMAIL_FROM
  if (configured) return configured
  if (fromName) {
    // On garde le domaine de test Resend mais on personnalise le nom affiché.
    const safeName = fromName.replace(/[<>\r\n"]/g, "").trim()
    if (safeName) return `${safeName} <onboarding@resend.dev>`
  }
  return DEFAULT_FROM
}

/**
 * Envoi d'un email. Ne lève jamais : renvoie un résultat structuré pour ne
 * pas casser le flux de réservation si l'email échoue.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (!resend) {
    console.log("[v0] Email non envoyé (RESEND_API_KEY manquante) —", args.subject)
    return { ok: false, skipped: true, error: "RESEND_API_KEY manquante" }
  }
  try {
    const { data, error } = await resend.emails.send({
      from: resolveFrom(args.fromName),
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.attachments?.length
        ? { attachments: args.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    })
    if (error) {
      console.log("[v0] Erreur envoi email:", error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true, id: data?.id }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue"
    console.log("[v0] Exception envoi email:", message)
    return { ok: false, error: message }
  }
}
