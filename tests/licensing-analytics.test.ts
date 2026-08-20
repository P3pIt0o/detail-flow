import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveFeature, type LicenseContext, type ResolvedOverride } from "@/lib/licensing/resolver"
import type { LicensePlan } from "@/lib/licensing/types"

/**
 * Étape 2B — Lot 3 : branchement de hasFeature() sur `business_stats`,
 * `expense_management` et `profitability_analysis`.
 *
 * Partie A : tests PURS sur le resolver central (`resolveFeature`) — l'entrée
 * exacte que `hasFeature()` délègue. Aucune écriture DB, aucun réseau.
 *
 * Matrice de référence (registre central) :
 *   business_stats         : FREE=✗ ESSENTIAL=✓ PRO=✓ BUSINESS=✓ FOUNDER=✓
 *   expense_management     : FREE=✗ ESSENTIAL=✓ PRO=✓ BUSINESS=✓ FOUNDER=✓
 *   profitability_analysis : FREE=✗ ESSENTIAL=✗ PRO=✓ BUSINESS=✓ FOUNDER=✓
 *
 * Le cas ESSENTIAL est central : business_stats + expense_management ACTIFS mais
 * profitability_analysis INACTIF => la séparation vient de hasFeature(), pas du
 * nom du plan.
 *
 * Partie B : tests STRUCTURELS garantissant que les chemins serveur réels
 * branchent bien le contrôle, qu'aucun downgrade ne supprime de données, et que
 * les blocs OPÉRATIONNELS du dashboard ne sont pas gatés par le premium.
 */

const NOW = new Date("2026-01-15T12:00:00Z")

function ctx(plan: LicensePlan | null, overrides: ResolvedOverride[] = []): LicenseContext {
  return { plan, generation: plan == null ? null : "LIFETIME_V1", overrides }
}

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const FEATURES = ["business_stats", "expense_management", "profitability_analysis"] as const

describe("2B lot 3 — LEGACY (licensePlan = NULL) : comportement historique inchangé", () => {
  it("autorise business_stats, expense_management et profitability_analysis en LEGACY", () => {
    for (const f of FEATURES) {
      expect(resolveFeature(ctx(null), f, NOW)).toBe(true)
    }
  })
})

describe("2B lot 3 — matrice des plans explicites", () => {
  it("FREE : les trois features sont refusées", () => {
    for (const f of FEATURES) {
      expect(resolveFeature(ctx("FREE"), f, NOW)).toBe(false)
    }
  })

  it("ESSENTIAL : stats + dépenses OUI, rentabilité NON (séparation clé)", () => {
    expect(resolveFeature(ctx("ESSENTIAL"), "business_stats", NOW)).toBe(true)
    expect(resolveFeature(ctx("ESSENTIAL"), "expense_management", NOW)).toBe(true)
    expect(resolveFeature(ctx("ESSENTIAL"), "profitability_analysis", NOW)).toBe(false)
  })

  it("PRO : les trois features sont autorisées", () => {
    for (const f of FEATURES) {
      expect(resolveFeature(ctx("PRO"), f, NOW)).toBe(true)
    }
  })

  it("BUSINESS et FOUNDER : les trois features sont autorisées", () => {
    for (const f of FEATURES) {
      expect(resolveFeature(ctx("BUSINESS"), f, NOW)).toBe(true)
      expect(resolveFeature(ctx("FOUNDER"), f, NOW)).toBe(true)
    }
  })
})

describe("2B lot 3 — overrides", () => {
  it("override ENABLED accorde profitability_analysis même en ESSENTIAL", () => {
    const ov: ResolvedOverride = { featureKey: "profitability_analysis", state: "ENABLED", expiresAt: null }
    expect(resolveFeature(ctx("ESSENTIAL", [ov]), "profitability_analysis", NOW)).toBe(true)
    // business_stats reste inchangé (déjà accordé par le plan).
    expect(resolveFeature(ctx("ESSENTIAL", [ov]), "business_stats", NOW)).toBe(true)
  })

  it("override DISABLED retire expense_management même en PRO", () => {
    const ov: ResolvedOverride = { featureKey: "expense_management", state: "DISABLED", expiresAt: null }
    expect(resolveFeature(ctx("PRO", [ov]), "expense_management", NOW)).toBe(false)
  })

  it("override expiré est ignoré (retour au droit du plan)", () => {
    const past: ResolvedOverride = {
      featureKey: "profitability_analysis",
      state: "ENABLED",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    }
    expect(resolveFeature(ctx("ESSENTIAL", [past]), "profitability_analysis", NOW)).toBe(false)
  })
})

describe("2B lot 3 — fail closed (licence explicite invalide)", () => {
  it("un plan explicite inconnu refuse les trois features", () => {
    const forged = ctx("SUBSCRIPTION_V2" as unknown as LicensePlan)
    for (const f of FEATURES) {
      expect(resolveFeature(forged, f, NOW)).toBe(false)
    }
  })
})

describe("2B lot 3 — séparation stats / rentabilité (indépendance de décision)", () => {
  it("le contexte ne décide QUE via la feature demandée", () => {
    // Même contexte, deux features différentes => deux décisions différentes.
    const c = ctx("ESSENTIAL")
    expect(resolveFeature(c, "business_stats", NOW)).toBe(true)
    expect(resolveFeature(c, "profitability_analysis", NOW)).toBe(false)
  })
})

describe("2B lot 3 — structurel : chemins serveur gatés", () => {
  it("les Server Actions dépenses vérifient expense_management avant écriture/suppression", () => {
    const src = read("app/admin/(dashboard)/produits/actions.ts")
    expect(src).toContain('canUseFeature(tenant.id, "expense_management")')
    // Une occurrence dans saveProductPurchase et une dans deleteProductPurchase.
    const count = src.split('canUseFeature(tenant.id, "expense_management")').length - 1
    expect(count).toBe(2)
    // Le refus renvoie un message et n'exécute aucune requête (pas de bypass).
    expect(src).toContain("FEATURE_LOCKED_MESSAGE")
  })

  it("aucune suppression automatique de dépenses au downgrade (aucun DELETE hors action gatée)", () => {
    const src = read("app/admin/(dashboard)/produits/actions.ts")
    // Le seul delete est celui de deleteProductPurchase, conditionné par la feature
    // ET par le companyId (isolation tenant conservée).
    expect(src).toContain("eq(productPurchases.companyId, tenant.id)")
    const deletes = src.split(".delete(productPurchases)").length - 1
    expect(deletes).toBe(1)
  })

  it("la page produits est verrouillée par expense_management (message licence, pas de 404)", () => {
    const src = read("app/admin/(dashboard)/produits/page.tsx")
    expect(src).toContain('canUseFeature(companyId, "expense_management")')
    expect(src).toContain("n&apos;est pas incluse dans votre licence")
    // Les dépenses ne sont chargées que si la feature est incluse.
    expect(src).toContain("canExpenses ?")
    // Pas de notFound() : on préfère une page verrouillée.
    expect(src).not.toContain("notFound(")
  })

  it("le dashboard gate business_stats et profitability_analysis séparément", () => {
    const src = read("app/admin/(dashboard)/page.tsx")
    expect(src).toContain('canUseFeature(companyId, "business_stats")')
    expect(src).toContain('canUseFeature(companyId, "profitability_analysis")')
    // Décisions distinctes (deux variables), pas de plan en dur.
    expect(src).toContain("canStats")
    expect(src).toContain("canProfit")
    expect(src).not.toMatch(/plan\s*===\s*["']/)
  })

  it("le dashboard ne calcule pas les stats premium quand aucune feature ne les expose", () => {
    const src = read("app/admin/(dashboard)/page.tsx")
    // getDashboardStats et getVisitStats sont conditionnels.
    expect(src).toContain("needStats ? getDashboardStats(companyId) : Promise.resolve(null)")
    expect(src).toContain("canStats ? getVisitStats() : Promise.resolve(null)")
  })

  it("les blocs OPÉRATIONNELS du dashboard restent non gatés (semaine, prochains RDV, alerte acompte)", () => {
    const src = read("app/admin/(dashboard)/page.tsx")
    // Ces lectures sont hors de toute condition de feature.
    expect(src).toContain("getUpcomingBookingsDetailed(5)")
    expect(src).toContain("getDashboardWeek()")
    // Le compteur d'acompte est OPÉRATIONNEL et toujours chargé.
    expect(src).toContain("getPendingDepositCount(companyId)")
    // L'alerte s'appuie sur ce compteur, pas sur les stats premium.
    expect(src).toContain("pendingDepositCount > 0")
  })

  it("le compteur d'acompte opérationnel est isolé de getDashboardStats", () => {
    const src = read("lib/admin/queries.ts")
    expect(src).toContain("export async function getPendingDepositCount")
    // Scopé par companyId (isolation tenant).
    expect(src).toMatch(/getPendingDepositCount[\s\S]*eq\(bookings\.companyId, cid\)/)
  })
})
