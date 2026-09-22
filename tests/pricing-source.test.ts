import { describe, it, expect } from "vitest"
import {
  ALL_COMMERCIAL_PLANS,
  COMMERCIAL_PLANS,
  LIFETIME_OFFER,
  SELF_SERVICE_LICENSE_PLAN,
  getSelfServePlans,
} from "@/lib/pricing/plans"
import { PLAN_MATRIX, PLAN_META, planFeature } from "@/lib/licensing/registry"
import { isLicensePlan } from "@/lib/licensing/types"

/**
 * GARANTIE CENTRALE : « l'offre affichée correspond exactement aux droits
 * réellement obtenus ». Ces tests lient la source commerciale au moteur de
 * licences et interdisent qu'une offre payante non implémentée finisse
 * silencieusement sur un compte FREE.
 */
describe("source unique des offres — cohérence avec le moteur de licences", () => {
  it("chaque offre pointant vers un plan référence un LicensePlan réel", () => {
    for (const plan of ALL_COMMERCIAL_PLANS) {
      if (plan.licensePlan !== null) {
        expect(isLicensePlan(plan.licensePlan), `${plan.id} -> ${plan.licensePlan}`).toBe(true)
      }
    }
  })

  it("les features promises par une offre sont réellement accordées par son plan", () => {
    for (const plan of ALL_COMMERCIAL_PLANS) {
      if (plan.licensePlan === null) {
        // Pas de plan réel (Lifetime) : aucune feature ne peut être promise.
        expect(plan.includedFeatures, `${plan.id} ne doit rien promettre sans plan`).toEqual([])
        continue
      }
      for (const key of plan.includedFeatures) {
        expect(
          planFeature(plan.licensePlan, key),
          `L'offre "${plan.name}" promet "${key}" mais ${plan.licensePlan} ne l'accorde pas`,
        ).toBe(true)
      }
    }
  })
})

describe("self-service : ce qui est sélectionnable == ce qui est réellement attribué", () => {
  it("seule l'offre gratuite est self_serve aujourd'hui", () => {
    const selfServe = getSelfServePlans()
    expect(selfServe.map((p) => p.id)).toEqual(["starter"])
  })

  it("l'offre self_serve attribue exactement le plan self-service (FREE)", () => {
    const [starter] = getSelfServePlans()
    expect(starter.licensePlan).toBe(SELF_SERVICE_LICENSE_PLAN)
    expect(SELF_SERVICE_LICENSE_PLAN).toBe("FREE")
  })

  it("une offre coming_soon ne mène JAMAIS à /demarrer (pas de création FREE déguisée)", () => {
    for (const plan of ALL_COMMERCIAL_PLANS) {
      if (plan.availability === "coming_soon") {
        expect(plan.cta.href, `${plan.id} ne doit pas avoir de href`).toBeNull()
      }
    }
  })

  it("Pro, Business et Lifetime sont coming_soon tant que le paiement n'est pas livré", () => {
    const byId = Object.fromEntries(ALL_COMMERCIAL_PLANS.map((p) => [p.id, p]))
    expect(byId.pro.availability).toBe("coming_soon")
    expect(byId.business.availability).toBe("coming_soon")
    expect(byId.lifetime.availability).toBe("coming_soon")
  })
})

describe("séparation page publique standard vs feature `website`", () => {
  it("le plan self-service (FREE) n'obtient PAS la feature `website`", () => {
    // La page publique /p/<slug> et /p/<slug>/reservation sont accessibles à
    // FREE via la publication (public_page_config), sans la feature `website`
    // réservée aux vrais sites personnalisés.
    expect(PLAN_MATRIX[SELF_SERVICE_LICENSE_PLAN].features.website).toBe(false)
    expect(ALL_COMMERCIAL_PLANS.find((p) => p.id === "starter")?.includedFeatures).not.toContain("website")
  })
})

describe("cohérence avec le registre interne (super-admin)", () => {
  it("Business n'est pas commercialisable publiquement (aligné sur PLAN_META)", () => {
    // PLAN_META.purchasable = sellabilité manuelle super-admin ; la source
    // commerciale reste au moins aussi prudente pour Business.
    expect(PLAN_META.BUSINESS.purchasable).toBe(false)
    expect(COMMERCIAL_PLANS.find((p) => p.id === "business")?.availability).toBe("coming_soon")
  })

  it("Lifetime n'est rattaché à aucun plan technique existant", () => {
    expect(LIFETIME_OFFER.licensePlan).toBeNull()
  })
})
