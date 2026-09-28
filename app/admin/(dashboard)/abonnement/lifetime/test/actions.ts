"use server"

/**
 * Action serveur DÉDIÉE à l'outil de test Lifetime Preview.
 * Garde-fous (avant auth, réservation, allocation et tout appel Stripe) :
 * VERCEL_ENV=preview + clé Stripe TEST + hostname DATABASE_URL ===
 * LIFETIME_PREVIEW_DATABASE_HOST. Puis OWNER exigé.
 */

import { requireCompanyMember } from "@/lib/admin"
import { runLifetimeSingleCheckout, type LifetimeCheckoutActionResult } from "@/lib/billing/lifetime-checkout-action"
import {
  LifetimeEnvironmentGuardError,
  assertLifetimePreviewTestEnvironment,
} from "@/lib/billing/lifetime-environment-guard"

export async function startLifetimePreviewTestCheckout(): Promise<LifetimeCheckoutActionResult> {
  try {
    assertLifetimePreviewTestEnvironment(process.env)
  } catch (error) {
    // Message technique sans secret (au plus un hostname) ; message générique au client.
    const detail = error instanceof LifetimeEnvironmentGuardError ? `${error.code} — ${error.message}` : "UNKNOWN"
    console.error("[lifetime-preview-test] refusé:", detail)
    return { ok: false, error: "L'outil de test Lifetime n'est pas disponible sur cet environnement." }
  }
  const member = await requireCompanyMember(["OWNER"])
  return runLifetimeSingleCheckout(member)
}
