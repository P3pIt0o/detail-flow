import { describe, it, expect } from "vitest"
import { resolveFeature, type LicenseContext, type ResolvedOverride } from "@/lib/licensing/resolver"
import type { FeatureKey, LicensePlan } from "@/lib/licensing/types"

/**
 * Étape 2B — Lot 1 : branchement de hasFeature() sur website / online_booking /
 * online_payments.
 *
 * Tests PURS sur le resolver central (`resolveFeature`), l'entrée exacte que
 * `hasFeature()` délègue. Aucune écriture DB, aucun accès réseau.
 *
 * Matrice de référence (registre central) pour ces 3 features :
 *   FREE = false, ESSENTIAL = false, PRO/BUSINESS/FOUNDER = true.
 */

const LOT1: FeatureKey[] = ["website", "online_booking", "online_payments"]

function ctx(plan: LicensePlan | null, overrides: ResolvedOverride[] = []): LicenseContext {
  return { plan, generation: plan == null ? null : "LIFETIME_V1", overrides }
}

const NOW = new Date("2026-01-15T12:00:00Z")

describe("2B lot 1 — LEGACY (licensePlan = NULL) : comportement inchangé", () => {
  it("autorise website / online_booking / online_payments", () => {
    for (const key of LOT1) {
      expect(resolveFeature(ctx(null), key, NOW)).toBe(true)
    }
  })
})

describe("2B lot 1 — licence explicite : droit selon le plan", () => {
  it("FREE => les 3 features refusées", () => {
    for (const key of LOT1) expect(resolveFeature(ctx("FREE"), key, NOW)).toBe(false)
  })

  it("ESSENTIAL => les 3 features refusées", () => {
    for (const key of LOT1) expect(resolveFeature(ctx("ESSENTIAL"), key, NOW)).toBe(false)
  })

  it("PRO => les 3 features autorisées", () => {
    for (const key of LOT1) expect(resolveFeature(ctx("PRO"), key, NOW)).toBe(true)
  })

  it("BUSINESS => les 3 features autorisées", () => {
    for (const key of LOT1) expect(resolveFeature(ctx("BUSINESS"), key, NOW)).toBe(true)
  })

  it("FOUNDER => les 3 features autorisées", () => {
    for (const key of LOT1) expect(resolveFeature(ctx("FOUNDER"), key, NOW)).toBe(true)
  })
})

describe("2B lot 1 — overrides (geste commercial / downgrade)", () => {
  it("ESSENTIAL + online_booking ENABLED => autorisé sans changer de plan", () => {
    const overrides: ResolvedOverride[] = [
      { featureKey: "online_booking", state: "ENABLED", source: "COMMERCIAL_GESTURE", expiresAt: null },
    ]
    expect(resolveFeature(ctx("ESSENTIAL", overrides), "online_booking", NOW)).toBe(true)
    // Les autres features du lot restent au droit du plan (refusées).
    expect(resolveFeature(ctx("ESSENTIAL", overrides), "website", NOW)).toBe(false)
  })

  it("PRO + online_payments DISABLED => refusé exceptionnellement", () => {
    const overrides: ResolvedOverride[] = [
      { featureKey: "online_payments", state: "DISABLED", source: "MANUAL", expiresAt: null },
    ]
    expect(resolveFeature(ctx("PRO", overrides), "online_payments", NOW)).toBe(false)
    // website reste autorisé par le plan PRO.
    expect(resolveFeature(ctx("PRO", overrides), "website", NOW)).toBe(true)
  })

  it("override de trial expiré => retour au droit du plan (aucune donnée touchée)", () => {
    const overrides: ResolvedOverride[] = [
      { featureKey: "website", state: "ENABLED", source: "TRIAL", expiresAt: new Date("2026-01-01T00:00:00Z") },
    ]
    // Trial expiré au 15/01 : website retombe au droit du plan ESSENTIAL (false).
    expect(resolveFeature(ctx("ESSENTIAL", overrides), "website", NOW)).toBe(false)
  })
})

describe("2B lot 1 — isolation : la décision ne dépend que du contexte passé", () => {
  it("deux contextes tenant distincts donnent des droits indépendants", () => {
    const tenantA = ctx("PRO") // a le droit
    const tenantB = ctx("FREE") // ne l'a pas
    expect(resolveFeature(tenantA, "online_booking", NOW)).toBe(true)
    expect(resolveFeature(tenantB, "online_booking", NOW)).toBe(false)
  })
})

describe("2B lot 1 — fail closed / anti-contournement", () => {
  it("plan explicite invalide (valeur forgée) => refus de toute feature premium", () => {
    const forged = ctx("SUBSCRIPTION_V2" as unknown as LicensePlan)
    for (const key of LOT1) expect(resolveFeature(forged, key, NOW)).toBe(false)
  })

  it("un override forgé sur un plan invalide ne débloque rien", () => {
    const forged = ctx("HACKER" as unknown as LicensePlan, [
      { featureKey: "online_payments", state: "ENABLED", source: "MANUAL", expiresAt: null },
    ])
    expect(resolveFeature(forged, "online_payments", NOW)).toBe(false)
  })
})
