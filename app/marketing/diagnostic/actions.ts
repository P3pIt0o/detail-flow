"use server"

import { validateDiagnostic, type DiagnosticField } from "@/lib/diagnostic/schema"
import {
  sendDiagnosticRequest,
  interpretDiagnosticResult,
  DIAGNOSTIC_ERROR_MESSAGE,
} from "@/lib/email/diagnostic"

/**
 * Server Action du questionnaire « site sur mesure » (diagnostic gratuit).
 *
 * Ne crée ni ne modifie aucune donnée : validation serveur + envoi email vers
 * `contact@detailflow.fr`. Aucune confiance aux données navigateur. Confirmation
 * uniquement si Resend accepte réellement l'envoi.
 */

export type DiagnosticState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<DiagnosticField, string>> }

export type DiagnosticPayload = Record<string, unknown> & {
  /** Champ honeypot anti-spam : rempli => robot. */
  website?: string
}

export async function submitDiagnostic(payload: DiagnosticPayload): Promise<DiagnosticState> {
  // Anti-spam léger (point 27) : honeypot invisible. Un bot le remplit => on
  // renvoie un succès neutre SANS envoyer d'email.
  if (typeof payload?.website === "string" && payload.website.trim() !== "") {
    return { ok: true }
  }

  const parsed = validateDiagnostic(payload)
  if (!parsed.ok) {
    return {
      ok: false,
      error: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.errors,
    }
  }

  const res = await sendDiagnosticRequest(parsed.data)
  const outcome = interpretDiagnosticResult(res)
  if (!outcome.ok) {
    // Détail journalisé côté serveur (sans secret) ; message générique au client.
    console.log(
      "[v0] Échec envoi diagnostic site sur mesure:",
      JSON.stringify({ company: parsed.data.companyName, skipped: res.skipped ?? false, error: res.error ?? null }),
    )
    return { ok: false, error: DIAGNOSTIC_ERROR_MESSAGE }
  }

  return { ok: true }
}
