import { describe, it, expect } from "vitest"
import {
  SETTINGS_CATEGORIES,
  ALL_SETTINGS_TABS,
  findCategoryByTab,
  getVisibleSettingsCategories,
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

describe("masquage Paramètres — Spirit ACS uniquement", () => {
  const SPIRIT = "spirit-acs"
  // Onglets masqués pour Spirit (site custom + parcours demande → devis).
  const HIDDEN = ["hours", "timeoff", "planning", "travel", "payments", "promo", "appearance"]

  it("ISOLATION : un tenant standard (null/undefined/autre) garde la liste complète INCHANGÉE", () => {
    expect(getVisibleSettingsCategories(null)).toEqual(SETTINGS_CATEGORIES)
    expect(getVisibleSettingsCategories(undefined)).toEqual(SETTINGS_CATEGORIES)
    expect(getVisibleSettingsCategories("autre-tenant")).toEqual(SETTINGS_CATEGORIES)
  })

  it("Spirit : la catégorie « Réservations » disparaît entièrement (tous ses onglets masqués)", () => {
    const cats = getVisibleSettingsCategories(SPIRIT)
    expect(cats.find((c) => c.id === "reservations")).toBeUndefined()
  })

  it("Spirit : « Paiements et facturation » conserve la Facturation mais retire Paiements + Codes promo", () => {
    const billing = getVisibleSettingsCategories(SPIRIT).find((c) => c.id === "billing")
    expect(billing).toBeDefined()
    const tabs = billing!.subTabs.map((t) => t.value)
    expect(tabs).toContain("invoicing")
    expect(tabs).not.toContain("payments")
    expect(tabs).not.toContain("promo")
  })

  it("Spirit : « Site public » retire Apparence mais garde Contenu, Galerie, Avis, Demandes", () => {
    const site = getVisibleSettingsCategories(SPIRIT).find((c) => c.id === "site")
    expect(site).toBeDefined()
    const tabs = site!.subTabs.map((t) => t.value)
    expect(tabs).not.toContain("appearance")
    expect(tabs).toEqual(expect.arrayContaining(["site", "gallery", "reviews", "custom-requests"]))
  })

  it("Spirit : Entreprise, Communications et Compte restent intacts", () => {
    const cats = getVisibleSettingsCategories(SPIRIT)
    expect(cats.find((c) => c.id === "entreprise")?.subTabs.map((t) => t.value)).toEqual(["business"])
    expect(cats.find((c) => c.id === "communications")?.subTabs.map((t) => t.value)).toEqual([
      "sms",
      "notifications",
    ])
    expect(cats.find((c) => c.id === "account")?.subTabs.map((t) => t.value)).toEqual([
      "security",
      "data",
      "support",
    ])
  })

  it("Spirit : un onglet masqué renvoie null (=> grille), un onglet conservé résout normalement", () => {
    for (const tab of HIDDEN) {
      expect(findCategoryByTab(tab, SPIRIT), `tab masqué ${tab}`).toBeNull()
    }
    expect(findCategoryByTab("invoicing", SPIRIT)?.id).toBe("billing")
    expect(findCategoryByTab("business", SPIRIT)?.id).toBe("entreprise")
    expect(findCategoryByTab("custom-requests", SPIRIT)?.id).toBe("site")
  })

  it("ISOLATION : les mêmes onglets restent accessibles pour un tenant standard", () => {
    for (const tab of HIDDEN) {
      expect(findCategoryByTab(tab, null), `tab standard ${tab}`).not.toBeNull()
    }
  })
})
