/**
 * DetailFlow — Configuration CENTRALE de l'offre Lifetime (LOT S2.5A).
 *
 * Fichier PUR : aucun import serveur, aucune DB, aucun appel Stripe.
 * Importable depuis le serveur, les tests et la migration (valeurs recopiées
 * dans le SQL et vérifiées par test pour éviter toute dérive).
 *
 * Rappels :
 *   - billingMode  = COMMENT le tenant paie (ici "lifetime").
 *   - licensePlan  = À QUOI il a droit (ici "BUSINESS" = périmètre Performance).
 *   - licenseGeneration (ex. LIFETIME_V1) est une génération HISTORIQUE du moteur
 *     de licences : elle ne sert JAMAIS à détecter un Lifetime commercial.
 *   - FOUNDER est un plan interne distinct : jamais converti, jamais compté.
 *
 * Les montants sont HT. Aucune TVA n'est modélisée dans ce lot.
 */

import type { BillingMode } from "./types"
import type { LicensePlan } from "../licensing/types"

/* ------------------------------ Invariants métier ------------------------- */

/** Plafond ABSOLU de licences Lifetime (garanti aussi côté DB par trigger). */
export const LIFETIME_MAX_LICENSES = 50

/** Droits fonctionnels d'un Lifetime : périmètre Performance, jamais ENTERPRISE. */
export const LIFETIME_LICENSE_PLAN: LicensePlan = "BUSINESS"

export const LIFETIME_BILLING_MODE: BillingMode = "lifetime"

/** 0 % de commission DetailFlow, posé EXPLICITEMENT à l'activation. */
export const LIFETIME_PLATFORM_FEE_BPS = 0

/** SMS de bienvenue (crédit réel branché avec le flux d'achat complet). */
export const LIFETIME_WELCOME_SMS = 20

/**
 * Durée de vie d'une réservation de slot (LOT S3A : 60 min). Elle DOIT rester
 * supérieure à la durée du Checkout Stripe pour laisser une marge de réception
 * du webhook après la fin du paiement.
 */
export const LIFETIME_RESERVATION_TTL_MINUTES = 60

/** Durée de vie d'une Checkout Session Stripe Lifetime (minimum Stripe : 30 min). */
export const LIFETIME_CHECKOUT_TTL_MINUTES = 30

export const LIFETIME_CURRENCY = "eur" as const

/**
 * Clé du verrou transactionnel PostgreSQL (pg_advisory_xact_lock(hashtext(...)))
 * sérialisant toute écriture consommant le stock. Recopiée à l'identique dans
 * scripts/lifetime-license-allocation-migration.sql (vérifié par test).
 */
export const LIFETIME_INVENTORY_LOCK_KEY = "detailflow:lifetime_license_inventory"

/* ------------------------------ Plans de paiement ------------------------- */

export const LIFETIME_PAYMENT_PLAN_TYPES = ["single", "split_2x"] as const
export type LifetimePaymentPlanType = (typeof LIFETIME_PAYMENT_PLAN_TYPES)[number]

export interface LifetimePaymentPlan {
  type: LifetimePaymentPlanType
  installmentCount: number
  installmentAmountCents: number
  totalCents: number
}

/** Montants HT en centimes. Le mécanisme Stripe du 2 × 690 € est hors lot. */
export const LIFETIME_PAYMENT_PLANS: Readonly<Record<LifetimePaymentPlanType, LifetimePaymentPlan>> =
  Object.freeze({
    single: Object.freeze({
      type: "single",
      installmentCount: 1,
      installmentAmountCents: 129000,
      totalCents: 129000,
    }),
    split_2x: Object.freeze({
      type: "split_2x",
      installmentCount: 2,
      installmentAmountCents: 69000,
      totalCents: 138000,
    }),
  })

/* ---------------------------------- Statuts ------------------------------- */

export const LIFETIME_ALLOCATION_STATUSES = ["RESERVED", "ACTIVE", "RELEASED"] as const
export type LifetimeAllocationStatus = (typeof LIFETIME_ALLOCATION_STATUSES)[number]

/* ---------------------------------- Erreurs ------------------------------- */

export type LifetimeErrorCode =
  | "INVALID_PAYMENT_PLAN"
  | "INVALID_COMPANY_ID"
  | "COMPANY_NOT_FOUND"
  | "SOLD_OUT"
  | "ALREADY_ALLOCATED"
  | "ALREADY_LIFETIME"
  | "SUBSCRIPTION_CONVERSION_UNSUPPORTED"
  | "FOUNDER_NOT_ELIGIBLE"
  | "ALLOCATION_NOT_FOUND"
  | "RESERVATION_EXPIRED"
  | "RESERVATION_RELEASED"
  | "ACTIVE_NOT_RELEASABLE"
  | "CHECKOUT_SESSION_MISMATCH"
  | "CHECKOUT_ATTACH_FAILED"

export class LifetimeError extends Error {
  constructor(
    readonly code: LifetimeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "LifetimeError"
  }
}

export const SUBSCRIPTION_CONVERSION_UNSUPPORTED_MESSAGE =
  "Conversion abonnement → Lifetime non prise en charge dans ce lot."

/* -------------------------------- Validateurs ----------------------------- */

export function isLifetimePaymentPlanType(value: unknown): value is LifetimePaymentPlanType {
  return typeof value === "string" && (LIFETIME_PAYMENT_PLAN_TYPES as readonly string[]).includes(value)
}

/** Fail closed : toute valeur hors { single, split_2x } est rejetée. */
export function parseLifetimePaymentPlan(value: unknown): LifetimePaymentPlan {
  if (!isLifetimePaymentPlanType(value)) {
    throw new LifetimeError("INVALID_PAYMENT_PLAN", "Plan de paiement Lifetime inconnu.")
  }
  return LIFETIME_PAYMENT_PLANS[value]
}

export function assertValidCompanyId(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new LifetimeError("INVALID_COMPANY_ID", "Identifiant d'entreprise invalide.")
  }
}

/* --------------------------------- Éligibilité ---------------------------- */

/** Sous-ensemble des colonnes `companies` nécessaires à la décision. */
export interface LifetimeEligibilityInput {
  billingMode: string | null
  licensePlan: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
}

/**
 * Décide si une entreprise peut réserver/activer un Lifetime. Fail closed.
 * `stripeCustomerId` n'est volontairement PAS consulté : un Customer peut
 * exister sans abonnement et ne prouve rien.
 */
export function assertCompanyEligibleForLifetime(company: LifetimeEligibilityInput): void {
  if (
    company.stripeSubscriptionId != null ||
    (company.subscriptionStatus != null && company.subscriptionStatus !== "") ||
    company.billingMode === "subscription"
  ) {
    throw new LifetimeError("SUBSCRIPTION_CONVERSION_UNSUPPORTED", SUBSCRIPTION_CONVERSION_UNSUPPORTED_MESSAGE)
  }
  if (company.licensePlan === "FOUNDER") {
    throw new LifetimeError("FOUNDER_NOT_ELIGIBLE", "Un tenant FOUNDER n'est pas converti en Lifetime commercial.")
  }
  if (company.billingMode === "lifetime") {
    throw new LifetimeError("ALREADY_LIFETIME", "Cette entreprise dispose déjà d'une licence Lifetime.")
  }
}

/* -------------------------------- Disponibilité --------------------------- */

export interface LifetimeAvailability {
  max: number
  active: number
  reserved: number
  used: number
  remaining: number
  soldOut: boolean
}

/** `reserved` = réservations RESERVED NON expirées uniquement. */
export function computeLifetimeAvailability(active: number, reserved: number): LifetimeAvailability {
  const used = active + reserved
  const remaining = Math.max(0, LIFETIME_MAX_LICENSES - used)
  return { max: LIFETIME_MAX_LICENSES, active, reserved, used, remaining, soldOut: remaining === 0 }
}
