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
        }
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object as { id: string }
        await settlePaymentCancelled(session.id)
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
