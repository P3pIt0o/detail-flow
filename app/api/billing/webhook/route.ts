import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/payments/stripe-client"
import { handleBillingWebhook, type BillingWebhookDeps } from "@/lib/billing/lifetime-webhook"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"
import type { SubscriptionWebhookDeps } from "@/lib/billing/subscription-webhook"
import { createSmsPackWebhookDeps } from "@/lib/sms/checkout"

/**
 * WEBHOOK STRIPE BILLING — compte PLATEFORME DetailFlow (LOT S3A).
 * Distinct de /api/payments/webhook (Stripe Connect des detailers).
 * Signature vérifiée sur le corps BRUT avec STRIPE_BILLING_WEBHOOK_SECRET.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET
  if (!secret) {
    console.error("[billing-webhook] STRIPE_BILLING_WEBHOOK_SECRET manquant")
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 500 })
  }

  const rawBody = await req.text()
  const result = await handleBillingWebhook(
    { rawBody, signature: req.headers.get("stripe-signature") },
    {
      secret,
      stripe: getStripe() as unknown as BillingWebhookDeps["stripe"],
      subscriptions: {
        stripe: getStripe() as unknown as SubscriptionWebhookDeps["stripe"],
        store: createPgSubscriptionStore(),
      },
      smsPacks: createSmsPackWebhookDeps(),
    },
  )
  return NextResponse.json(result.body, { status: result.status })
}
