import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { drainCustomerSubscriptionOutbox } from "@/lib/customer-subscriptions/notifications"
import { sendEmail } from "@/lib/email/send"
import { rejectUnauthorizedCron } from "@/lib/cron/auth"

export const dynamic = "force-dynamic"

/**
 * Worker dédié à l'outbox emails des abonnements clients (voir vercel.json).
 * Ne traite QUE l'outbox : aucun rappel Booking, SMS, nettoyage ou appel Stripe.
 * Le claim/idempotence de l'outbox reste la seule source de vérité.
 * Sécurité : `Authorization: Bearer <CRON_SECRET>` exigé ; fail-closed (503)
 * si CRON_SECRET n'est pas configuré (lib/cron/auth.ts).
 */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

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
