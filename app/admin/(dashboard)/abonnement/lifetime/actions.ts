"use server"

/**
 * Action serveur : démarre le Checkout Lifetime comptant (LOT S3A).
 * AUCUN argument : le tenant et le rôle viennent exclusivement de la session.
 * Non reliée à une UI dans ce lot (aucun CTA public).
 *
 * Verrou LIVE : sans LIFETIME_LIVE_CHECKOUT_ENABLED="true", aucun Checkout en
 * Production ni avec une clé Stripe LIVE (vérifié avant toute opération).
 */

import { requireCompanyMember } from "@/lib/admin"
import { runLifetimeSingleCheckout, type LifetimeCheckoutActionResult } from "@/lib/billing/lifetime-checkout-action"
import {
  LifetimeEnvironmentGuardError,
  assertLifetimeLiveCheckoutAllowed,
} from "@/lib/billing/lifetime-environment-guard"

export async function startLifetimeSingleCheckout(): Promise<LifetimeCheckoutActionResult> {
  try {
    assertLifetimeLiveCheckoutAllowed(process.env)
  } catch (error) {
    const code = error instanceof LifetimeEnvironmentGuardError ? error.code : "UNKNOWN"
    console.error("[lifetime-checkout] refusé par garde-fou d'environnement:", code)
    return { ok: false, error: "Le paiement Lifetime n'est pas disponible pour le moment." }
  }
  const member = await requireCompanyMember(["OWNER"])
  return runLifetimeSingleCheckout(member)
}
