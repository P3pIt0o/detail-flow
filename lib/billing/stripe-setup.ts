/**
 * DetailFlow — Fonctions PURES du setup Stripe Billing (LOT S2.1).
 *
 * Ce module ne fait AUCUN appel réseau et n'exécute rien au chargement : il
 * contient uniquement des fonctions déterministes extraites du script one-shot
 * `scripts/setup-stripe-billing-products.ts` afin de pouvoir être testées sans
 * clé Stripe ni requête réelle.
 *
 * Règle générale : FAIL-CLOSED. Tout écart de configuration lève une erreur
 * explicite plutôt qu'un comportement « au mieux ».
 */

import type Stripe from "stripe"
import { BILLING_PLANS, type BillingLicensePlan } from "@/lib/billing/config"

export type StripeMode = "TEST" | "LIVE"

/** Erreur dédiée au script de setup (distincte des erreurs réseau Stripe). */
export class StripeSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StripeSetupError"
  }
}

/* -------------------------------------------------------------------------- */
/*  1. Détection stricte du mode (fail-closed)                                */
/* -------------------------------------------------------------------------- */

/** Clés serveur TEST reconnues : `sk_test_…` / `rk_test_…`. */
const TEST_KEY = /^(sk|rk)_test_.+/
/** Clés serveur LIVE reconnues : `sk_live_…` / `rk_live_…`. */
const LIVE_KEY = /^(sk|rk)_live_.+/

/**
 * Détermine le mode Stripe à partir de la clé SERVEUR.
 *
 * N'accepte QUE des clés serveur reconnues. Toute autre valeur (`pk_…`, chaîne
 * arbitraire, vide, format inconnu) est REFUSÉE avant tout appel Stripe : on ne
 * suppose jamais TEST par défaut.
 */
export function detectStripeMode(secretKey: string | null | undefined): StripeMode {
  const key = typeof secretKey === "string" ? secretKey.trim() : ""
  if (TEST_KEY.test(key)) return "TEST"
  if (LIVE_KEY.test(key)) return "LIVE"
  throw new StripeSetupError("Clé Stripe serveur invalide ou mode impossible à déterminer.")
}

/* -------------------------------------------------------------------------- */
/*  2. Sélection du Product (détection de doublons)                            */
/* -------------------------------------------------------------------------- */

function hasDetailflowSubscriptionMeta(metadata: Stripe.Metadata | null | undefined, plan: BillingLicensePlan): boolean {
  return (
    metadata?.app === "detailflow" &&
    metadata?.billing_type === "subscription" &&
    metadata?.license_plan === plan
  )
}

/**
 * Choisit le Product correspondant à un plan parmi les résultats Stripe.
 *
 * - 0 correspondance → `null` (l'appelant créera le Product).
 * - 1 correspondance valide → ce Product.
 * - ≥ 2 correspondances → ERREUR : doublons à corriger manuellement (jamais de
 *   sélection arbitraire du premier).
 *
 * La correspondance est revalidée sur les métadonnées (app / billing_type /
 * license_plan) même si la recherche Stripe est censée déjà filtrer.
 */
export function selectProductForPlan(products: Stripe.Product[], plan: BillingLicensePlan): Stripe.Product | null {
  const matches = products.filter((p) => p.active === true && hasDetailflowSubscriptionMeta(p.metadata, plan))
  if (matches.length > 1) {
    throw new StripeSetupError(
      `Plusieurs Products Stripe actifs correspondent au plan « ${plan} » (${matches
        .map((m) => m.id)
        .join(", ")}). Corrigez manuellement les doublons avant de relancer.`,
    )
  }
  return matches[0] ?? null
}

/* -------------------------------------------------------------------------- */
/*  3. Validation d'un Price existant (fail-closed)                            */
/* -------------------------------------------------------------------------- */

export type ExpectedPriceShape = {
  currency: "eur"
  unitAmount: number
  interval: "month"
  lookupKey: string
  productId: string
  metadata: { app: "detailflow"; billing_type: "subscription"; license_plan: BillingLicensePlan }
}

/** Forme attendue d'un Price pour un plan payant (dérivée de la config Billing). */
export function expectedPriceShape(plan: BillingLicensePlan, productId: string): ExpectedPriceShape {
  const config = BILLING_PLANS[plan]
  if (!config.isPaid || config.interval !== "month" || !config.lookupKey) {
    throw new StripeSetupError(`Plan « ${plan} » n'attend aucun Price récurrent mensuel.`)
  }
  return {
    currency: config.currency,
    unitAmount: config.monthlyPriceCents,
    interval: config.interval,
    lookupKey: config.lookupKey,
    productId,
    metadata: { app: "detailflow", billing_type: "subscription", license_plan: plan },
  }
}

/**
 * Vérifie qu'un Price EXISTANT correspond EXACTEMENT à la configuration attendue.
 * En cas d'écart : on NE modifie rien, on NE crée pas de Price parallèle, on
 * STOPPE avec une erreur explicite listant les différences.
 */
export function assertPriceMatchesConfig(price: Stripe.Price, plan: BillingLicensePlan, productId: string): void {
  const expected = expectedPriceShape(plan, productId)
  const productRef = typeof price.product === "string" ? price.product : (price.product?.id ?? null)
  const problems: string[] = []

  if (price.active !== true) problems.push("price inactif")
  if (price.currency !== expected.currency) problems.push(`devise « ${price.currency} » ≠ « ${expected.currency} »`)
  if (price.unit_amount !== expected.unitAmount) {
    problems.push(`montant ${price.unit_amount ?? "aucun"} ≠ ${expected.unitAmount}`)
  }
  if (price.recurring?.interval !== expected.interval) {
    problems.push(`interval « ${price.recurring?.interval ?? "aucun"} » ≠ « ${expected.interval} »`)
  }
  if (productRef !== expected.productId) problems.push(`product « ${productRef ?? "aucun"} » ≠ « ${expected.productId} »`)
  if (price.lookup_key !== expected.lookupKey) {
    problems.push(`lookup_key « ${price.lookup_key ?? "aucun"} » ≠ « ${expected.lookupKey} »`)
  }
  if (price.metadata?.app !== "detailflow") problems.push("metadata.app ≠ detailflow")
  if (price.metadata?.billing_type !== "subscription") problems.push("metadata.billing_type ≠ subscription")
  if (price.metadata?.license_plan !== plan) problems.push(`metadata.license_plan ≠ ${plan}`)

  if (problems.length > 0) {
    throw new StripeSetupError(
      `Le Price Stripe existant ${expected.lookupKey} ne correspond pas à la configuration DetailFlow attendue : ${problems.join(" ; ")}.`,
    )
  }
}
