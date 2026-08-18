"use server"

/**
 * ============================================================================
 *  ACTIONS SERVEUR — PAIEMENTS EN LIGNE (Stripe Connect)
 * ============================================================================
 *  ISOLATION : toute action est scopée à l'entreprise de l'admin connecté
 *  (`requireCompanyMember().tenant.id`). L'id d'entreprise ne vient JAMAIS du
 *  client. Un admin ne peut donc configurer que SA propre entreprise.
 * ============================================================================
 */

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember, requireCompanyRole } from "@/lib/admin"
import { createOnboardingLink, syncConnectAccountStatus, createExpressLoginLink } from "@/lib/payments/connect"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"

export type PaymentActionResult = { ok: boolean; error?: string; url?: string }

/** Construit une URL absolue du tenant courant à partir des en-têtes de requête. */
async function absoluteUrl(path: string): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}${path}`
}

/** Démarre (ou reprend) l'onboarding Stripe et renvoie l'URL du parcours officiel. */
export async function startStripeOnboarding(): Promise<PaymentActionResult> {
  const { tenant } = await requireCompanyRole(["OWNER", "ADMIN"])
  try {
    const returnUrl = await absoluteUrl("/admin/parametres?tab=payments&stripe=return")
    const refreshUrl = await absoluteUrl("/admin/parametres?tab=payments&stripe=refresh")
    const url = await createOnboardingLink({ companyId: tenant.id, returnUrl, refreshUrl })
    return { ok: true, url }
  } catch (e) {
    console.log("[v0] startStripeOnboarding error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Impossible de démarrer la configuration Stripe. Réessayez." }
  }
}

/** Resynchronise l'état du compte connecté depuis Stripe. */
export async function refreshStripeStatus(): Promise<PaymentActionResult> {
  const { tenant } = await requireCompanyRole(["OWNER", "ADMIN"])
  try {
    await syncConnectAccountStatus(tenant.id)
    revalidatePath("/admin/parametres")
    return { ok: true }
  } catch (e) {
    console.log("[v0] refreshStripeStatus error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Impossible de rafraîchir le statut Stripe." }
  }
}

/** Lien vers le tableau de bord Stripe Express du professionnel. */
export async function openStripeDashboard(): Promise<PaymentActionResult> {
  const { tenant } = await requireCompanyRole(["OWNER", "ADMIN"])
  try {
    const url = await createExpressLoginLink(tenant.id)
    if (!url) return { ok: false, error: "Aucun compte Stripe connecté." }
    return { ok: true, url }
  } catch (e) {
    console.log("[v0] openStripeDashboard error:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Impossible d'ouvrir le tableau de bord Stripe." }
  }
}

/**
 * Enregistre les préférences de paiement : activation + mode.
 * Contrôle serveur : impossible d'activer si le compte ne peut pas encaisser.
 */
export async function savePaymentSettings(input: {
  paymentsEnabled: boolean
  paymentMode: "none" | "deposit" | "full"
}): Promise<PaymentActionResult> {
  const { tenant } = await requireCompanyRole(["OWNER", "ADMIN"])

  const mode = ["none", "deposit", "full"].includes(input.paymentMode) ? input.paymentMode : "none"

  if (input.paymentsEnabled) {
    const cfg = await getCompanyPaymentConfig(tenant.id)
    if (!cfg?.stripeChargesEnabled || !cfg.stripeAccountId) {
      return { ok: false, error: "Terminez d'abord la configuration Stripe avant d'activer les paiements." }
    }
    if (mode === "none") {
      return { ok: false, error: "Choisissez un mode de paiement (acompte ou paiement intégral)." }
    }
  }

  await db
    .update(companies)
    .set({
      paymentsEnabled: input.paymentsEnabled,
      paymentMode: mode,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, tenant.id))

  revalidatePath("/admin/parametres")
  return { ok: true }
}

/** Assure la présence de la garde member (utilisé par la page). */
export async function assertMember() {
  await requireCompanyMember()
}
