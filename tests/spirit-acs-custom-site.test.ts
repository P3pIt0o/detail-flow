import { describe, it, expect, vi } from "vitest"

/**
 * Site personnalisé Spirit ACS — LIAISON clé → composant (`registry.ts`).
 *
 * On isole `registry.ts` du reste : le composant de page réel importe des
 * polices `next/font` (indisponibles en environnement de test Node), donc on le
 * REMPLACE par un stub. Cela permet de vérifier le DISPATCH sans charger l'arbre
 * React réel de la page.
 *
 * Vérifie :
 *  - "spirit-acs" est résolu vers SON composant (et un seul) ;
 *  - une clé inconnue / nulle / vide ne résout AUCUN site (repli standard) ;
 *  - la métadonnée renvoyée reste cohérente avec meta.ts (nom, ownShell).
 */

// Stub du composant de page Spirit : évite d'importer Oswald/next/font.
// La factory est hoistée : on ne référence donc AUCUNE variable de module ici.
vi.mock("@/components/custom-sites/spirit-acs/home-page", () => ({
  SpiritAcsHome: function SpiritAcsHomeStub() {
    return null
  },
}))

import { getCustomSiteDefinition } from "@/lib/custom-sites/registry"
import { SpiritAcsHome } from "@/components/custom-sites/spirit-acs/home-page"

describe("registry — dispatch spirit-acs", () => {
  it("résout 'spirit-acs' vers son composant de page (le stub)", () => {
    const def = getCustomSiteDefinition("spirit-acs")
    expect(def).not.toBeNull()
    expect(def?.key).toBe("spirit-acs")
    expect(def?.name).toBe("Spirit ACS")
    expect(def?.ownShell).toBe(true)
    // Même référence que le composant (mocké) importé depuis le module Spirit.
    expect(def?.Page).toBe(SpiritAcsHome)
  })

  it("tolère les espaces autour de la clé", () => {
    expect(getCustomSiteDefinition("  spirit-acs  ")?.Page).toBe(SpiritAcsHome)
  })

  it("ne charge PAS Spirit pour une clé inconnue (repli standard)", () => {
    expect(getCustomSiteDefinition("autre-entreprise")).toBeNull()
  })

  it("ne charge AUCUN site pour null / undefined / vide", () => {
    expect(getCustomSiteDefinition(null)).toBeNull()
    expect(getCustomSiteDefinition(undefined)).toBeNull()
    expect(getCustomSiteDefinition("   ")).toBeNull()
  })
})
