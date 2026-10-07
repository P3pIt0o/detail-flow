import { describe, it, expect } from "vitest"
import {
  ALL_COMMERCIAL_PLANS,
  COMMERCIAL_PLANS,
  CUSTOM_PLATFORM_OFFER,
  PLAN_JOURNEY,
  PRICING_COPY,
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

  it("Équipe pointe vers le plan technique ENTERPRISE et reste coming_soon", () => {
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
  it("seuls Essentiel et Indépendant sont self_serve ; Performance et Équipe non", () => {
    const selfServe = getSelfServePlans()
    expect(selfServe.map((p) => p.id)).toEqual(["starter", "pro"])
  })

  it("la création self-service attribue toujours FREE (les offres payantes passent par Checkout)", () => {
    const starter = getSelfServePlans().find((p) => p.id === "starter")
    expect(starter?.licensePlan).toBe(SELF_SERVICE_LICENSE_PLAN)
    expect(SELF_SERVICE_LICENSE_PLAN).toBe("FREE")
  })

  it("CTA : FREE → /demarrer, PRO → /demarrer?plan=PRO, BUSINESS → aucun lien", () => {
    const byId = Object.fromEntries(ALL_COMMERCIAL_PLANS.map((p) => [p.id, p]))
    expect(byId.starter.cta.href).toBe("/demarrer")
    expect(byId.starter.cta.label).toBe("Créer mon espace gratuitement")
    expect(byId.pro.licensePlan).toBe("PRO")
    expect(byId.pro.cta.href).toBe("/demarrer?plan=PRO")
    expect(byId.pro.cta.label).toBe("Essayer 30 jours gratuitement")
    expect(byId.ultime.licensePlan).toBe("BUSINESS")
    expect(byId.ultime.availability).toBe("coming_soon")
    expect(byId.ultime.cta.href).toBeNull()
    expect(byId.ultime.cta.label).toBe("Bientôt disponible")
    expect(byId.pro.trial).toBe("30 jours gratuits")
  })

  it("Équipe : coming_soon, « Bientôt disponible », aucun CTA de souscription", () => {
    const equipe = ALL_COMMERCIAL_PLANS.find((p) => p.id === "entreprise")
    expect(equipe?.availability).toBe("coming_soon")
    expect(equipe?.cta.label).toBe("Bientôt disponible")
    expect(equipe?.cta.href).toBeNull()
  })

  it("une offre coming_soon ne mène JAMAIS à /demarrer (pas de création FREE déguisée)", () => {
    for (const plan of ALL_COMMERCIAL_PLANS) {
      if (plan.availability === "coming_soon") {
        expect(plan.cta.href, `${plan.id} ne doit pas avoir de href`).toBeNull()
      }
    }
  })

  it("aucun texte « offres payantes prochainement » ne subsiste", () => {
    expect(PRICING_COPY.note).not.toMatch(/prochainement/i)
    expect(PRICING_COPY.trialHeadline).not.toMatch(/prochainement|future formule/i)
  })
})

describe("séparation page publique standard vs feature `website`", () => {
  it("le plan self-service (FREE) obtient la feature `website` et l'offre la déclare", () => {
    // Offre de découverte : FREE peut personnaliser sa page publique.
    expect(PLAN_MATRIX[SELF_SERVICE_LICENSE_PLAN].features.website).toBe(true)
    expect(ALL_COMMERCIAL_PLANS.find((p) => p.id === "starter")?.includedFeatures).toContain("website")
  })
})

describe("cohérence avec le registre interne (super-admin)", () => {
  it("le registre super-admin n'est pas modifié par la commercialisation Checkout", () => {
    // PLAN_META.purchasable = attribution MANUELLE super-admin ; inchangé. La
    // phase de lancement : BUSINESS n'est pas vendu en self-service (coming_soon).
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
