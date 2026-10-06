import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { drainCustomerSubscriptionOutbox } from "@/lib/customer-subscriptions/notifications"
import { sendEmail } from "@/lib/email/send"

export const dynamic = "force-dynamic"

/**
 * Worker dédié à l'outbox emails des abonnements clients (voir vercel.json).
 * Ne traite QUE l'outbox : aucun rappel Booking, SMS, nettoyage ou appel Stripe.
 * Le claim/idempotence de l'outbox reste la seule source de vérité.
 * Sécurité identique à /api/cron/reminders : `Authorization: Bearer <CRON_SECRET>`
 * exigé dès qu'un CRON_SECRET est configuré.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
    }
  }

  try {
    const result = await drainCustomerSubscriptionOutbox(
      db,
      (args) => sendEmail(args as never),
      new Date(),
      { limit: 100 },
    )
    return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed, skipped: result.skipped })
  } catch (error) {
    console.error("[customer-subscriptions] email outbox drain failed", { code: (error as { code?: string })?.code ?? "unknown" })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
