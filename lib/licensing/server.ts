import "server-only"

/**
 * Socle central des licences DetailFlow — COUCHE SERVEUR (lecture).
 *
 * Charge l'état de licence + overrides d'une entreprise depuis la base, puis
 * délègue le calcul au resolver PUR. C'est la SOURCE DE VÉRITÉ côté serveur
 * pour « cette entreprise a-t-elle droit à X ? ».
 *
 * NOTE : dans cette étape, ces helpers ne BLOQUENT encore rien dans
 * l'application (site, booking, SMS, stats…). L'application concrète des
 * restrictions est volontairement reportée à l'Étape 2.
 */

import { db } from "@/lib/db"
import { companies, companyFeatureOverrides } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  type FeatureKey,
  type LimitKey,
  type LimitValue,
  type StoredOverrideState,
  type OverrideSource,
} from "./types"
import {
  type EntitlementView,
  type LicenseContext,
  type ResolvedOverride,
  resolveEntitlements,
  resolveFeature,
  resolveLimit,
} from "./resolver"
import { PLAN_META } from "./registry"

/** Normalise les états/sources stockés (défensif : ligne DB inattendue ignorée). */
function toResolvedOverride(row: {
  featureKey: string
  state: string
  source: string
  expiresAt: Date | null
}): ResolvedOverride | null {
  if (row.state !== "ENABLED" && row.state !== "DISABLED") return null
  return {
    featureKey: row.featureKey as FeatureKey,
    state: row.state as StoredOverrideState,
    source: row.source as OverrideSource,
    expiresAt: row.expiresAt,
  }
}

/** Charge le contexte de licence d'une entreprise (plan + overrides). */
export async function loadLicenseContext(companyId: number): Promise<LicenseContext | null> {
  const [company] = await db
    .select({ plan: companies.licensePlan, generation: companies.licenseGeneration })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!company) return null

  const rows = await db
    .select({
      featureKey: companyFeatureOverrides.featureKey,
      state: companyFeatureOverrides.state,
      source: companyFeatureOverrides.source,
      expiresAt: companyFeatureOverrides.expiresAt,
    })
    .from(companyFeatureOverrides)
    .where(eq(companyFeatureOverrides.companyId, companyId))

  const overrides = rows
    .map(toResolvedOverride)
    .filter((o): o is ResolvedOverride => o !== null)

  return {
    plan: (company.plan as LicenseContext["plan"]) ?? null,
    generation: (company.generation as LicenseContext["generation"]) ?? null,
    overrides,
  }
}

/** Vue complète résolue d'une entreprise (pour la fiche super-admin). */
export async function getCompanyEntitlements(companyId: number): Promise<EntitlementView | null> {
  const ctx = await loadLicenseContext(companyId)
  if (!ctx) return null
  return resolveEntitlements(ctx, new Date())
}

/** L'entreprise a-t-elle droit à cette feature ? (source de vérité serveur) */
export async function hasFeature(companyId: number, key: FeatureKey): Promise<boolean> {
  const ctx = await loadLicenseContext(companyId)
  if (!ctx) return false // fail closed : entreprise introuvable
  return resolveFeature(ctx, key, new Date())
}

/** Limite effective (null = illimité). */
export async function getLimit(companyId: number, key: LimitKey): Promise<LimitValue> {
  const ctx = await loadLicenseContext(companyId)
  if (!ctx) return 0 // fail closed
  return resolveLimit(ctx, key)
}

/**
 * Vue « valorisante » sûre pour l'espace client (ex. « Licence Lifetime
 * Founder »). N'expose JAMAIS de notes internes ni d'infos d'autres tenants.
 */
export type ClientLicenseBadge = {
  plan: string | null
  generation: string | null
  planLabel: string | null
  isFounder: boolean
  earlyAccess: boolean
  legacy: boolean
}

export async function getClientLicenseBadge(companyId: number): Promise<ClientLicenseBadge | null> {
  const view = await getCompanyEntitlements(companyId)
  if (!view) return null
  const earlyAccess = view.features.find((f) => f.key === "early_access")?.effective ?? false
  return {
    plan: view.plan,
    generation: view.generation,
    planLabel: view.plan ? PLAN_META[view.plan]?.label ?? view.plan : null,
    isFounder: view.plan === "FOUNDER",
    earlyAccess,
    legacy: view.legacy,
  }
}
