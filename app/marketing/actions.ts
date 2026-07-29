"use server"

/**
 * Action de capture des prospects du Programme Beta Tester DetailFlow.
 * Enregistre le prospect dans la table `beta_leads`. Aucune authentification :
 * ce formulaire est public (page vitrine sur le domaine racine).
 */

import { db } from "@/lib/db"
import { betaLeads } from "@/lib/db/schema"

export type BetaLeadResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitBetaLead(_prev: BetaLeadResult | null, formData: FormData): Promise<BetaLeadResult> {
  const businessName = String(formData.get("businessName") ?? "").trim()
  const contactName = String(formData.get("contactName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const message = String(formData.get("message") ?? "").trim()

  // Validation serveur (ne jamais faire confiance au client).
  if (businessName.length < 2) return { ok: false, error: "Indiquez le nom de votre entreprise." }
  if (contactName.length < 2) return { ok: false, error: "Indiquez votre nom." }
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Adresse email invalide." }
  if (businessName.length > 160 || contactName.length > 160 || email.length > 200) {
    return { ok: false, error: "Un des champs est trop long." }
  }

  try {
    await db.insert(betaLeads).values({
      businessName,
      contactName,
      email: email.toLowerCase(),
      phone: phone || null,
      city: city || null,
      message: message || null,
    })
    return { ok: true }
  } catch (err) {
    console.error("[v0] submitBetaLead error:", err)
    return { ok: false, error: "Une erreur est survenue. Réessayez dans un instant." }
  }
}
