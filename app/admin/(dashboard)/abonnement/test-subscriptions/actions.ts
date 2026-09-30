"use server"

/**
 * Actions serveur de l'outil de test ABONNEMENTS Preview.
 * Garde-fous réutilisés du Lifetime Preview, AVANT auth et tout appel Stripe :
 * A. VERCEL_ENV=preview  B. clé Stripe TEST
 * C. table marqueur detailflow_environment_guard = 'preview-lifetime'.
 * Puis OWNER exigé ; companyId toujours issu du contexte serveur.
 */

import { headers } from "next/headers"
import { requireCompanyMember } from "@/lib/admin"
import { pool } from "@/lib/db"
import { getStripe } from "@/lib/payments/stripe-client"
import { withTenant } from "@/lib/tenant-link"
import {
  LIFETIME_DATABASE_MARKER_SQL,
  LifetimeEnvironmentGuardError,
  assertLifetimePreviewDatabaseMarker,
  assertLifetimePreviewTestEnvironment,
} from "@/lib/billing/lifetime-environment-guard"
import { createSubscriptionCheckout, type SubscriptionCheckoutStripeClient } from "@/lib/billing/subscription-checkout"
import { SubscriptionError, isPreviewPurchasableSubscriptionPlan } from "@/lib/billing/subscription-core"
import { createSubscriptionPortalSession, type SubscriptionPortalDeps } from "@/lib/billing/subscription-portal"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"

export type SubscriptionTestActionResult = { ok: true; url: string } | { ok: false; error: string }

const UNAVAILABLE = "L'outil de test Abonnements n'est pas disponible sur cet environnement."

async function readDatabaseMarker(): Promise<string | null> {
  const result = await pool.query<{ environment: string | null }>(LIFETIME_DATABASE_MARKER_SQL)
  return result.rows[0]?.environment ?? null
}

async function assertPreviewTestGuards(): Promise<boolean> {
  try {
    assertLifetimePreviewTestEnvironment(process.env)
    await assertLifetimePreviewDatabaseMarker(readDatabaseMarker)
    return true
  } catch (error) {
    const detail = error instanceof LifetimeEnvironmentGuardError ? `${error.code} — ${error.message}` : "UNKNOWN"
    console.error("[subscription-preview-test] refusé:", detail)
    return false
  }
}

async function absoluteUrl(path: string): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}${path}`
}

function toResult(error: unknown, fallback: string): SubscriptionTestActionResult {
  if (error instanceof SubscriptionError) {
    console.error("[subscription-preview-test]", error.code, error.message)
    return { ok: false, error: error.message }
  }
  console.error("[subscription-preview-test] erreur:", error instanceof Error ? error.message : error)
  return { ok: false, error: fallback }
}

export async function startSubscriptionPreviewTestCheckout(plan: string): Promise<SubscriptionTestActionResult> {
  if (!(await assertPreviewTestGuards())) return { ok: false, error: UNAVAILABLE }
  if (!isPreviewPurchasableSubscriptionPlan(plan)) {
    return { ok: false, error: "Cette formule n'est pas encore commercialisable." }
  }
  const member = await requireCompanyMember(["OWNER"])
  const slug = member.tenant.slug
  try {
    const result = await createSubscriptionCheckout(
      {
        companyId: member.tenant.id,
        role: member.role,
        plan,
        successUrl: await absoluteUrl(withTenant("/admin/abonnement/test-subscriptions/retour", slug)),
        cancelUrl: await absoluteUrl(withTenant("/admin/abonnement/test-subscriptions?annule=1", slug)),
      },
      { stripe: getStripe() as unknown as SubscriptionCheckoutStripeClient, store: createPgSubscriptionStore() },
    )
    return { ok: true, url: result.url }
  } catch (error) {
    return toResult(error, "Impossible de démarrer le Checkout de test.")
  }
}

export async function openSubscriptionPreviewTestPortal(): Promise<SubscriptionTestActionResult> {
  if (!(await assertPreviewTestGuards())) return { ok: false, error: UNAVAILABLE }
  const member = await requireCompanyMember(["OWNER"])
  try {
    const result = await createSubscriptionPortalSession(
      {
        companyId: member.tenant.id,
        role: member.role,
        returnUrl: await absoluteUrl(withTenant("/admin/abonnement/test-subscriptions", member.tenant.slug)),
      },
      { stripe: getStripe() as unknown as SubscriptionPortalDeps["stripe"], store: createPgSubscriptionStore() },
    )
    return { ok: true, url: result.url }
  } catch (error) {
    return toResult(error, "Impossible d'ouvrir l'espace de facturation.")
  }
}
