import { describe, it, expect } from "vitest"
import {
  isLicensePlan,
  isLicenseGeneration,
  isFeatureKey,
  isOverrideState,
  isOverrideSource,
  STORED_OVERRIDE_STATES,
} from "@/lib/licensing/types"
import { PLAN_META } from "@/lib/licensing/registry"

/**
 * Validation stricte : ces type-guards sont la barrière contre toute valeur
 * arbitraire envoyée depuis le navigateur (les Server Actions les utilisent
 * avant toute écriture). On vérifie ici qu'ils ACCEPTENT le valide et
 * REJETTENT l'invalide.
 */

describe("guards — valeurs valides acceptées", () => {
  it("plans", () => {
    for (const p of ["FREE", "ESSENTIAL", "PRO", "BUSINESS", "FOUNDER"]) expect(isLicensePlan(p)).toBe(true)
  })
  it("génération", () => {
    expect(isLicenseGeneration("LIFETIME_V1")).toBe(true)
  })
  it("features", () => {
    for (const f of ["website", "online_booking", "early_access", "profitability_analysis"])
      expect(isFeatureKey(f)).toBe(true)
  })
  it("états et sources", () => {
    for (const s of ["INHERIT", "ENABLED", "DISABLED"]) expect(isOverrideState(s)).toBe(true)
    for (const s of ["PURCHASED", "GIFT", "TRIAL", "FOUNDER", "COMMERCIAL_GESTURE", "MANUAL"])
      expect(isOverrideSource(s)).toBe(true)
  })
})

describe("guards — valeurs invalides rejetées (fail-closed)", () => {
  it("plan inconnu", () => {
    expect(isLicensePlan("HACKER")).toBe(false)
    expect(isLicensePlan("free")).toBe(false)
    expect(isLicensePlan(null)).toBe(false)
    expect(isLicensePlan(123)).toBe(false)
  })
  it("génération non implémentée rejetée (SUBSCRIPTION_V2)", () => {
    expect(isLicenseGeneration("SUBSCRIPTION_V2")).toBe(false)
  })
  it("feature arbitraire", () => {
    expect(isFeatureKey("god_mode")).toBe(false)
    expect(isFeatureKey("")).toBe(false)
    expect(isFeatureKey(undefined)).toBe(false)
  })
  it("état / source invalides", () => {
    expect(isOverrideState("MAYBE")).toBe(false)
    expect(isOverrideSource("FREE_BEER")).toBe(false)
  })
})

describe("commercialisation — verrous", () => {
  it("FOUNDER interne, non achetable", () => {
    expect(PLAN_META.FOUNDER.internalOnly).toBe(true)
    expect(PLAN_META.FOUNDER.purchasable).toBe(false)
  })
  it("BUSINESS non achetable (coming soon)", () => {
    expect(PLAN_META.BUSINESS.purchasable).toBe(false)
  })
  it("INHERIT n'est jamais un état persistable", () => {
    expect((STORED_OVERRIDE_STATES as readonly string[]).includes("INHERIT")).toBe(false)
    expect(STORED_OVERRIDE_STATES).toEqual(["ENABLED", "DISABLED"])
  })
})
