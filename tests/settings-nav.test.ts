import { describe, it, expect } from "vitest"
import {
  SETTINGS_CATEGORIES,
  ALL_SETTINGS_TABS,
  findCategoryByTab,
} from "@/lib/admin/settings-nav"
import { computeOnboardingSteps } from "@/lib/onboarding/steps"

// Onglets HISTORIQUES qui doivent rester accessibles (compatibilité des liens).
const LEGACY_TABS = [
  "business", "site", "gallery", "reviews", "custom-requests", "appearance",
  "travel", "hours", "timeoff", "planning", "payments", "promo", "invoicing",
  "sms", "security", "data", "support",
]

// Onglets AJOUTÉS (LOT D). Additifs : ne remplacent aucun onglet historique.
const NEW_TABS = ["notifications"]

// Ensemble attendu = historiques + nouveaux (aucun autre onglet orphelin).
const EXPECTED_TABS = [...LEGACY_TABS, ...NEW_TABS]

describe("settings navigation categories", () => {
  it("expose exactement 6 catégories", () => {
    expect(SETTINGS_CATEGORIES).toHaveLength(6)
  })

  it("chaque catégorie a au moins une sous-section et une description", () => {
    for (const cat of SETTINGS_CATEGORIES) {
      expect(cat.subTabs.length).toBeGreaterThan(0)
      expect(cat.description.trim().length).toBeGreaterThan(0)
      // Icône lucide fournie (composant : fonction ou objet forwardRef).
      expect(cat.icon).toBeTruthy()
    }
  })

  it("couvre TOUS les anciens onglets, sans perte d'accès à un formulaire", () => {
    for (const tab of LEGACY_TABS) {
      expect(ALL_SETTINGS_TABS).toContain(tab)
    }
    // Et aucun onglet en trop / orphelin (historiques + nouveaux LOT D).
    expect([...ALL_SETTINGS_TABS].sort()).toEqual([...EXPECTED_TABS].sort())
  })

  it("expose le nouvel onglet LOT D « notifications » dans Communications", () => {
    expect(ALL_SETTINGS_TABS).toContain("notifications")
    expect(findCategoryByTab("notifications")?.id).toBe("communications")
  })

  it("n'a aucun doublon d'onglet entre catégories", () => {
    const seen = new Set<string>()
    for (const t of ALL_SETTINGS_TABS) {
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  it("résout un ?tab= connu vers la bonne catégorie", () => {
    expect(findCategoryByTab("business")?.id).toBe("entreprise")
    expect(findCategoryByTab("hours")?.id).toBe("reservations")
    expect(findCategoryByTab("invoicing")?.id).toBe("billing")
    expect(findCategoryByTab("site")?.id).toBe("site")
    expect(findCategoryByTab("sms")?.id).toBe("communications")
    expect(findCategoryByTab("security")?.id).toBe("account")
  })

  it("renvoie null pour un ?tab= inconnu ou absent (=> accueil)", () => {
    expect(findCategoryByTab("boitier")).toBeNull()
    expect(findCategoryByTab(undefined)).toBeNull()
    expect(findCategoryByTab("")).toBeNull()
  })

  it("tous les liens du panneau d'onboarding ouvrent une catégorie valide", () => {
    const steps = computeOnboardingSteps({
      companyInfoComplete: false,
      billingConfirmed: false,
      hasService: false,
      hasAvailability: false,
      publicSiteComplete: false,
      hasBooking: false,
    }).steps
    for (const step of steps) {
      const match = /[?&]tab=([a-z-]+)/.exec(step.href)
      // Seuls les liens Paramètres portent un tab= : ils doivent résoudre.
      if (match) {
        expect(findCategoryByTab(match[1]), `tab ${match[1]}`).not.toBeNull()
      }
    }
  })
})
