"use server"

import { headers as nextHeaders } from "next/headers"
import { validateDiagnostic, type DiagnosticField } from "@/lib/diagnostic/schema"
import {
  sendDiagnosticRequest,
  interpretDiagnosticResult,
  DIAGNOSTIC_ERROR_MESSAGE,
} from "@/lib/email/diagnostic"
import {
  checkDiagnosticRateLimit,
  DIAGNOSTIC_RATE_LIMITED_MESSAGE,
  type RateLimitDecision,
} from "@/lib/diagnostic/rate-limit"

/**
 * Server Action du questionnaire « site sur mesure » (diagnostic gratuit).
 *
 * Ne crée ni ne modifie aucune donnée : validation serveur + envoi email vers
 * `contact@detailflow.fr`. Aucune confiance aux données navigateur. Confirmation
 * uniquement si Resend accepte réellement l'envoi.
 *
 * Protection anti-abus en couches :
 *   1. honeypot invisible (`website`) — un bot le remplit => succès neutre, pas d'email ;
 *   2. rate limiting distribué (Vercel Firewall) — 5 soumissions / 10 min par IP.
 */

export type DiagnosticState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<DiagnosticField, string>>; rateLimited?: boolean }

export type DiagnosticPayload = Record<string, unknown> & {
  /** Champ honeypot anti-spam : rempli => robot. */
  website?: string
}

/**
 * Dépendances injectables — permet de tester l'orchestration (honeypot, rate
 * limit, validation, envoi) sans réseau ni Firewall réels.
 */
export type DiagnosticDeps = {
  checkRateLimit: (headers: Headers) => Promise<RateLimitDecision>
  send: typeof sendDiagnosticRequest
  getHeaders: () => Promise<Headers>
}

const defaultDeps: DiagnosticDeps = {
  checkRateLimit: checkDiagnosticRateLimit,
  send: sendDiagnosticRequest,
  getHeaders: async () => new Headers(await nextHeaders()),
}

/** Cœur testable de la Server Action (dépendances injectées). */
export async function runSubmitDiagnostic(
  payload: DiagnosticPayload,
  deps: DiagnosticDeps = defaultDeps,
): Promise<DiagnosticState> {
  // 1) Honeypot invisible : un bot le remplit => succès neutre SANS email.
  if (typeof payload?.website === "string" && payload.website.trim() !== "") {
    return { ok: true }
  }

  // 2) Rate limiting distribué (avant toute validation ou envoi).
  const decision = await deps.checkRateLimit(await deps.getHeaders())
  if (decision.limited) {
    return { ok: false, error: DIAGNOSTIC_RATE_LIMITED_MESSAGE, rateLimited: true }
  }

  // 3) Validation serveur stricte (aucune confiance au navigateur).
  const parsed = validateDiagnostic(payload)
  if (!parsed.ok) {
    return {
      ok: false,
      error: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.errors,
    }
  }

  // 4) Envoi réel ; confirmation seulement si Resend accepte.
  const res = await deps.send(parsed.data)
  const outcome = interpretDiagnosticResult(res)
  if (!outcome.ok) {
    // Détail journalisé côté serveur (sans secret) ; message générique au client.
    console.log(
      "[DetailFlow] Échec envoi diagnostic site sur mesure:",
      JSON.stringify({ company: parsed.data.companyName, skipped: res.skipped ?? false, error: res.error ?? null }),
    )
    return { ok: false, error: DIAGNOSTIC_ERROR_MESSAGE }
  }

  return { ok: true }
}

export async function submitDiagnostic(payload: DiagnosticPayload): Promise<DiagnosticState> {
  return runSubmitDiagnostic(payload)
}
