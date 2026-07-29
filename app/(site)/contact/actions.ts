"use server"

/**
 * Server Action de traitement du formulaire de contact.
 *
 * PHASE 1 : validation + journalisation côté serveur (aucun email envoyé).
 * PHASE 4 : brancher ici l'envoi d'email (Resend/Nodemailer) et/ou
 *           l'enregistrement en base (table ContactMessage du schéma Prisma).
 *
 * La validation se fait côté serveur pour la sécurité (ne jamais faire
 * confiance aux données client).
 */

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
    // PHASE 4 — Exemple d'intégration future :
    // await sendEmail({ to: siteConfig.contact.email, subject: `Contact — ${name}`, ... })
    // await prisma.contactMessage.create({ data: { name, email, phone, message } })
    console.log("[v0] Nouveau message de contact:", { name, email, phone })

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
