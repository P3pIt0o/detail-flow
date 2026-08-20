/**
 * Socle central des licences DetailFlow — RESOLVER PUR.
 *
 * Fonctions PURES et déterministes (aucun accès DB) : elles reçoivent l'état
 * déjà chargé (plan, génération, overrides, `now`) et calculent le droit
 * effectif. Cela les rend trivialement testables et réutilisables côté serveur.
 *
 * Ordre de résolution d'une feature :
 *   plan → droit du plan → override éventuel → expiration éventuelle → effectif
 *
 * FAIL CLOSED : pour une entreprise ayant une licence EXPLICITE, un plan inconnu
 * ou une donnée invalide ne donne jamais un droit premium (retour `false`).
 * La compatibilité des tenants historiques (licence absente) est gérée à part,
 * de façon explicite et isolée, via `resolveLegacyEntitlements`.
 */

import {
  type FeatureKey,
  type LimitKey,
  type LimitValue,
  type LicensePlan,
  type LicenseGeneration,
  type StoredOverrideState,
  type OverrideSource,
  isLicensePlan,
  FEATURE_KEYS,
  LIMIT_KEYS,
} from "./types"
import { planFeature, planLimit } from "./registry"

/** Override tel que résolu depuis la base (INHERIT = absence de ligne). */
export type ResolvedOverride = {
  featureKey: FeatureKey
  state: StoredOverrideState
  source: OverrideSource
  expiresAt: Date | null
}

/** Entrée du resolver : état déjà chargé pour UNE entreprise. */
export type LicenseContext = {
  /** `null` = tenant historique sans licence explicite (LEGACY). */
  plan: LicensePlan | null
  generation: LicenseGeneration | null
  overrides: ResolvedOverride[]
}

/** Un override est actif s'il n'a pas de date d'expiration OU si elle est future. */
export function isOverrideActive(o: ResolvedOverride, now: Date): boolean {
  return o.expiresAt == null || o.expiresAt.getTime() > now.getTime()
}

/** Droit effectif d'UNE feature pour un plan explicite (jamais LEGACY ici). */
export function resolveFeatureForPlan(
  plan: LicensePlan,
  key: FeatureKey,
  overrides: ResolvedOverride[],
  now: Date,
): boolean {
  const base = planFeature(plan, key)
  const override = overrides.find((o) => o.featureKey === key)
  // Override absent OU expiré => on retombe sur le droit du plan (INHERIT).
  if (!override || !isOverrideActive(override, now)) return base
  if (override.state === "ENABLED") return true
  if (override.state === "DISABLED") return false
  return base
}

/* ----------------------------- Vue résolue ------------------------------- */

export type EntitlementSource = "PLAN" | "OVERRIDE" | "LEGACY"

export type FeatureResolution = {
  key: FeatureKey
  /** Droit brut du plan (null en LEGACY, sans notion de plan). */
  planValue: boolean | null
  /** État de l'override appliqué, ou "INHERIT" si aucun/expiré. */
  overrideState: "INHERIT" | StoredOverrideState
  overrideSource: OverrideSource | null
  expiresAt: Date | null
  /** Vrai si un override existait mais est expiré (affichage super-admin). */
  overrideExpired: boolean
  /** Droit final effectif. */
  effective: boolean
  from: EntitlementSource
}

export type EntitlementView = {
  plan: LicensePlan | null
  generation: LicenseGeneration | null
  /** true = tenant historique en accès complet préservé (aucune licence). */
  legacy: boolean
  features: FeatureResolution[]
  limits: { key: LimitKey; value: LimitValue }[]
}

/**
 * LEGACY — tenant existant SANS licence explicite. Comportement actuel préservé :
 * toutes les fonctionnalités restent ouvertes et les limites illimitées. Cette
 * exception est volontairement isolée et facile à retirer une fois les licences
 * attribuées à tous les tenants historiques.
 */
export function resolveLegacyEntitlements(): EntitlementView {
  return {
    plan: null,
    generation: null,
    legacy: true,
    features: FEATURE_KEYS.map((key) => ({
      key,
      planValue: null,
      overrideState: "INHERIT" as const,
      overrideSource: null,
      expiresAt: null,
      overrideExpired: false,
      effective: true,
      from: "LEGACY" as const,
    })),
    limits: LIMIT_KEYS.map((key) => ({ key, value: null })),
  }
}

/**
 * Résout la vue complète d'entitlements d'une entreprise.
 * FAIL CLOSED : plan explicite mais invalide => aucune feature premium.
 */
export function resolveEntitlements(ctx: LicenseContext, now: Date = new Date()): EntitlementView {
  // Tenant historique : accès legacy préservé.
  if (ctx.plan == null) return resolveLegacyEntitlements()

  // Plan explicite mais non reconnu : refus de tout droit premium.
  if (!isLicensePlan(ctx.plan)) {
    return {
      plan: null,
      generation: ctx.generation,
      legacy: false,
      features: FEATURE_KEYS.map((key) => ({
        key,
        planValue: false,
        overrideState: "INHERIT" as const,
        overrideSource: null,
        expiresAt: null,
        overrideExpired: false,
        effective: false,
        from: "PLAN" as const,
      })),
      limits: LIMIT_KEYS.map((key) => ({ key, value: 0 })),
    }
  }

  const plan = ctx.plan
  const features: FeatureResolution[] = FEATURE_KEYS.map((key) => {
    const planValue = planFeature(plan, key)
    const override = ctx.overrides.find((o) => o.featureKey === key)
    const active = override ? isOverrideActive(override, now) : false
    const effective = resolveFeatureForPlan(plan, key, ctx.overrides, now)
    return {
      key,
      planValue,
      overrideState: override && active ? override.state : "INHERIT",
      overrideSource: override && active ? override.source : null,
      expiresAt: override?.expiresAt ?? null,
      overrideExpired: Boolean(override && !active),
      effective,
      from: override && active ? "OVERRIDE" : "PLAN",
    }
  })

  const limits = LIMIT_KEYS.map((key) => ({ key, value: planLimit(plan, key) }))

  return { plan, generation: ctx.generation, legacy: false, features, limits }
}

/** Raccourci : droit effectif d'une feature. */
export function resolveFeature(ctx: LicenseContext, key: FeatureKey, now: Date = new Date()): boolean {
  if (ctx.plan == null) return true // LEGACY
  if (!isLicensePlan(ctx.plan)) return false // fail closed
  return resolveFeatureForPlan(ctx.plan, key, ctx.overrides, now)
}

/** Raccourci : limite effective (null = illimité ; LEGACY = illimité). */
export function resolveLimit(ctx: LicenseContext, key: LimitKey): LimitValue {
  if (ctx.plan == null) return null // LEGACY
  if (!isLicensePlan(ctx.plan)) return 0 // fail closed
  return planLimit(ctx.plan, key)
}
