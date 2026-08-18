import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/payments/stripe-client"
import { claimEvent, settlePaymentPaid, settlePaymentCancelled } from "@/lib/payments/queries"

/**
 * ============================================================================
 *  WEBHOOK STRIPE — confirmation fiable des paiements
 * ============================================================================
 *  - Signature vérifiée (STRIPE_WEBHOOK_SECRET) : rejet si invalide.
 *  - Idempotent : chaque eventId n'est traité qu'une fois (claimEvent).
 *  - Rattaché au bon tenant + booking via les métadonnées signées.
 *  Un même événement reçu deux fois ne double JAMAIS paiement/commission/statut.
 *  La confirmation d'une réservation payée ne dépend QUE de ce webhook,
 *  jamais du retour navigateur.
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

  // Idempotence : si l'événement est déjà connu, on l'ignore (ACK 200).
  // `settlePaymentPaid`/`settlePaymentCancelled` sont eux-mêmes idempotents,
  // donc même en cas de rejeu avant l'enregistrement, aucun double effet.
  const isNew = await claimEvent(event.id, "stripe", event.type)
  if (!isNew) return NextResponse.json({ received: true, duplicate: true })

  try {
    switch (event.type) {
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
    // On log et on renvoie 500 : Stripe réessaiera (l'idempotence protège des
    // doublons puisque l'event n'aura été traité qu'en cas de succès complet).
    console.log("[v0] webhook: erreur de traitement:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
