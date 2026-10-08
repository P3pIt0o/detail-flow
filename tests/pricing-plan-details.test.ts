import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { PLAN_MATRIX } from "@/lib/licensing/registry"
import { COMPARE_CATEGORIES, getPlanFeatureGroups } from "@/components/marketing/v4/pricing-data"

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const pricingTsx = read("components/marketing/v4/pricing.tsx")

describe("Tarifs — volet détaillé par offre", () => {
  it("chaque card rend un volet natif « Voir toutes les fonctionnalités »", () => {
    expect(pricingTsx).toMatch(/<PlanFeatureDetails plan=\{plan\} \/>/)
    expect(pricingTsx).toMatch(/Voir toutes les fonctionnalités/)
    expect(pricingTsx).toMatch(/<details className="group mt-5/)
    expect(COMMERCIAL_PLANS).toHaveLength(4)
  })

  it("pricing.tsx reste un Server Component et conserve le comparateur global", () => {
    expect(pricingTsx).not.toMatch(/["']use client["']/)
    expect(pricingTsx).toMatch(/<FeatureCompare \/>/)
  })

  it("le détail est dérivé de COMPARE_CATEGORIES (lignes values[plan.id] === true uniquement)", () => {
    for (const plan of COMMERCIAL_PLANS) {
      const derived = getPlanFeatureGroups(plan.id).flatMap((g) => g.items.map((i) => i.label))
      const expected = COMPARE_CATEGORIES.flatMap((c) =>
        c.rows.filter((r) => r.values[plan.id]).map((r) => r.cardLabel ?? r.label),
      )
      expect(derived).toEqual(expected)
      expect(derived.length).toBeGreaterThan(0)
    }
    const starter = getPlanFeatureGroups("starter").flatMap((g) => g.items.map((i) => i.label))
    expect(starter).not.toContain("Statistiques de base")
    expect(starter).not.toContain("Comptes employés")
  })

  it("chaque ligne du comparateur possède une description", () => {
    for (const row of COMPARE_CATEGORIES.flatMap((c) => c.rows)) expect(row.description).toBeTruthy()
  })

  it("limites Essentiel affichées et conformes à PLAN_MATRIX.FREE", () => {
    const notes = getPlanFeatureGroups("starter").flatMap((g) => g.items.map((i) => i.note).filter(Boolean))
    expect(notes).toEqual(expect.arrayContaining(["Illimité", "10 devis / mois", "10 factures / mois", "2 actifs · 7 % de commission", "0 inclus / mois · packs disponibles"]))
    expect(PLAN_MATRIX.FREE.limits.maxCustomers).toBeNull()
    expect(PLAN_MATRIX.FREE.limits.maxQuotesPerMonth).toBe(10)
    expect(PLAN_MATRIX.FREE.limits.maxInvoicesPerMonth).toBe(10)
    expect(PLAN_MATRIX.FREE.limits.maxActiveCustomerSubscriptions).toBe(2)
  })

  it("offres coming_soon : libellé « Fonctionnalités prévues »", () => {
    expect(pricingTsx).toMatch(/planned \? "Fonctionnalités prévues" : "Fonctionnalités incluses"/)
  })
})

describe("Tarifs — offres commerciales inchangées", () => {
  const byId = Object.fromEntries(COMMERCIAL_PLANS.map((p) => [p.id, p]))

  it("prix inchangés", () => {
    expect(byId.starter.price).toBe("0 €")
    expect(byId.pro.price).toBe("19,90 €")
    expect(byId.ultime.price).toBe("34,90 €")
    expect(byId.entreprise.price).toBe("59,90 €")
  })

  it("disponibilité et CTA inchangés", () => {
    expect(byId.starter.availability).toBe("self_serve")
    expect(byId.pro.availability).toBe("self_serve")
    for (const id of ["ultime", "entreprise"]) {
      expect(byId[id].availability).toBe("coming_soon")
      expect(byId[id].cta.href).toBeNull()
    }
  })

  it("essai uniquement sur Indépendant", () => {
    expect(byId.pro.trial).toBe("30 jours gratuits, sans carte bancaire")
    for (const id of ["starter", "ultime", "entreprise"]) expect(byId[id].trial).toBeNull()
  })
})
