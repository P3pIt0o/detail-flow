/**
 * ============================================================================
 *  DetailFlow — SCRIPT ONE-SHOT : Product + Prices Stripe LIFETIME (LOT S2.5B)
 * ============================================================================
 *
 *  Crée (idempotent) :
 *    - 1 Product  « DetailFlow Lifetime »
 *        metadata : app=detailflow, billing_type=lifetime, offer=lifetime
 *    - 2 Prices ONE-TIME (non récurrents), EUR, montants HT issus de
 *      lib/billing/lifetime.ts :
 *        detailflow_lifetime_single       → 129000 (paiement comptant)
 *        detailflow_lifetime_installment  →  69000 (UNE échéance du 2 × 690 €)
 *
 *  NE CRÉE NI CHECKOUT, NI PAYMENTINTENT, NI SUBSCRIPTION, NI SCHEDULE, NI
 *  INVOICE, NI WEBHOOK, NI TVA. Ne touche jamais Stripe Connect ni la DB.
 *
 *  UTILISATION (TEST) :
 *      npx tsx scripts/setup-stripe-lifetime-product.ts
 *  LIVE (refusé sans le drapeau) :
 *      npx tsx scripts/setup-stripe-lifetime-product.ts --confirm-live
 *
 *  Fail-closed : Product dupliqué/incohérent, Price existant non conforme,
 *  env Price ID invalide/dupliqué/incohérent → STOP, rien n'est modifié.
 *  Ne committez JAMAIS les Price IDs réels ni les clés Stripe.
 * ============================================================================
 */

import Stripe from "stripe"
import { detectStripeMode } from "@/lib/billing/stripe-setup"
import {
  LIFETIME_PRICE_KINDS,
  LIFETIME_STRIPE_PRICES,
  LIFETIME_STRIPE_PRODUCT,
  assertEnvPriceIdConsistent,
  assertLifetimePriceMatches,
  assertStripeModeAllowed,
  readLifetimeEnvPriceIds,
  selectLifetimeProduct,
  type LifetimePriceKind,
} from "@/lib/billing/lifetime-stripe-setup"

function log(message: string): void {
  console.log(`[DetailFlow] ${message}`)
}

async function ensureProduct(stripe: Stripe): Promise<Stripe.Product> {
  const meta = LIFETIME_STRIPE_PRODUCT.metadata
  const query = `active:'true' AND metadata['app']:'${meta.app}' AND metadata['billing_type']:'${meta.billing_type}' AND metadata['offer']:'${meta.offer}'`
  const result = await stripe.products.search({ query, limit: 10 })
  const existing = selectLifetimeProduct(result.data)
  if (existing) {
    log(`Product Lifetime déjà présent et conforme : ${existing.id}`)
    return existing
  }
  const created = await stripe.products.create({
    name: LIFETIME_STRIPE_PRODUCT.name,
    description: LIFETIME_STRIPE_PRODUCT.description,
    metadata: { ...meta },
  })
  log(`Product Lifetime créé : ${created.id}`)
  return created
}

async function ensurePrice(
  stripe: Stripe,
  kind: LifetimePriceKind,
  productId: string,
  envId: string | null,
): Promise<Stripe.Price> {
  const spec = LIFETIME_STRIPE_PRICES[kind]

  if (envId) {
    const fromEnv = await stripe.prices.retrieve(envId)
    assertLifetimePriceMatches(fromEnv, kind, productId)
  }

  const list = await stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 })
  const existing = list.data[0] ?? null
  assertEnvPriceIdConsistent(kind, envId, existing?.id ?? null)

  if (existing) {
    assertLifetimePriceMatches(existing, kind, productId)
    log(`Price déjà présent et conforme (${spec.lookupKey}) : ${existing.id}`)
    return existing
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: spec.currency,
    unit_amount: spec.unitAmount,
    lookup_key: spec.lookupKey,
    // One-time : aucun `recurring`. Pas de tax_behavior (TVA traitée séparément).
    metadata: { ...spec.metadata },
  })
  log(`Price créé (${spec.lookupKey}) : ${created.id}`)
  return created
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const mode = detectStripeMode(secretKey)
  log(`STRIPE MODE: ${mode}`)
  assertStripeModeAllowed(mode, process.argv)

  const envIds = readLifetimeEnvPriceIds(process.env)
  const stripe = new Stripe(secretKey as string)

  const product = await ensureProduct(stripe)
  const results: Record<string, string> = {}
  for (const kind of LIFETIME_PRICE_KINDS) {
    const price = await ensurePrice(stripe, kind, product.id, envIds[kind])
    results[LIFETIME_STRIPE_PRICES[kind].envName] = price.id
  }

  log("---------------------------------------------------------------")
  log("Price IDs obtenus (à copier dans les variables Vercel, PAS dans Git) :")
  console.log(`STRIPE_PRODUCT_LIFETIME=${product.id}`)
  for (const [name, id] of Object.entries(results)) console.log(`${name}=${id}`)
  log("---------------------------------------------------------------")
  log("Terminé. Aucun Checkout, aucun webhook, aucun Stripe Connect touché.")
}

main().catch((error: unknown) => {
  log(`Échec : ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
