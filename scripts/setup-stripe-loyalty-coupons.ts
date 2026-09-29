/**
 * ============================================================================
 *  DetailFlow — SCRIPT ONE-SHOT : Coupons Stripe BACKEND de fidélité
 * ============================================================================
 *
 *  Crée (idempotent) les 5 coupons fidélité `duration = forever` :
 *      5 %, 10 %, 15 %, 17,5 %, 20 %
 *  dérivés du barème unique (lib/billing/commercial-rules.ts).
 *
 *  Ces coupons ne sont PAS des codes promotionnels publics : aucun Promotion
 *  Code n'est créé. Seul le webhook Billing (invoice.created) les applique.
 *
 *  IDEMPOTENCE : chaque coupon a un ID déterministe (detailflow_loyalty_<x>).
 *  S'il existe déjà, il est VÉRIFIÉ (percent_off, duration, métadonnées) ;
 *  s'il est incohérent, le script échoue sans rien modifier.
 *
 *  UTILISATION (TEST) :
 *      npx tsx scripts/setup-stripe-loyalty-coupons.ts
 *  puis renseigner les lignes affichées dans les variables Vercel (Preview) :
 *      STRIPE_COUPON_LOYALTY_5 / _10 / _15 / _17_5 / _20
 *  Ne JAMAIS committer les IDs réels.
 *
 *  PROTECTION LIVE : clé LIVE refusée sauf drapeau explicite --confirm-live.
 *  La clé secrète n'est jamais affichée. Aucun appel Stripe Connect.
 * ============================================================================
 */

import Stripe from "stripe"
import { detectStripeMode } from "@/lib/billing/stripe-setup"
import { LOYALTY_COUPONS, assertLoyaltyCouponValid, buildLoyaltyCouponCreateParams } from "@/lib/billing/loyalty-coupons"

function log(message: string): void {
  console.log(`[DetailFlow] ${message}`)
}

async function retrieveCoupon(stripe: Stripe, id: string): Promise<Stripe.Coupon | null> {
  try {
    return await stripe.coupons.retrieve(id)
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") return null
    throw error
  }
}

async function main(): Promise<void> {
  const mode = detectStripeMode(process.env.STRIPE_SECRET_KEY)
  if (mode === "LIVE" && !process.argv.includes("--confirm-live")) {
    throw new Error("Clé Stripe LIVE détectée : relancez avec --confirm-live si c'est volontaire.")
  }
  log(`Mode Stripe : ${mode}`)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

  const lines: string[] = []
  for (const spec of LOYALTY_COUPONS) {
    let coupon = await retrieveCoupon(stripe, spec.couponId)
    if (coupon) {
      log(`Coupon existant : ${spec.couponId}`)
    } else {
      coupon = await stripe.coupons.create(buildLoyaltyCouponCreateParams(spec), {
        idempotencyKey: `detailflow-setup-${spec.couponId}`,
      })
      log(`Coupon créé : ${spec.couponId}`)
    }
    assertLoyaltyCouponValid(coupon, spec)
    lines.push(`${spec.envName}=${coupon.id}`)
  }

  log("Variables à renseigner dans Vercel (Preview) :")
  for (const line of lines) console.log(line)
}

main().catch((error: unknown) => {
  console.error(`[DetailFlow] Échec : ${error instanceof Error ? error.message : "erreur inconnue"}`)
  process.exit(1)
})
