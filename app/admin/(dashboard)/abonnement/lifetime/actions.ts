"use server"

/**
 * Action serveur : démarre le Checkout Lifetime comptant (LOT S3A).
 * AUCUN argument : le tenant et le rôle viennent exclusivement de la session.
 * Non reliée à une UI dans ce lot (aucun CTA public).
 */

import { headers } from "next/headers"
import { requireCompanyMember } from "@/lib/admin"
import { getStripe } from "@/lib/payments/stripe-client"
import { withTenant } from "@/lib/tenant-link"
import { createLifetimeSingleCheckout, type LifetimeCheckoutStripeClient } from "@/lib/billing/lifetime-checkout"
import { LifetimeCheckoutError } from "@/lib/billing/lifetime-checkout-core"
import { LifetimeError } from "@/lib/billing/lifetime"

export type LifetimeCheckoutActionResult = { ok: true; url: string } | { ok: false; error: string }

async function absoluteUrl(path: string): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}${path}`
}

export async function startLifetimeSingleCheckout(): Promise<LifetimeCheckoutActionResult> {
  const member = await requireCompanyMember(["OWNER"])
  const slug = member.tenant.slug

  try {
    const result = await createLifetimeSingleCheckout(
      {
        companyId: member.tenant.id,
        role: member.role,
        isSuperAdmin: member.isSuperAdmin,
        successUrl: await absoluteUrl(
          withTenant("/admin/abonnement/lifetime/retour?session_id={CHECKOUT_SESSION_ID}", slug),
        ),
        cancelUrl: await absoluteUrl(withTenant("/admin/abonnement/lifetime/retour?annule=1", slug)),
      },
      { stripe: getStripe() as unknown as LifetimeCheckoutStripeClient },
    )
    return { ok: true, url: result.url }
  } catch (error) {
    if (error instanceof LifetimeCheckoutError || error instanceof LifetimeError) {
      return { ok: false, error: error.message }
    }
    console.error("[lifetime-checkout] erreur inattendue:", error)
    return { ok: false, error: "Le paiement Lifetime n'a pas pu être initialisé." }
  }
}
