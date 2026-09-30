import { describe, expect, it } from "vitest"
import {
  describeTestPageTrialCopy,
  isTestPageTrialEligible,
} from "@/app/admin/(dashboard)/abonnement/test-subscriptions/trial-copy"

describe("page test abonnements — affichage de l’essai", () => {
  it("entreprise jamais abonnée : 30 jours gratuits et 1er mois offert", () => {
    const eligible = isTestPageTrialEligible({ subscriptionStartedAt: null })
    expect(eligible).toBe(true)
    const copy = describeTestPageTrialCopy(eligible)
    expect(copy.intro).toContain("30 jours gratuits, sans carte bancaire")
    expect(copy.planNote).toBe("1er mois offert")
  })

  it("entreprise sans ligne company : considérée éligible", () => {
    expect(isTestPageTrialEligible(null)).toBe(true)
  })

  it("essai déjà utilisé : paiement immédiat, aucune mention d’essai gratuit", () => {
    const eligible = isTestPageTrialEligible({ subscriptionStartedAt: new Date("2026-01-01") })
    expect(eligible).toBe(false)
    const copy = describeTestPageTrialCopy(eligible)
    expect(copy.intro).toBe(
      "Stripe TEST et base Preview isolée. Votre essai gratuit a déjà été utilisé. Toute nouvelle souscription est facturée immédiatement.",
    )
    expect(copy.planNote).toBe("Paiement immédiat")
    expect(copy.intro).not.toContain("30 jours")
  })
})
