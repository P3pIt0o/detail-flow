import "server-only"

/**
 * Câblage serveur des packs SMS Stripe (compte PLATEFORME, jamais Connect) :
 * création/réutilisation de la session Checkout et dépendances du webhook.
 */

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, smsRechargeRequests } from "@/lib/db/schema"
import { getStripe } from "@/lib/payments/stripe-client"
import { sendEmail } from "@/lib/email/send"
import { smsCreditedEmail } from "@/lib/email/templates"
import { tenantAdminUrl } from "@/lib/tenant-shared"
import { amountForQuantity } from "./config"
import {
  cancelPendingStripeRecharge,
  creditFromRecharge,
  generateRechargeReference,
  getSmsRechargeById,
  recordStripePaymentIntent,
} from "./credits"
import { allocateDeltaToTenant } from "./send"
import { buildSmsPackCheckoutParams, smsCheckoutIdempotencyKey, type SmsPackWebhookDeps } from "./checkout-core"

type CheckoutSession = { id: string; url: string | null; status?: string | null }

/**
 * Crée une recharge `pending` (provider stripe) + session Checkout. Si une
 * recharge Stripe pending de même quantité possède une session encore ouverte,
 * elle est réutilisée (double clic → même session, aucun double crédit).
 */
export async function startSmsPackCheckout(input: {
  companyId: number
  quantity: number
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string }> {
  const stripe = getStripe()
  const amountCents = amountForQuantity(input.quantity)

  const [existing] = await db
    .select({ id: smsRechargeRequests.id, sessionId: smsRechargeRequests.stripeCheckoutSessionId })
    .from(smsRechargeRequests)
    .where(
      and(
        eq(smsRechargeRequests.companyId, input.companyId),
        eq(smsRechargeRequests.paymentProvider, "stripe"),
        eq(smsRechargeRequests.status, "pending"),
        eq(smsRechargeRequests.quantity, input.quantity),
        eq(smsRechargeRequests.amountCents, amountCents),
      ),
    )
    .orderBy(smsRechargeRequests.id)
    .limit(1)
  if (existing?.sessionId) {
    const s = (await stripe.checkout.sessions.retrieve(existing.sessionId)) as unknown as CheckoutSession
    if (s.status === "open" && s.url) return { url: s.url }
  }

  const reference = await generateRechargeReference()
  const [recharge] = await db
    .insert(smsRechargeRequests)
    .values({ companyId: input.companyId, quantity: input.quantity, amountCents, reference, paymentProvider: "stripe" })
    .returning({ id: smsRechargeRequests.id })

  const params = buildSmsPackCheckoutParams(
    { id: recharge.id, companyId: input.companyId, quantity: input.quantity, amountCents, reference },
    { successUrl: input.successUrl, cancelUrl: input.cancelUrl },
  )
  const session = (await stripe.checkout.sessions.create(params as never, {
    idempotencyKey: smsCheckoutIdempotencyKey(recharge.id),
  })) as unknown as CheckoutSession
  await db
    .update(smsRechargeRequests)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(smsRechargeRequests.id, recharge.id))
  if (!session.url) throw new Error("Session Stripe sans URL.")
  return { url: session.url }
}

/** Statut d'une recharge Stripe d'un tenant (retour Checkout). Scopé par companyId. */
export async function getStripeRechargeStatus(companyId: number, sessionId: string): Promise<"paid" | "pending" | null> {
  const [row] = await db
    .select({ status: smsRechargeRequests.status })
    .from(smsRechargeRequests)
    .where(and(eq(smsRechargeRequests.companyId, companyId), eq(smsRechargeRequests.stripeCheckoutSessionId, sessionId)))
    .limit(1)
  if (!row) return null
  return row.status === "paid" ? "paid" : row.status === "pending" ? "pending" : null
}

export function createSmsPackWebhookDeps(): SmsPackWebhookDeps {
  return {
    getRecharge: getSmsRechargeById,
    credit: creditFromRecharge,
    cancel: cancelPendingStripeRecharge,
    allocate: allocateDeltaToTenant,
    recordPaymentIntent: recordStripePaymentIntent,
    async notifyCredited(companyId, quantity, newBalance) {
      const [company] = await db
        .select({ name: companies.name, slug: companies.slug, email: companies.email, phone: companies.phone })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)
      if (!company?.email) return
      const mail = smsCreditedEmail({
        companyName: company.name,
        quantity,
        newBalance,
        adminUrl: tenantAdminUrl(company.slug),
        businessEmail: company.email,
        businessPhone: company.phone,
      })
      await sendEmail({ to: company.email, subject: mail.subject, html: mail.html })
    },
  }
}
