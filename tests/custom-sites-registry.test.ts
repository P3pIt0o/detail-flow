import { describe, it, expect } from "vitest"

/**
 * Lot 1 — Registre des sites personnalisés (fonctions pures, registre RÉEL).
 *
 * Le registre est volontairement vide dans ce lot : on vérifie donc surtout le
 * REFUS d'une clé inconnue et le traitement sûr d'une valeur nulle/vide.
 */

import {
  isRegisteredCustomSiteKey,
  getCustomSiteDefinition,
  customSiteLabel,
  listRegisteredCustomSites,
} from "@/lib/custom-sites/registry"

describe("registre — clé inconnue refusée", () => {
  it("isRegisteredCustomSiteKey renvoie false pour une clé inconnue", () => {
    expect(isRegisteredCustomSiteKey("spirit-acs")).toBe(false)
    expect(isRegisteredCustomSiteKey("n-importe-quoi")).toBe(false)
  })

  it("getCustomSiteDefinition renvoie null pour une clé inconnue", () => {
    expect(getCustomSiteDefinition("spirit-acs")).toBeNull()
  })

  it("customSiteLabel renvoie null pour une clé inconnue", () => {
    expect(customSiteLabel("spirit-acs")).toBeNull()
  })
})

describe("registre — valeur nulle/vide (site standard)", () => {
  it("null / undefined / vide => non enregistré, définition null", () => {
    expect(isRegisteredCustomSiteKey(null)).toBe(false)
    expect(isRegisteredCustomSiteKey(undefined)).toBe(false)
    expect(isRegisteredCustomSiteKey("   ")).toBe(false)
    expect(getCustomSiteDefinition(null)).toBeNull()
    expect(customSiteLabel(null)).toBeNull()
  })
})

describe("registre — état initial vide", () => {
  it("listRegisteredCustomSites() est un tableau (vide dans ce lot)", () => {
    expect(Array.isArray(listRegisteredCustomSites())).toBe(true)
    expect(listRegisteredCustomSites()).toHaveLength(0)
  })
})
