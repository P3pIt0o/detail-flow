/**
 * DetailFlow — Couche de configuration STRIPE BILLING (abonnements mensuels).
 *
 * RÔLE : faire le lien, en un seul endroit, entre :
 *   - le plan technique de licence (`LicensePlan`)  — À QUOI le tenant a droit
 *   - le nom commercial public                       — ce que voit le client
 *   - le prix mensuel (en centimes)                  — montant facturé
 *   - le nom de la variable d'environnement Stripe   — où lire le Price ID réel
 *   - gratuit vs payant                              — présence d'un abonnement
 *
 * IMPORTANT — séparations strictes :
 *   1. `billingMode` (COMMENT on paie) ≠ `licensePlan` (À QUOI on a droit).
 *      Ce fichier ne dérive JAMAIS l'un depuis l'autre.
 *   2. Stripe BILLING (abonnement du detailer à DetailFlow) ≠ Stripe CONNECT
 *      (paiements encaissés par le detailer auprès de ses clients).
 *      Ce fichier ne référence AUCUNE donnée Connect (stripeAccountId,
 *      application_fee_amount, commissions…). Ne rien importer de lib/payments.
 *
 * CE FICHIER NE FAIT AUCUN APPEL STRIPE. Il ne lit que des noms de variables et,
 * pour les resolvers d'exécution, la valeur `price_...` déjà présente dans
 * l'environnement serveur. Les Price IDs réels ne sont jamais codés en dur.
 *
 * Fichier PUR (aucun import serveur/DB) : importable par les tests, le futur
 * Checkout (S2.x) et le futur webhook Billing. Les Price IDs proviennent de
 * variables NON `NEXT_PUBLIC_*` : ils ne sont donc jamais exposés au client.
 */

import type { LicensePlan } from "@/lib/licensing/types"

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** Seuls ces plans techniques ont une configuration commerciale d'abonnement. */
export type BillingLicensePlan = Extract<LicensePlan, "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE">

/** Intervalle de facturation récurrent. Un seul supporté en S2 : mensuel. */
export type BillingInterval = "month"

export type BillingPlanConfig = {
  /** Plan technique du moteur de licences. */
  readonly licensePlan: BillingLicensePlan
  /** Nom commercial public affiché au client. */
  readonly commercialName: string
  /** Prix mensuel en centimes d'euro (0 pour le plan gratuit). */
  readonly monthlyPriceCents: number
  /** Devise ISO (minuscule, format attendu par Stripe). */
  readonly currency: "eur"
  /** Intervalle récurrent, ou `null` pour le plan gratuit (aucun abonnement). */
  readonly interval: BillingInterval | null
  /**
   * Nom de la variable d'environnement contenant le Price ID Stripe
   * (`price_...`). `null` pour le plan gratuit (aucun Price récurrent).
   * On stocke le NOM de la variable, jamais la valeur — voir resolvers.
   */
  readonly stripePriceEnv: string | null
  /**
   * `lookup_key` Stripe stable, utilisé par le script de setup pour retrouver
   * un Price existant et rester idempotent. `null` pour le plan gratuit.
   */
  readonly lookupKey: string | null
  /** `true` si le plan implique un abonnement Stripe payant. */
  readonly isPaid: boolean
}

/* -------------------------------------------------------------------------- */
/*  Noms de variables d'environnement (source unique)                         */
/* -------------------------------------------------------------------------- */

export const STRIPE_PRICE_ENV = {
  PRO: "STRIPE_PRICE_INDEPENDANT_MONTHLY",
  BUSINESS: "STRIPE_PRICE_PERFORMANCE_MONTHLY",
  ENTERPRISE: "STRIPE_PRICE_EQUIPE_MONTHLY",
} as const

/** Toutes les variables d'env Price requises pour les abonnements payants. */
export const REQUIRED_STRIPE_PRICE_ENVS: readonly string[] = [
  STRIPE_PRICE_ENV.PRO,
  STRIPE_PRICE_ENV.BUSINESS,
  STRIPE_PRICE_ENV.ENTERPRISE,
] as const

/* -------------------------------------------------------------------------- */
/*  Configuration commerciale (source de vérité Billing)                      */
/* -------------------------------------------------------------------------- */

/**
 * Mapping LicensePlan → configuration d'abonnement Stripe Billing.
 *
 * NB : les plans `ESSENTIAL` et `FOUNDER` du moteur de licences ne font PAS
 * partie de la grille d'abonnement mensuel et n'ont donc pas d'entrée ici.
 * `getBillingPlanConfig` renvoie `null` pour eux (aucun fallback silencieux).
 */
export const BILLING_PLANS: Readonly<Record<BillingLicensePlan, BillingPlanConfig>> = {
  FREE: {
    licensePlan: "FREE",
    commercialName: "Essentiel",
    monthlyPriceCents: 0,
    currency: "eur",
    interval: null,
    stripePriceEnv: null,
    lookupKey: null,
    isPaid: false,
  },
  PRO: {
    licensePlan: "PRO",
    commercialName: "Indépendant",
    monthlyPriceCents: 1990,
    currency: "eur",
    interval: "month",
    stripePriceEnv: STRIPE_PRICE_ENV.PRO,
    lookupKey: "detailflow_independant_monthly",
    isPaid: true,
  },
  BUSINESS: {
    licensePlan: "BUSINESS",
    commercialName: "Performance",
    monthlyPriceCents: 3490,
    currency: "eur",
    interval: "month",
    stripePriceEnv: STRIPE_PRICE_ENV.BUSINESS,
    lookupKey: "detailflow_performance_monthly",
    isPaid: true,
  },
  ENTERPRISE: {
    licensePlan: "ENTERPRISE",
    commercialName: "Équipe",
    monthlyPriceCents: 5990,
    currency: "eur",
    interval: "month",
    stripePriceEnv: STRIPE_PRICE_ENV.ENTERPRISE,
    lookupKey: "detailflow_equipe_monthly",
    isPaid: true,
  },
} as const

/** Les seuls plans payants nécessitant un Product/Price Stripe (ordre stable). */
export const PAID_BILLING_PLANS: readonly BillingLicensePlan[] = ["PRO", "BUSINESS", "ENTERPRISE"] as const

/* -------------------------------------------------------------------------- */
/*  Helpers purs (aucun accès environnement)                                  */
/* -------------------------------------------------------------------------- */

export function isBillingLicensePlan(plan: unknown): plan is BillingLicensePlan {
  return plan === "FREE" || plan === "PRO" || plan === "BUSINESS" || plan === "ENTERPRISE"
}

/**
 * Configuration Billing d'un plan, ou `null` si le plan n'a pas d'abonnement
 * modélisé (ESSENTIAL, FOUNDER, ou valeur inconnue). JAMAIS d'exception ni de
 * fallback : l'appelant décide explicitement quoi faire d'un `null`.
 */
export function getBillingPlanConfig(plan: LicensePlan): BillingPlanConfig | null {
  return isBillingLicensePlan(plan) ? BILLING_PLANS[plan] : null
}

/** Nom de la variable d'env Price d'un plan (pur), ou `null` si gratuit/inconnu. */
export function getStripePriceEnvForPlan(plan: LicensePlan): string | null {
  return getBillingPlanConfig(plan)?.stripePriceEnv ?? null
}

/* -------------------------------------------------------------------------- */
/*  Resolvers d'exécution (lecture de l'environnement serveur)                */
/* -------------------------------------------------------------------------- */
/*
 * Ces fonctions lisent des Price IDs (`price_...`) depuis process.env. Elles
 * ne sont appelées que côté serveur (Checkout / webhook des lots suivants) et
 * ne renvoient jamais de valeur par défaut : une configuration incomplète ou
 * un identifiant inconnu lève une erreur explicite. Le navigateur ne décide
 * JAMAIS d'un plan, d'un montant ou d'un Price ID.
 */

type EnvLike = Record<string, string | undefined>

function readEnv(env: EnvLike, name: string): string | null {
  const value = env[name]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

/**
 * Erreur dédiée aux problèmes de configuration Billing (variable manquante,
 * plan/price inconnu). Permet aux appelants futurs de la distinguer clairement.
 */
export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingConfigError"
  }
}

/**
 * PLAN → PRICE ID. Résout le Price ID Stripe d'un plan PAYANT.
 *
 * - FREE (ou plan sans abonnement) → erreur : aucun Price attendu, jamais de
 *   fallback vers un Price arbitraire.
 * - Variable d'environnement absente → erreur explicite (jamais silencieux).
 */
export function resolveStripePriceIdForPlan(plan: LicensePlan, env: EnvLike = process.env): string {
  const config = getBillingPlanConfig(plan)
  if (!config) {
    throw new BillingConfigError(`Plan « ${plan} » sans configuration d'abonnement : aucun Price Stripe.`)
  }
  if (!config.isPaid || !config.stripePriceEnv) {
    throw new BillingConfigError(
      `Plan « ${plan} » (${config.commercialName}) est gratuit : aucun Price Stripe à résoudre.`,
    )
  }
  const priceId = readEnv(env, config.stripePriceEnv)
  if (!priceId) {
    throw new BillingConfigError(
      `Variable d'environnement « ${config.stripePriceEnv} » manquante pour le plan « ${plan} » (${config.commercialName}).`,
    )
  }
  return priceId
}

/**
 * PRICE ID → PLAN (resolver inverse, utilisé plus tard par le webhook Billing).
 *
 * Construit la table inverse à partir des variables d'environnement présentes
 * puis résout le plan. Un Price ID inconnu → erreur explicite. JAMAIS de plan
 * par défaut (ni FREE, ni BUSINESS).
 */
export function resolvePlanForStripePriceId(priceId: string, env: EnvLike = process.env): BillingLicensePlan {
  const normalized = typeof priceId === "string" ? priceId.trim() : ""
  if (!normalized) {
    throw new BillingConfigError("Price ID vide : impossible de résoudre un plan.")
  }
  for (const plan of PAID_BILLING_PLANS) {
    const envName = BILLING_PLANS[plan].stripePriceEnv
    if (envName && readEnv(env, envName) === normalized) {
      return plan
    }
  }
  throw new BillingConfigError(`Price ID « ${normalized} » inconnu : aucun plan DetailFlow correspondant.`)
}

/**
 * Validation stricte au démarrage d'un flux Billing : toutes les variables
 * Price payantes doivent être présentes. Lève une erreur listant les manquantes
 * (jamais de démarrage partiel silencieux). N'est PAS appelée au chargement de
 * l'app : uniquement à l'entrée d'un flux qui en dépend (Checkout, futurs lots).
 */
export function assertBillingPricesConfigured(env: EnvLike = process.env): void {
  const missing = REQUIRED_STRIPE_PRICE_ENVS.filter((name) => readEnv(env, name) === null)
  if (missing.length > 0) {
    throw new BillingConfigError(`Configuration Stripe Billing incomplète — variables manquantes : ${missing.join(", ")}.`)
  }
}
