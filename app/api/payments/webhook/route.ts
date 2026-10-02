import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/payments/stripe-client"
import {
  hasProcessedEvent,
  markEventProcessed,
  settlePaymentPaid,
  settlePaymentCancelled,
  getStripeAccountIdForCompany,
  syncConnectAccountFlagsByAccountId,
} from "@/lib/payments/queries"
import { sendPaymentReceivedEmails, sendRefundConfirmationEmail } from "@/lib/email/notifications"
import { applyStripeRefundEvent } from "@/lib/payments/refunds"
import { consumePlatformFeeReservation, releasePlatformFeeByExternalId } from "@/lib/payments/platform-fee-ledger"
import {
  syncStripePaymentFinancials,
  syncStripePaymentFinancialsByPaymentIntent,
} from "@/lib/payments/financials"
import { db } from "@/lib/db"
import {
  handleCustomerSubscriptionWebhook,
  isRetryableWebhookError,
  type WebhookEventLike,
} from "@/lib/customer-subscriptions/payments"
import { createCustomerSubscriptionStripePort } from "@/lib/customer-subscriptions/stripe"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"

/**
 * ============================================================================
 *  WEBHOOK STRIPE CONNECT — comptes connectés (Direct Charges)
 * ============================================================================
 *  Endpoint configuré côté Dashboard sur les "Comptes connectés" pour :
 *    - account.updated
 *    - checkout.session.completed
 *    - checkout.session.async_payment_succeeded
 *    - checkout.session.expired
 *
 *  - Signature vérifiée (STRIPE_WEBHOOK_SECRET) : rejet si invalide.
 *  - `event.account` identifie le compte connecté propriétaire de l'événement ;
 *     on VÉRIFIE qu'il correspond au `stripeAccountId` du tenant des métadonnées
 *     (jamais de confiance aveugle en un companyId issu du payload).
 *  - Idempotent : un événement n'est enregistré comme traité qu'APRÈS succès,
 *     donc un retry Stripe après erreur peut retraiter, et un doublon déjà
 *     traité est ignoré.
 *  La confirmation d'une réservation payée ne dépend QUE de ce webhook.
 * ============================================================================
 */

export const dynamic = "force-dynamic"
// Corps brut requis pour la vérification de signature Stripe.
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.log("[v0] webhook: STRIPE_WEBHOOK_SECRET manquant")
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 500 })
  }

  const sig = req.headers.get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "Signature manquante" }, { status: 400 })

  const body = await req.text()
  const stripe = getStripe()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (e) {
    console.log("[v0] webhook: signature invalide:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 })
  }

  // Doublon déjà traité avec succès → ACK 200 sans retraiter.
  if (await hasProcessedEvent(event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Abonnements d'entretien : intercepté UNIQUEMENT si l'objet est positivement
  // identifié comme customer_subscription ; sinon le flux Booking ci-dessous
  // s'applique strictement comme avant.
  try {
    const cs = await handleCustomerSubscriptionWebhook(
      db,
      createCustomerSubscriptionStripePort(stripe),
      event as unknown as WebhookEventLike,
    )
    if (cs.handled) {
      await markEventProcessed(event.id, "stripe", event.type)
      return NextResponse.json({ received: true, module: "customer_subscription", outcome: cs.outcome })
    }
  } catch (e) {
    if (isRetryableWebhookError(e)) {
      console.log("[v0] webhook customer-subscriptions: erreur transitoire", { type: event.type, code: e instanceof CustomerSubscriptionError ? e.code : "unknown" })
      return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 })
    }
    // Erreur métier définitive : ACK contrôlé, aucune mutation.
    console.log("[v0] webhook customer-subscriptions: rejet définitif", { type: event.type, code: (e as CustomerSubscriptionError).code })
    await markEventProcessed(event.id, "stripe", event.type)
    return NextResponse.json({ received: true, module: "customer_subscription", outcome: "rejected" })
  }

  // Compte connecté propriétaire de l'événement (présent pour les events Connect).
  const eventAccount = (event as { account?: string }).account ?? null

  try {
    switch (event.type) {
      case "account.updated": {
        // Synchronise l'état du compte connecté du tenant.
        const account = event.data.object as {
          id: string
          charges_enabled?: boolean
          details_submitted?: boolean
          payouts_enabled?: boolean
        }
        // L'id du compte vient de l'objet Stripe (et doit être cohérent avec
        // event.account quand présent).
        const accountId = eventAccount ?? account.id
        if (accountId) {
          await syncConnectAccountFlagsByAccountId({
            stripeAccountId: accountId,
            chargesEnabled: Boolean(account.charges_enabled),
            detailsSubmitted: Boolean(account.details_submitted),
            payoutsEnabled: Boolean(account.payouts_enabled),
          })
        }
        break
      }

      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as {
          id: string
          payment_status?: string
          payment_intent?: string | null
          metadata?: Record<string, string> | null
        }
        const companyId = Number.parseInt(session.metadata?.companyId ?? "", 10)
        const bookingId = Number.parseInt(session.metadata?.bookingId ?? "", 10)

        if (session.payment_status === "paid" && Number.isInteger(companyId) && Number.isInteger(bookingId)) {
          // Défense multi-tenant : le compte connecté de l'événement DOIT
          // correspondre au compte Stripe du tenant indiqué dans les métadonnées.
          const tenantAccountId = await getStripeAccountIdForCompany(companyId)
          if (!tenantAccountId || (eventAccount && eventAccount !== tenantAccountId)) {
            console.log("[v0] webhook: event.account ne correspond pas au tenant", {
              companyId,
              eventAccount,
            })
            // On enregistre l'événement pour ne pas boucler indéfiniment, mais on
            // n'applique AUCUN paiement (aucune fuite de compte tenant A vers B).
            break
          }
          await settlePaymentPaid({
            externalId: session.id,
            companyId,
            bookingId,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          })
          // Commission déjà réservée AVANT Stripe : on la fige, sans second
          // incrément du compteur mensuel (idempotent en cas de rejeu).
          await consumePlatformFeeReservation({ externalPaymentId: session.id, companyId })

          // Frais Stripe réels + net initial (BalanceTransaction du compte connecté).
          // Donnée secondaire : ne lève jamais, idempotente, rejouable.
          // Si la balance_transaction n'existe pas encore (capture asynchrone),
          // la finalisation est faite automatiquement par `charge.updated` :
          // l'événement checkout est donc marqué traité normalement.
          await syncStripePaymentFinancials({
            externalPaymentId: session.id,
            companyId,
            bookingId,
            connectedAccountId: tenantAccountId,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          })

          // Emails de paiement : on APPELLE TOUJOURS le dispatch après une résa
          // payée. L'idempotence ne repose plus sur `justPaid` (fragile : un
          // échec Resend suivi d'un rejeu ne serait jamais retenté) mais sur un
          // état DURABLE par destinataire (payments.meta). Ainsi : "sent" n'est
          // jamais renvoyé, "failed" est retenté au rejeu, deux webhooks
          // concurrents ne dupliquent pas (claim atomique). Non bloquant.
          await sendPaymentReceivedEmails(bookingId, companyId)
        }
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object as { id: string; metadata?: Record<string, string> | null }
        await settlePaymentCancelled(session.id)
        // Rien encaissé → libère la commission réservée sur son mois ORIGINAL
        // (idempotent). Même défense multi-tenant que pour le paiement.
        const expiredCompanyId = Number.parseInt(session.metadata?.companyId ?? "", 10)
        if (Number.isInteger(expiredCompanyId)) {
          const tenantAccountId = await getStripeAccountIdForCompany(expiredCompanyId)
          if (tenantAccountId && (!eventAccount || eventAccount === tenantAccountId)) {
            await releasePlatformFeeByExternalId({
              externalPaymentId: session.id,
              companyId: expiredCompanyId,
              reason: "checkout_expired",
            })
          }
        }
        break
      }

      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        // Objet Refund Stripe. En Direct Charges, `event.account` = compte
        // connecté propriétaire → sert à résoudre le tenant SANS jamais faire
        // confiance à un companyId du navigateur.
        const refund = event.data.object as {
          id: string
          payment_intent?: string | null
          status?: string | null
          amount?: number | null
        }
        const applied = await applyStripeRefundEvent({
          externalRefundId: refund.id,
          paymentIntentId: typeof refund.payment_intent === "string" ? refund.payment_intent : null,
          providerStatus: refund.status ?? null,
          amountCents: typeof refund.amount === "number" ? refund.amount : null,
          connectedAccountId: eventAccount,
        })
        // Email client UNE SEULE FOIS, uniquement quand le remboursement DEVIENT
        // effectif (claim atomique côté refunds.meta). Non bloquant.
        if (applied.justSucceeded && applied.refundId != null && applied.companyId != null) {
          await sendRefundConfirmationEmail(applied.refundId, applied.companyId)
        }
        break
      }

      case "charge.refunded": {
        // Réconciliation : un Charge peut porter plusieurs remboursements. On
        // rejoue chacun (idempotent par externalRefundId + recompute d'agrégat).
        const charge = event.data.object as {
          payment_intent?: string | null
          refunds?: { data?: { id: string; status?: string | null; amount?: number | null }[] } | null
        }
        const list = charge.refunds?.data ?? []
        for (const r of list) {
          const applied = await applyStripeRefundEvent({
            externalRefundId: r.id,
            paymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
            providerStatus: r.status ?? null,
            amountCents: typeof r.amount === "number" ? r.amount : null,
            connectedAccountId: eventAccount,
          })
          if (applied.justSucceeded && applied.refundId != null && applied.companyId != null) {
            await sendRefundConfirmationEmail(applied.refundId, applied.companyId)
          }
        }
        break
      }

      case "charge.updated": {
        // Finalisation financière automatique (balance_transaction devenue
        // disponible). Ne touche ni statut, ni brut, ni commission, ni emails.
        const charge = event.data.object as {
          id: string
          payment_intent?: string | { id?: string } | null
          balance_transaction?: string | { id?: string } | null
        }
        const paymentIntentId =
          typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null)
        // event.account obligatoire ; sans balance_transaction, rien à finaliser.
        if (!eventAccount || !paymentIntentId || !charge.balance_transaction) break
        const financials = await syncStripePaymentFinancialsByPaymentIntent({
          paymentIntentId,
          connectedAccountId: eventAccount,
        })
        // Erreur transitoire (réseau/DB) : 500 non marqué → retry Stripe
        // automatique, sans effet de bord (synchro idempotente).
        if (financials.status === "error") throw new Error("financials_sync_failed")
        break
      }

      default:
        // Autres événements ignorés en V1.
        break
    }
  } catch (e) {
    // Erreur de traitement : on NE marque PAS l'événement traité → Stripe
    // réessaiera et pourra le retraiter (l'application des paiements est
    // elle-même idempotente, donc aucun double effet possible).
    console.log("[v0] webhook: erreur de traitement:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 })
  }

  // Succès : on marque l'événement comme définitivement traité.
  await markEventProcessed(event.id, "stripe", event.type)
  return NextResponse.json({ received: true })
}
