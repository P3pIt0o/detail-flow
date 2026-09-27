/**
 * DetailFlow — Fonctions PURES du setup Stripe Lifetime (LOT S2.5B).
 *
 * Aucun appel réseau, rien n'est exécuté au chargement. Ce module décrit le
 * Product et les deux Prices ONE-TIME Lifetime et fournit les validateurs
 * FAIL-CLOSED utilisés par `scripts/setup-stripe-lifetime-product.ts`.
 *
 * Source de vérité des montants : `lib/billing/lifetime.ts` (jamais les
 * chaînes marketing « 1 290 € HT » / « 2 × 690 € HT »).
 *
 * Aucune TVA : pas de Stripe Tax, pas de Tax Rate, pas de tax_behavior.
 */

import type Stripe from "stripe"
import { isValidStripePriceId } from "@/lib/billing/config"
import { LIFETIME_CURRENCY, LIFETIME_PAYMENT_PLANS, type LifetimePaymentPlanType } from "@/lib/billing/lifetime"
import { StripeSetupError, type StripeMode } from "@/lib/billing/stripe-setup"

/* -------------------------------------------------------------------------- */
/*  Spécification Product                                                      */
/* -------------------------------------------------------------------------- */

export const LIFETIME_STRIPE_PRODUCT = Object.freeze({
  name: "DetailFlow Lifetime",
  description: "Licence d’utilisation à vie DetailFlow — offre limitée.",
  metadata: Object.freeze({ app: "detailflow", billing_type: "lifetime", offer: "lifetime" }),
})

/* -------------------------------------------------------------------------- */
/*  Spécification Prices (ONE-TIME)                                            */
/* -------------------------------------------------------------------------- */

export type LifetimePriceKind = "single" | "installment"

export interface LifetimePriceSpec {
  kind: LifetimePriceKind
  lookupKey: string
  envName: string
  currency: typeof LIFETIME_CURRENCY
  unitAmount: number
  metadata: {
    app: "detailflow"
    billing_type: "lifetime"
    payment_plan: LifetimePaymentPlanType
    installment_count: string
  }
}

export const LIFETIME_STRIPE_PRICES: Readonly<Record<LifetimePriceKind, LifetimePriceSpec>> = Object.freeze({
  single: Object.freeze({
    kind: "single",
    lookupKey: "detailflow_lifetime_single",
    envName: "STRIPE_PRICE_LIFETIME_SINGLE",
    currency: LIFETIME_CURRENCY,
    unitAmount: LIFETIME_PAYMENT_PLANS.single.totalCents,
    metadata: Object.freeze({
      app: "detailflow",
      billing_type: "lifetime",
      payment_plan: "single",
      installment_count: String(LIFETIME_PAYMENT_PLANS.single.installmentCount),
    }),
  }),
  // UNE échéance du 2 × 690 € (jamais un Price de 138000).
  installment: Object.freeze({
    kind: "installment",
    lookupKey: "detailflow_lifetime_installment",
    envName: "STRIPE_PRICE_LIFETIME_INSTALLMENT",
    currency: LIFETIME_CURRENCY,
    unitAmount: LIFETIME_PAYMENT_PLANS.split_2x.installmentAmountCents,
    metadata: Object.freeze({
      app: "detailflow",
      billing_type: "lifetime",
      payment_plan: "split_2x",
      installment_count: String(LIFETIME_PAYMENT_PLANS.split_2x.installmentCount),
    }),
  }),
})

export const LIFETIME_PRICE_KINDS: readonly LifetimePriceKind[] = ["single", "installment"]

/* -------------------------------------------------------------------------- */
/*  Protection LIVE                                                            */
/* -------------------------------------------------------------------------- */

/** LIVE exige `--confirm-live` ; TEST toujours autorisé. */
export function assertStripeModeAllowed(mode: StripeMode, argv: readonly string[]): void {
  if (mode === "LIVE" && !argv.includes("--confirm-live")) {
    throw new StripeSetupError(
      "Refus : clé LIVE détectée sans --confirm-live. Relancez avec --confirm-live pour créer en production.",
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Product : sélection + validation                                           */
/* -------------------------------------------------------------------------- */

function hasLifetimeProductMeta(metadata: Stripe.Metadata | null | undefined): boolean {
  const expected = LIFETIME_STRIPE_PRODUCT.metadata
  return (
    metadata?.app === expected.app &&
    metadata?.billing_type === expected.billing_type &&
    metadata?.offer === expected.offer
  )
}

/**
 * 0 correspondance → null (création) ; 1 → validée puis réutilisée ;
 * ≥ 2 → STOP (jamais de sélection arbitraire).
 */
export function selectLifetimeProduct(products: Stripe.Product[]): Stripe.Product | null {
  const matches = products.filter((p) => p.active === true && hasLifetimeProductMeta(p.metadata))
  if (matches.length > 1) {
    throw new StripeSetupError(
      `Plusieurs Products Stripe Lifetime actifs détectés (${matches
        .map((m) => m.id)
        .join(", ")}). Corrigez manuellement les doublons avant de relancer.`,
    )
  }
  const product = matches[0] ?? null
  if (product) assertLifetimeProductValid(product)
  return product
}

/** Ne modifie jamais un Product incohérent : STOP explicite. */
export function assertLifetimeProductValid(product: Stripe.Product): void {
  const problems: string[] = []
  if (product.active !== true) problems.push("product inactif")
  if (!hasLifetimeProductMeta(product.metadata)) problems.push("metadata app/billing_type/offer incorrectes")
  if (product.name !== LIFETIME_STRIPE_PRODUCT.name) {
    problems.push(`nom « ${product.name} » ≠ « ${LIFETIME_STRIPE_PRODUCT.name} »`)
  }
  if (problems.length > 0) {
    throw new StripeSetupError(
      `Le Product Stripe Lifetime existant ${product.id} ne correspond pas à la configuration DetailFlow attendue : ${problems.join(" ; ")}.`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Price : validation stricte                                                 */
/* -------------------------------------------------------------------------- */

export function assertLifetimePriceMatches(price: Stripe.Price, kind: LifetimePriceKind, productId: string): void {
  const spec = LIFETIME_STRIPE_PRICES[kind]
  const productRef = typeof price.product === "string" ? price.product : (price.product?.id ?? null)
  const problems: string[] = []

  if (price.active !== true) problems.push("price inactif")
  if (price.currency !== spec.currency) problems.push(`devise « ${price.currency} » ≠ « ${spec.currency} »`)
  if (price.unit_amount !== spec.unitAmount) {
    problems.push(`montant ${price.unit_amount ?? "aucun"} ≠ ${spec.unitAmount}`)
  }
  if (price.type !== "one_time" || price.recurring != null) problems.push("price non one-time (recurring)")
  if (productRef !== productId) problems.push(`product « ${productRef ?? "aucun"} » ≠ « ${productId} »`)
  if (price.lookup_key !== spec.lookupKey) {
    problems.push(`lookup_key « ${price.lookup_key ?? "aucun"} » ≠ « ${spec.lookupKey} »`)
  }
  for (const [key, value] of Object.entries(spec.metadata)) {
    if (price.metadata?.[key] !== value) problems.push(`metadata.${key} ≠ ${value}`)
  }

  if (problems.length > 0) {
    throw new StripeSetupError(
      `Le Price Stripe existant ${spec.lookupKey} ne correspond pas à la configuration DetailFlow attendue : ${problems.join(" ; ")}.`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Env Price IDs optionnels                                                   */
/* -------------------------------------------------------------------------- */

export type LifetimeEnvPriceIds = Record<LifetimePriceKind, string | null>

/**
 * Lit les Price IDs optionnels. Vide/absent → null. Présent mais pas `price_…`
 * → STOP. Deux variables identiques → STOP.
 */
export function readLifetimeEnvPriceIds(env: Record<string, string | undefined>): LifetimeEnvPriceIds {
  const result = {} as LifetimeEnvPriceIds
  for (const kind of LIFETIME_PRICE_KINDS) {
    const { envName } = LIFETIME_STRIPE_PRICES[kind]
    const raw = env[envName]?.trim() ?? ""
    if (raw === "") {
      result[kind] = null
      continue
    }
    if (!isValidStripePriceId(raw)) {
      throw new StripeSetupError(`${envName} doit être un Price ID Stripe (format « price_… »).`)
    }
    result[kind] = raw
  }
  if (result.single && result.installment && result.single === result.installment) {
    throw new StripeSetupError(
      "STRIPE_PRICE_LIFETIME_SINGLE et STRIPE_PRICE_LIFETIME_INSTALLMENT désignent le même Price ID.",
    )
  }
  return result
}

/** Un Price ID configuré doit être exactement celui porté par le lookup_key. */
export function assertEnvPriceIdConsistent(kind: LifetimePriceKind, envId: string | null, foundId: string | null): void {
  if (envId && foundId && envId !== foundId) {
    const spec = LIFETIME_STRIPE_PRICES[kind]
    throw new StripeSetupError(
      `${spec.envName} (${envId}) ne correspond pas au Price portant le lookup_key ${spec.lookupKey} (${foundId}).`,
    )
  }
}
