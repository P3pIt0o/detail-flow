/**
 * ============================================================================
 *  DetailFlow — SCRIPT ONE-SHOT : Products / Prices Stripe Billing (mensuels)
 * ============================================================================
 *
 *  OBJET : créer (une seule fois, de façon idempotente) les Products et les
 *  Prices récurrents MENSUELS des trois formules payantes DetailFlow :
 *
 *      Indépendant  → PRO         → 19,90 € / mois  (1990)
 *      Performance  → BUSINESS     → 34,90 € / mois  (3490)
 *      Équipe       → ENTERPRISE   → 59,90 € / mois  (5990)
 *
 *  Le plan « Essentiel » (FREE) est gratuit : AUCUN Product/Price.
 *  Le « Lifetime » est une offre distincte, livrée dans le LOT S2.5 : ce script
 *  ne crée AUCUN Product/Price Lifetime, aucun paiement fractionné.
 *
 *  CE SCRIPT NE CRÉE NI CHECKOUT, NI WEBHOOK, NI COUPON, NI TVA, NI TRIAL.
 *  Il ne touche JAMAIS à Stripe Connect (comptes connectés des detailers,
 *  application_fee_amount, commissions). Billing et Connect restent séparés.
 *
 *  ---------------------------------------------------------------------------
 *  IDEMPOTENCE
 *  ---------------------------------------------------------------------------
 *  - Chaque Product est identifié par ses métadonnées :
 *        app = detailflow, billing_type = subscription, license_plan = <PLAN>
 *  - Chaque Price est identifié par un `lookup_key` stable :
 *        detailflow_independant_monthly
 *        detailflow_performance_monthly
 *        detailflow_equipe_monthly
 *  Relancer le script ne recrée donc pas les objets déjà présents.
 *
 *  ---------------------------------------------------------------------------
 *  UTILISATION (TEST)
 *  ---------------------------------------------------------------------------
 *  1. S'assurer que STRIPE_SECRET_KEY pointe sur une clé TEST (`sk_test_...`).
 *     En local : node --env-file=.env scripts/setup-stripe-billing-products.ts
 *     (ou fournir la variable via l'environnement du shell).
 *  2. Lancer :
 *        npx tsx scripts/setup-stripe-billing-products.ts
 *  3. Copier les trois lignes affichées en fin d'exécution :
 *        STRIPE_PRICE_INDEPENDANT_MONTHLY=price_xxx
 *        STRIPE_PRICE_PERFORMANCE_MONTHLY=price_xxx
 *        STRIPE_PRICE_EQUIPE_MONTHLY=price_xxx
 *  4. Les renseigner dans les variables d'environnement du projet Vercel
 *     (Project → Settings → Environment Variables), PAS dans le dépôt Git.
 *
 *  ---------------------------------------------------------------------------
 *  PROTECTION LIVE
 *  ---------------------------------------------------------------------------
 *  Si STRIPE_SECRET_KEY est une clé LIVE (`sk_live_...` / `rk_live_...`), le
 *  script REFUSE de créer quoi que ce soit sauf si le drapeau explicite
 *  `--confirm-live` est présent :
 *        npx tsx scripts/setup-stripe-billing-products.ts --confirm-live
 *  Cela évite toute création accidentelle en production.
 *
 *  ---------------------------------------------------------------------------
 *  SÉCURITÉ / SECRETS
 *  ---------------------------------------------------------------------------
 *  - N'affiche jamais la clé secrète.
 *  - Ne committez JAMAIS les Price IDs réels ni les clés Stripe.
 *  - Le `.env.example` ne contient que les NOMS des variables (valeurs vides).
 *
 *  NB : ce script est prévu pour être lancé MANUELLEMENT et volontairement.
 *  Rien ici n'est importé par l'application : aucun appel Stripe au chargement
 *  de la landing, de l'admin, au login, à la réservation ou au démarrage.
 * ============================================================================
 */

import Stripe from "stripe"
import { BILLING_PLANS, PAID_BILLING_PLANS, type BillingLicensePlan } from "@/lib/billing/config"
import { assertPriceMatchesConfig, detectStripeMode, selectProductForPlan } from "@/lib/billing/stripe-setup"

function log(message: string): void {
  // Préfixe maison (jamais [v0]) ; aucune donnée sensible.
  console.log(`[DetailFlow] ${message}`)
}

async function findProductForPlan(stripe: Stripe, plan: BillingLicensePlan): Promise<Stripe.Product | null> {
  // Recherche par métadonnées via l'API Search (index Stripe). On récupère
  // plusieurs résultats pour DÉTECTER d'éventuels doublons plutôt que de
  // prendre arbitrairement le premier (cf. selectProductForPlan, fail-closed).
  const query = `active:'true' AND metadata['app']:'detailflow' AND metadata['billing_type']:'subscription' AND metadata['license_plan']:'${plan}'`
  const result = await stripe.products.search({ query, limit: 10 })
  return selectProductForPlan(result.data, plan)
}

async function findPriceByLookupKey(stripe: Stripe, lookupKey: string): Promise<Stripe.Price | null> {
  const result = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  return result.data[0] ?? null
}

async function ensureProduct(stripe: Stripe, plan: BillingLicensePlan): Promise<Stripe.Product> {
  const config = BILLING_PLANS[plan]
  const existing = await findProductForPlan(stripe, plan)
  if (existing) {
    log(`Product déjà présent pour ${plan} (${config.commercialName}) : ${existing.id}`)
    return existing
  }
  const created = await stripe.products.create({
    name: `DetailFlow ${config.commercialName}`,
    metadata: { app: "detailflow", billing_type: "subscription", license_plan: plan },
  })
  log(`Product créé pour ${plan} (${config.commercialName}) : ${created.id}`)
  return created
}

async function ensurePrice(stripe: Stripe, plan: BillingLicensePlan, productId: string): Promise<Stripe.Price> {
  const config = BILLING_PLANS[plan]
  if (!config.lookupKey || !config.interval) {
    throw new Error(`Configuration invalide pour ${plan} : lookupKey/interval manquant.`)
  }
  const existing = await findPriceByLookupKey(stripe, config.lookupKey)
  if (existing) {
    // Fail-closed : un Price portant le bon lookup_key mais dont la config
    // (montant, devise, interval, product, metadata) diffère STOPPE le script.
    assertPriceMatchesConfig(existing, plan, productId)
    log(`Price déjà présent et conforme pour ${plan} (${config.lookupKey}) : ${existing.id}`)
    return existing
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: config.currency,
    unit_amount: config.monthlyPriceCents,
    recurring: { interval: config.interval },
    lookup_key: config.lookupKey,
    // Pas de TVA ici (tax_behavior volontairement omis — traité séparément).
    metadata: { app: "detailflow", billing_type: "subscription", license_plan: plan },
  })
  log(`Price créé pour ${plan} (${config.lookupKey}) : ${created.id}`)
  return created
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    log("STRIPE_SECRET_KEY manquante : impossible de continuer.")
    process.exitCode = 1
    return
  }

  // Détection FAIL-CLOSED : une clé non reconnue (pk_…, format inconnu) STOPPE
  // immédiatement avant tout appel Stripe (jamais TEST par défaut).
  const mode = detectStripeMode(secretKey)
  log(`STRIPE MODE: ${mode}`)

  const confirmLive = process.argv.includes("--confirm-live")
  if (mode === "LIVE" && !confirmLive) {
    log("Refus : clé LIVE détectée sans --confirm-live. Relancez avec --confirm-live pour créer en production.")
    process.exitCode = 1
    return
  }

  const stripe = new Stripe(secretKey)
  const results: Record<string, string> = {}

  for (const plan of PAID_BILLING_PLANS) {
    const product = await ensureProduct(stripe, plan)
    const price = await ensurePrice(stripe, plan, product.id)
    const envName = BILLING_PLANS[plan].stripePriceEnv
    if (envName) results[envName] = price.id
  }

  log("---------------------------------------------------------------")
  log("Price IDs obtenus (à copier dans les variables Vercel, PAS dans Git) :")
  for (const [name, id] of Object.entries(results)) {
    // Affichage volontaire des Price IDs pour copie manuelle (non secrets).
    console.log(`${name}=${id}`)
  }
  log("---------------------------------------------------------------")
  log("Terminé. Aucun Checkout, aucun webhook, aucun Stripe Connect touché.")
}

main().catch((error: unknown) => {
  log(`Échec : ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
