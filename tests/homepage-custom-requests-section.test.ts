import { describe, it, expect } from "vitest"
import {
  HOME_SECTION_KEYS,
  HOME_SECTION_LABELS,
  resolveSectionOrder,
} from "@/lib/site-content"
import { resolveCustomRequestsConfig, resolveCustomRequestTexts, activeTypes } from "@/lib/custom-requests"
import { withTenant } from "@/lib/tenant-link"

/**
 * Réplique la condition de rendu de CustomRequestsSection (composant serveur) :
 * la section s'affiche seulement si activée ET s'il existe au moins un type actif.
 */
function sectionVisible(rawConfig: unknown): boolean {
  const cfg = resolveCustomRequestsConfig(rawConfig)
  return cfg.enabled && activeTypes(cfg).length > 0
}

describe("Section homepage « Demandes personnalisées »", () => {
  it("est enregistrée dans le système central des sections", () => {
    expect(HOME_SECTION_KEYS).toContain("customRequests")
    expect(HOME_SECTION_LABELS.customRequests).toBe("Demandes personnalisées")
  })

  describe("visibilité (config du tenant courant)", () => {
    it("activée + types actifs => visible", () => {
      expect(sectionVisible({ enabled: true })).toBe(true) // builtins actifs par défaut
    })

    it("désactivée => absente", () => {
      expect(sectionVisible({ enabled: false })).toBe(false)
      expect(sectionVisible(null)).toBe(false) // jamais configurée
    })

    it("activée mais aucun type actif => absente (pas d'espace vide)", () => {
      const raw = {
        enabled: true,
        types: [
          { key: "sur-mesure", enabled: false },
          { key: "abonnement", enabled: false },
          { key: "flotte", enabled: false },
          { key: "autre", enabled: false },
        ],
      }
      expect(sectionVisible(raw)).toBe(false)
    })
  })

  describe("ordre des sections — rétrocompatibilité", () => {
    it("ancien ordre sans customRequests => clé ajoutée automatiquement en fin", () => {
      const legacy = ["about", "whyUs", "services", "process", "gallery", "reviews", "contact"]
      const resolved = resolveSectionOrder({ sectionOrder: legacy })
      expect(resolved).toContain("customRequests")
      // L'ordre existant est intégralement préservé, la nouvelle clé est ajoutée à la fin.
      expect(resolved.slice(0, legacy.length)).toEqual(legacy)
      expect(resolved[resolved.length - 1]).toBe("customRequests")
    })

    it("tenant jamais configuré => ordre canonique complet avec la section", () => {
      const resolved = resolveSectionOrder(null)
      expect(resolved).toEqual([...HOME_SECTION_KEYS])
    })

    it("la section peut être déplacée (ordre personnalisé respecté)", () => {
      const custom = ["about", "customRequests", "services", "whyUs", "process", "gallery", "reviews", "contact"]
      const resolved = resolveSectionOrder({ sectionOrder: custom })
      expect(resolved).toEqual(custom)
      expect(resolved.indexOf("customRequests")).toBe(1)
    })
  })

  it("le CTA pointe vers /demande (scopé au tenant)", () => {
    expect(withTenant("/demande", null)).toContain("/demande")
    expect(withTenant("/demande", "garage-a")).toContain("/demande")
  })

  it("isolation : la config d'un tenant n'influence jamais celle d'un autre", () => {
    const a = resolveCustomRequestsConfig({ enabled: true, title: "Titre A" })
    const b = resolveCustomRequestsConfig({ enabled: false, title: "Titre B" })
    expect(resolveCustomRequestTexts(a).title).toBe("Titre A")
    expect(b.enabled).toBe(false)
    expect(resolveCustomRequestTexts(b).title).toBe("Titre B")
    // Chaque appel est pur : aucun état partagé entre tenants.
    expect(a.enabled).toBe(true)
  })
})
