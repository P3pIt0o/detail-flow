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

/* ========================================================================= */
/*  COMMENT AJOUTER UNE FONCTIONNALITÉ PREMIUM DetailFlow                     */
/* ========================================================================= */
/*
 *  Toute nouvelle fonctionnalité premium DOIT suivre ce workflow, dans CET
 *  ordre, et de préférence dans une seule et même PR :
 *
 *    A. FeatureKey  — ajouter la clé dans FEATURE_KEYS (lib/licensing/types.ts).
 *    B. Registry    — l'enregistrer dans FEATURE_REGISTRY (ci-dessous).
 *    C. Matrix      — décider EXPLICITEMENT, plan par plan, dans PLAN_MATRIX :
 *                     FREE ? ESSENTIAL ? PRO ? BUSINESS ? ENTERPRISE ?
 *                     (FOUNDER est dérivé automatiquement de sa génération.)
 *    D. Server guard— vérifier côté serveur avec canUseFeature(companyId, key)
 *                     — JAMAIS `if (plan === "PRO")` dans une action métier.
 *    E. UI          — masquer / adapter l'interface (défense en profondeur,
 *                     jamais l'unique protection).
 *    F. Tests       — couvrir droits + non-régression des autres plans.
 *    G. Marketing   — SEULEMENT ensuite, refléter l'offre dans lib/pricing.
 *
 *  RÈGLE ABSOLUE : le marketing n'est JAMAIS la source de vérité des droits.
 *  Aucun plan ne dérive de « toutes les features » : ajouter une FeatureKey
 *  n'accorde AUCUN droit tant qu'une décision explicite n'est pas prise en (C).
 *  Pour déplacer une feature d'une offre à une autre, on modifie UNIQUEMENT
 *  PLAN_MATRIX — jamais les Server Actions, l'UI ou la base métier.
 */

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
  // LOT 2 — CRM prospects (leads).
  leads_crm: { key: "leads_crm", label: "CRM prospects", generation: "LIFETIME_V1" },
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
  // Plan technique de l'offre commerciale « Entreprise » (49,90 €/mois, prix
  // géré dans lib/pricing). Publiquement présenté (internalOnly: false) mais
  // PAS encore achetable en self-service (purchasable: false) : passera à true
  // quand équipe/agendas/permissions/checkout seront livrés.
  ENTERPRISE: { label: "Enterprise", generation: "LIFETIME_V1", internalOnly: false, purchasable: false },
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

/** Active EXPLICITEMENT une liste de features (toutes les autres à `false`). */
function featuresFrom(keys: readonly FeatureKey[]): Record<FeatureKey, boolean> {
  const base = noFeatures()
  for (const k of keys) base[k] = true
  return base
}

/**
 * Droits EXPLICITES de BUSINESS (offre commerciale « Ultime »).
 *
 * IMPORTANT : liste volontairement EXHAUSTIVE. BUSINESS ne dérive PLUS de
 * `allFeatures()` : l'ajout d'une future FeatureKey (ex. team_management)
 * n'est donc JAMAIS accordé automatiquement à BUSINESS. Chaque nouvelle
 * feature exige une décision explicite plan par plan (cf. en-tête du fichier).
 *
 * Contenu = droits ACTUELS de BUSINESS préservés à l'identique : toutes les
 * features premium SAUF `early_access` (réservé à FOUNDER).
 */
export const BUSINESS_FEATURES: readonly FeatureKey[] = [
  "website",
  "online_booking",
  "online_payments",
  "sms",
  "automations",
  "email_reminders",
  "review_requests",
  "business_stats",
  "expense_management",
  "profitability_analysis",
  "advanced_reporting",
  "marketing",
  // LOT 2 — CRM prospects : fonctionnalité de l'offre « Ultime » (BUSINESS).
  "leads_crm",
]

/**
 * Droits EXPLICITES d'ENTERPRISE (offre commerciale « Entreprise »).
 *
 * ENTERPRISE hérite LOGIQUEMENT de tout BUSINESS, puis accueillera les futures
 * fonctionnalités d'équipe (team_management, employee_scheduling,
 * simultaneous_bookings, role_permissions…) AU MOMENT où chaque module sera
 * réellement développé — pas avant (aucune fausse feature visible). Comme
 * BUSINESS, il ne dérive PAS de `allFeatures()`.
 */
export const ENTERPRISE_FEATURES: readonly FeatureKey[] = [
  ...BUSINESS_FEATURES,
  // + futures features Entreprise, ajoutées avec leur module (décision explicite).
]

/** Composition PURE des droits BUSINESS. */
function businessFeatures(): Record<FeatureKey, boolean> {
  return featuresFrom(BUSINESS_FEATURES)
}

/** Composition PURE des droits ENTERPRISE (BUSINESS + futures features équipe). */
function enterpriseFeatures(): Record<FeatureKey, boolean> {
  return featuresFrom(ENTERPRISE_FEATURES)
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
    // Composition EXPLICITE (plus de allFeatures) : droits actuels préservés,
    // aucune future FeatureKey accordée automatiquement.
    features: businessFeatures(),
    limits: { maxCustomers: null, maxVehicles: null, maxQuotesPerMonth: null, maxInvoicesPerMonth: null },
  },
  ENTERPRISE: {
    // BUSINESS + futures features équipe (composition explicite, extensible).
    features: enterpriseFeatures(),
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
