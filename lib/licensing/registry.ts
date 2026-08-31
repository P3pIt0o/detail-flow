/**
 * Socle central des licences DetailFlow — REGISTRE & MATRICE.
 *
 * Fichier PUR (aucun prix, aucune logique commerciale, aucun accès DB). C'est
 * l'UNIQUE source de vérité des DROITS techniques. Les tarifs seront gérés dans
 * une couche commerciale/Stripe séparée (hors de ce moteur).
 */

import {
  type FeatureKey,
  type LimitKey,
  type LimitValue,
  type LicensePlan,
  type LicenseGeneration,
  FEATURE_KEYS,
} from "./types"

/* -------------------------- Registre des features ------------------------ */

export type FeatureDefinition = {
  key: FeatureKey
  label: string
  /**
   * Génération à laquelle appartient la fonctionnalité. FOUNDER + LIFETIME_V1
   * ouvre AUTOMATIQUEMENT toutes les features de cette génération : ajouter une
   * feature LIFETIME_V1 ici l'accorde à Founder sans liste fragile à maintenir.
   */
  generation: LicenseGeneration
}

export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  website: { key: "website", label: "Site vitrine", generation: "LIFETIME_V1" },
  online_booking: { key: "online_booking", label: "Réservation en ligne", generation: "LIFETIME_V1" },
  online_payments: { key: "online_payments", label: "Paiements en ligne", generation: "LIFETIME_V1" },
  sms: { key: "sms", label: "Module SMS", generation: "LIFETIME_V1" },
  automations: { key: "automations", label: "Automatisations avancées", generation: "LIFETIME_V1" },
  // LOT D — rappels RDV pro par email + demande d'avis Google après prestation.
  email_reminders: { key: "email_reminders", label: "Rappels de rendez-vous", generation: "LIFETIME_V1" },
  review_requests: { key: "review_requests", label: "Demandes d'avis Google", generation: "LIFETIME_V1" },
  business_stats: { key: "business_stats", label: "Statistiques métier", generation: "LIFETIME_V1" },
  expense_management: { key: "expense_management", label: "Gestion des dépenses", generation: "LIFETIME_V1" },
  profitability_analysis: {
    key: "profitability_analysis",
    label: "Analyse de rentabilité",
    generation: "LIFETIME_V1",
  },
  advanced_reporting: { key: "advanced_reporting", label: "Reporting avancé", generation: "LIFETIME_V1" },
  marketing: { key: "marketing", label: "Marketing & fidélisation", generation: "LIFETIME_V1" },
  early_access: { key: "early_access", label: "Accès anticipé", generation: "LIFETIME_V1" },
}

/* -------------------------- Registre des limites ------------------------- */

export type LimitDefinition = { key: LimitKey; label: string }

export const LIMIT_REGISTRY: Record<LimitKey, LimitDefinition> = {
  maxCustomers: { key: "maxCustomers", label: "Clients" },
  maxVehicles: { key: "maxVehicles", label: "Véhicules" },
  maxQuotesPerMonth: { key: "maxQuotesPerMonth", label: "Devis / mois" },
  maxInvoicesPerMonth: { key: "maxInvoicesPerMonth", label: "Factures / mois" },
}

/* ----------------------------- Métadonnées plan -------------------------- */

export type PlanMeta = {
  label: string
  generation: LicenseGeneration
  /** Réservé à l'usage interne (jamais proposé publiquement). FOUNDER = true. */
  internalOnly: boolean
  /**
   * Commercialisable publiquement DÈS MAINTENANT. BUSINESS = false
   * (« coming soon » tant que ses fonctions premium ne sont pas opérationnelles),
   * FOUNDER = false (interne). Aucune UI/pricing n'est créée dans cette étape ;
   * ce drapeau prépare seulement le futur choix public.
   */
  purchasable: boolean
}

export const PLAN_META: Record<LicensePlan, PlanMeta> = {
  FREE: { label: "Free", generation: "LIFETIME_V1", internalOnly: false, purchasable: true },
  ESSENTIAL: { label: "Essential", generation: "LIFETIME_V1", internalOnly: false, purchasable: true },
  PRO: { label: "Pro", generation: "LIFETIME_V1", internalOnly: false, purchasable: true },
  // Existe techniquement mais NON commercialisable tant que premium pas prêt.
  BUSINESS: { label: "Business", generation: "LIFETIME_V1", internalOnly: false, purchasable: false },
  // Attribuable UNIQUEMENT par le super-admin. Jamais public.
  FOUNDER: { label: "Founder", generation: "LIFETIME_V1", internalOnly: true, purchasable: false },
}

/* ------------------------------- Matrice --------------------------------- */

export type PlanEntitlements = {
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, LimitValue>
}

/** Toutes les features à `false` (base commune, évite les oublis). */
function noFeatures(): Record<FeatureKey, boolean> {
  return FEATURE_KEYS.reduce(
    (acc, k) => {
      acc[k] = false
      return acc
    },
    {} as Record<FeatureKey, boolean>,
  )
}

/** Toutes les features à `true` (utilisé pour dériver FOUNDER). */
function allFeatures(): Record<FeatureKey, boolean> {
  return FEATURE_KEYS.reduce(
    (acc, k) => {
      acc[k] = true
      return acc
    },
    {} as Record<FeatureKey, boolean>,
  )
}

/**
 * FOUNDER dérivé du registre : toutes les features appartenant à sa génération
 * (LIFETIME_V1) sont accordées. Comme 100 % des features sont LIFETIME_V1
 * aujourd'hui, cela équivaut à tout activer — mais reste automatique si une
 * feature d'une autre génération est ajoutée plus tard.
 */
function founderFeatures(): Record<FeatureKey, boolean> {
  const gen = PLAN_META.FOUNDER.generation
  return FEATURE_KEYS.reduce(
    (acc, k) => {
      acc[k] = FEATURE_REGISTRY[k].generation === gen
      return acc
    },
    {} as Record<FeatureKey, boolean>,
  )
}

export const PLAN_MATRIX: Record<LicensePlan, PlanEntitlements> = {
  FREE: {
    features: { ...noFeatures() },
    limits: { maxCustomers: 10, maxVehicles: 10, maxQuotesPerMonth: 3, maxInvoicesPerMonth: 3 },
  },
  ESSENTIAL: {
    features: {
      ...noFeatures(),
      business_stats: true,
      expense_management: true,
    },
    limits: { maxCustomers: null, maxVehicles: null, maxQuotesPerMonth: null, maxInvoicesPerMonth: null },
  },
  PRO: {
    features: {
      ...noFeatures(),
      website: true,
      online_booking: true,
      online_payments: true,
      business_stats: true,
      expense_management: true,
      profitability_analysis: true,
      // LOT D — inclus dans Pro (validé). Business (allFeatures) et Founder
      // (founderFeatures) les obtiennent automatiquement ; Essential/Free non.
      email_reminders: true,
      review_requests: true,
    },
    limits: { maxCustomers: null, maxVehicles: null, maxQuotesPerMonth: null, maxInvoicesPerMonth: null },
  },
  BUSINESS: {
    features: {
      ...allFeatures(),
      // Business a toutes les features premium SAUF l'accès anticipé (Founder).
      early_access: false,
    },
    limits: { maxCustomers: null, maxVehicles: null, maxQuotesPerMonth: null, maxInvoicesPerMonth: null },
  },
  FOUNDER: {
    features: founderFeatures(),
    limits: { maxCustomers: null, maxVehicles: null, maxQuotesPerMonth: null, maxInvoicesPerMonth: null },
  },
}

/** Droit BRUT d'un plan pour une feature (avant override). */
export function planFeature(plan: LicensePlan, key: FeatureKey): boolean {
  return PLAN_MATRIX[plan].features[key] ?? false
}

/** Limite BRUTE d'un plan (null = illimité). */
export function planLimit(plan: LicensePlan, key: LimitKey): LimitValue {
  return PLAN_MATRIX[plan].limits[key] ?? null
}
