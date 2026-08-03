"use server"

/**
 * Server Action de traitement du formulaire de contact.
 *
 * Envoie réellement le message à l'adresse de l'entreprise du TENANT courant
 * (jamais une adresse statique DetailFlow), avec `replyTo` = email du visiteur.
 * La résolution du tenant se fait côté serveur ; aucune confiance aux données
 * client. Validation serveur systématique.
 */

import { getPublicContact } from "@/lib/public-contact"
import { getCurrentTenant } from "@/lib/tenant"
import { sendEmail } from "@/lib/email/send"

export type ContactFormState = {
  status: "idle" | "success" | "error"
  message: string
  /** Erreurs par champ pour un affichage précis */
  errors?: Partial<Record<"name" | "email" | "phone" | "message", string>>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitContactForm(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const message = String(formData.get("message") ?? "").trim()

  // Anti-spam : champ caché "honeypot". Rempli => robot.
  const honeypot = String(formData.get("company") ?? "")
  if (honeypot) {
    return { status: "success", message: "Merci, votre message a bien été envoyé." }
  }

  const errors: ContactFormState["errors"] = {}
  if (name.length < 2) errors.name = "Merci d'indiquer votre nom."
  if (!EMAIL_RE.test(email)) errors.email = "Adresse email invalide."
  if (message.length < 10) errors.message = "Votre message est trop court."

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Veuillez corriger les champs indiqués.", errors }
  }

  try {
    // Destinataire = email de l'entreprise du tenant courant (jamais statique).
    const [tenant, contact] = await Promise.all([getCurrentTenant(), getPublicContact()])
    if (!contact.email) {
      return {
        status: "error",
        message: "Le formulaire n'est pas disponible pour le moment. Merci de nous contacter par téléphone.",
      }
    }

    const businessName = tenant?.name ?? "votre entreprise"
    const safePhone = phone || "non renseigné"
    const html = `
      <h2>Nouveau message depuis le site</h2>
      <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
      <p><strong>Email :</strong> ${escapeHtml(email)}</p>
      <p><strong>Téléphone :</strong> ${escapeHtml(safePhone)}</p>
      <p><strong>Message :</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `

    const result = await sendEmail({
      to: contact.email,
      subject: `Nouveau message de contact — ${name}`,
      html,
      fromName: businessName,
      replyTo: email,
    })

    if (!result.ok && !result.skipped) {
      return {
        status: "error",
        message: "Une erreur est survenue. Merci de réessayer ou de nous appeler directement.",
      }
    }

    return {
      status: "success",
      message: "Merci ! Votre message a bien été envoyé. Nous vous répondrons rapidement.",
    }
  } catch (error) {
    console.log("[v0] Erreur lors de l'envoi du formulaire de contact:", error)
    return {
      status: "error",
      message: "Une erreur est survenue. Merci de réessayer ou de nous appeler directement.",
    }
  }
}

/** Échappe le HTML pour éviter toute injection dans l'email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
