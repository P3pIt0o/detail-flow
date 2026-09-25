import { describe, it, expect } from "vitest"
import {
  ALL_COMMERCIAL_PLANS,
  COMMERCIAL_PLANS,
  CUSTOM_PLATFORM_OFFER,
  PLAN_JOURNEY,
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
  it("expose exactement les 4 niveaux SaaS publics (plus de Lifetime)", () => {
    expect(COMMERCIAL_PLANS.map((p) => p.id)).toEqual(["starter", "pro", "ultime", "entreprise"])
  })

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
        // Pas de plan réel : aucune feature ne peut être promise.
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

  it("Entreprise pointe vers le plan technique ENTERPRISE et reste coming_soon", () => {
    const entreprise = COMMERCIAL_PLANS.find((p) => p.id === "entreprise")
    expect(entreprise?.licensePlan).toBe("ENTERPRISE")
    expect(isLicensePlan(entreprise?.licensePlan)).toBe(true)
    expect(entreprise?.availability).toBe("coming_soon")
    // Aucune feature d'équipe n'existe encore : rien n'est promis (invariant).
    expect(entreprise?.includedFeatures).toEqual([])
    // CTA désactivé : jamais de lien vers /demarrer.
    expect(entreprise?.cta.href).toBeNull()
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

  it("Pro, Ultime et Entreprise sont coming_soon tant que le paiement n'est pas livré", () => {
    const byId = Object.fromEntries(ALL_COMMERCIAL_PLANS.map((p) => [p.id, p]))
    expect(byId.pro.availability).toBe("coming_soon")
    expect(byId.ultime.availability).toBe("coming_soon")
    expect(byId.entreprise.availability).toBe("coming_soon")
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
  it("Ultime s'appuie sur BUSINESS, non commercialisable en self-service (aligné sur PLAN_META)", () => {
    // PLAN_META.purchasable = sellabilité manuelle super-admin ; la source
    // commerciale reste au moins aussi prudente pour l'offre Ultime (BUSINESS).
    expect(PLAN_META.BUSINESS.purchasable).toBe(false)
    expect(COMMERCIAL_PLANS.find((p) => p.id === "ultime")?.availability).toBe("coming_soon")
  })
})

describe("mise en gamme & prestation sur mesure", () => {
  it("le parcours de croissance couvre les 4 offres dans l'ordre", () => {
    expect(PLAN_JOURNEY.map((s) => s.planId)).toEqual(["starter", "pro", "ultime", "entreprise"])
  })

  it("le sur mesure est une prestation contact-only, pas une formule SaaS", () => {
    expect(CUSTOM_PLATFORM_OFFER.cta.href.startsWith("mailto:")).toBe(true)
    // Ne doit pas être confondu avec un plan de la grille.
    expect(COMMERCIAL_PLANS.some((p) => (p.id as string) === "custom")).toBe(false)
  })
})
