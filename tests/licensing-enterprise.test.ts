import { describe, it, expect } from "vitest"
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  LICENSE_PLANS,
  isLicensePlan,
  type FeatureKey,
  type LicensePlan,
} from "@/lib/licensing/types"
import {
  PLAN_META,
  PLAN_MATRIX,
  planFeature,
  planLimit,
  BUSINESS_FEATURES,
  ENTERPRISE_FEATURES,
} from "@/lib/licensing/registry"

/**
 * LOT 0 — SOCLE LICENCES / OFFRES V2.
 *
 * Ce fichier verrouille deux garanties :
 *   1. ENTERPRISE existe réellement dans le moteur et hérite de BUSINESS ;
 *   2. AUCUNE régression silencieuse : les droits effectifs de FREE, ESSENTIAL,
 *      PRO, BUSINESS et FOUNDER sont figés à l'identique. ENTERPRISE est le
 *      SEUL nouveau plan.
 *
 * Les « snapshots » ci-dessous décrivent l'ÉTAT ACTUEL relevé avant le lot.
 * Toute divergence future doit être une DÉCISION EXPLICITE (mise à jour du
 * snapshot), jamais un effet de bord d'un `allFeatures()`.
 */

/** Construit une matrice de droits à partir des seules features à `true`. */
function expect_features(trueKeys: readonly FeatureKey[]): Record<FeatureKey, boolean> {
  const map = {} as Record<FeatureKey, boolean>
  for (const k of FEATURE_KEYS) map[k] = false
  for (const k of trueKeys) map[k] = true
  return map
}

/** Droits effectifs bruts d'un plan (toutes les FeatureKey). */
function effectiveFeatures(plan: LicensePlan): Record<FeatureKey, boolean> {
  const map = {} as Record<FeatureKey, boolean>
  for (const k of FEATURE_KEYS) map[k] = planFeature(plan, k)
  return map
}

/* ------------------------------------------------------------------ */
/*  État ACTUEL relevé (source de vérité de non-régression)            */
/* ------------------------------------------------------------------ */

const SNAPSHOT: Record<Exclude<LicensePlan, "ENTERPRISE">, readonly FeatureKey[]> = {
  FREE: [],
  ESSENTIAL: ["business_stats", "expense_management"],
  PRO: [
    "website",
    "online_booking",
    "online_payments",
    "business_stats",
    "expense_management",
    "profitability_analysis",
    "email_reminders",
    "review_requests",
  ],
  BUSINESS: [
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
  ],
  // FOUNDER = toutes les features de sa génération (aujourd'hui : toutes).
  FOUNDER: [...FEATURE_KEYS],
}

const LIMITED_PLANS: readonly LicensePlan[] = ["ESSENTIAL", "PRO", "BUSINESS", "ENTERPRISE", "FOUNDER"]

describe("LOT 0 — moteur de licences : plan ENTERPRISE", () => {
  /* ---------------------------- TEST A / B ---------------------------- */
  it("A. isLicensePlan('ENTERPRISE') est vrai", () => {
    expect(isLicensePlan("ENTERPRISE")).toBe(true)
    expect(LICENSE_PLANS).toContain("ENTERPRISE")
  })

  it("B. PLAN_META.ENTERPRISE existe, publiquement présenté mais pas achetable", () => {
    expect(PLAN_META.ENTERPRISE).toBeDefined()
    expect(PLAN_META.ENTERPRISE.internalOnly).toBe(false)
    expect(PLAN_META.ENTERPRISE.purchasable).toBe(false)
    expect(PLAN_META.ENTERPRISE.generation).toBe("LIFETIME_V1")
  })

  it("la liste technique est exactement FREE, ESSENTIAL, PRO, BUSINESS, ENTERPRISE, FOUNDER", () => {
    expect([...LICENSE_PLANS]).toEqual(["FREE", "ESSENTIAL", "PRO", "BUSINESS", "ENTERPRISE", "FOUNDER"])
  })

  /* ------------------------------ TEST C ------------------------------ */
  it("C. ENTERPRISE possède TOUS les droits actuels de BUSINESS (superset)", () => {
    for (const k of FEATURE_KEYS) {
      if (planFeature("BUSINESS", k)) {
        expect(planFeature("ENTERPRISE", k), `ENTERPRISE doit accorder ${k} comme BUSINESS`).toBe(true)
      }
    }
    // Aujourd'hui ENTERPRISE == BUSINESS (aucun module équipe encore livré).
    expect(effectiveFeatures("ENTERPRISE")).toEqual(effectiveFeatures("BUSINESS"))
  })

  /* ------------------------------ TEST D ------------------------------ */
  it("D. BUSINESS ne dépend plus implicitement de « toutes les features »", () => {
    // Composition explicite : early_access n'est PAS accordé (réservé FOUNDER).
    expect(planFeature("BUSINESS", "early_access")).toBe(false)
    // Le nombre de droits BUSINESS est strictement inférieur au total : la
    // preuve structurelle qu'il n'absorbe pas l'intégralité du registre.
    const granted = FEATURE_KEYS.filter((k) => planFeature("BUSINESS", k))
    expect(granted.length).toBeLessThan(FEATURE_KEYS.length)
    // La source de droits vient bien de la liste explicite BUSINESS_FEATURES.
    expect([...granted].sort()).toEqual([...BUSINESS_FEATURES].sort())
    // ENTERPRISE_FEATURES inclut toute la liste BUSINESS (héritage explicite).
    for (const k of BUSINESS_FEATURES) expect(ENTERPRISE_FEATURES).toContain(k)
  })

  /* ------------------------ TESTS E/F/G/H (§26) ----------------------- */
  it("E. FOUNDER conserve exactement ses droits actuels", () => {
    expect(effectiveFeatures("FOUNDER")).toEqual(expect_features(SNAPSHOT.FOUNDER))
  })

  it("F. FREE reste inchangé (droits + limites)", () => {
    expect(effectiveFeatures("FREE")).toEqual(expect_features(SNAPSHOT.FREE))
    expect(planLimit("FREE", "maxCustomers")).toBe(10)
    expect(planLimit("FREE", "maxVehicles")).toBe(10)
    expect(planLimit("FREE", "maxQuotesPerMonth")).toBe(3)
    expect(planLimit("FREE", "maxInvoicesPerMonth")).toBe(3)
  })

  it("G. PRO reste inchangé", () => {
    expect(effectiveFeatures("PRO")).toEqual(expect_features(SNAPSHOT.PRO))
  })

  it("H. ESSENTIAL reste inchangé", () => {
    expect(effectiveFeatures("ESSENTIAL")).toEqual(expect_features(SNAPSHOT.ESSENTIAL))
  })

  it("BUSINESS conserve exactement ses droits actuels (non-régression)", () => {
    expect(effectiveFeatures("BUSINESS")).toEqual(expect_features(SNAPSHOT.BUSINESS))
  })

  /* ------------------------------ §27 limites ------------------------- */
  it("limites : ENTERPRISE est illimité (null) partout", () => {
    for (const key of LIMIT_KEYS) {
      expect(planLimit("ENTERPRISE", key), `ENTERPRISE.${key}`).toBeNull()
    }
  })

  it("limites : tous les plans payants/premium restent illimités", () => {
    for (const plan of LIMITED_PLANS) {
      for (const key of LIMIT_KEYS) {
        expect(planLimit(plan, key), `${plan}.${key}`).toBeNull()
      }
    }
  })

  /* --------------- Exhaustivité : ENTERPRISE partout ------------------ */
  it("PLAN_MATRIX et PLAN_META couvrent ENTERPRISE (exhaustivité)", () => {
    expect(PLAN_MATRIX.ENTERPRISE).toBeDefined()
    for (const plan of LICENSE_PLANS) {
      expect(PLAN_MATRIX[plan], `PLAN_MATRIX manque ${plan}`).toBeDefined()
      expect(PLAN_META[plan], `PLAN_META manque ${plan}`).toBeDefined()
    }
  })
})
