"use server"

/**
 * Action serveur DÉDIÉE à l'outil de test Lifetime Preview.
 * Garde-fous (avant auth, réservation, allocation et tout appel Stripe) :
 * A. VERCEL_ENV=preview  B. clé Stripe TEST
 * C. marqueur PostgreSQL detailflow.environment = 'preview-lifetime'.
 * Puis OWNER exigé et flux Checkout Lifetime comptant existant.
 */

import { requireCompanyMember } from "@/lib/admin"
import { pool } from "@/lib/db"
import { runLifetimeSingleCheckout, type LifetimeCheckoutActionResult } from "@/lib/billing/lifetime-checkout-action"
import {
  LIFETIME_DATABASE_MARKER_SQL,
  LifetimeEnvironmentGuardError,
  assertLifetimePreviewDatabaseMarker,
  assertLifetimePreviewTestEnvironment,
} from "@/lib/billing/lifetime-environment-guard"

async function readDatabaseMarker(): Promise<string | null> {
  const result = await pool.query<{ environment: string | null }>(LIFETIME_DATABASE_MARKER_SQL)
  return result.rows[0]?.environment ?? null
}

export async function startLifetimePreviewTestCheckout(): Promise<LifetimeCheckoutActionResult> {
  try {
    assertLifetimePreviewTestEnvironment(process.env)
    await assertLifetimePreviewDatabaseMarker(readDatabaseMarker)
  } catch (error) {
    const detail = error instanceof LifetimeEnvironmentGuardError ? `${error.code} — ${error.message}` : "UNKNOWN"
    console.error("[lifetime-preview-test] refusé:", detail)
    return { ok: false, error: "L'outil de test Lifetime n'est pas disponible sur cet environnement." }
  }
  const member = await requireCompanyMember(["OWNER"])
  return runLifetimeSingleCheckout(member)
}
