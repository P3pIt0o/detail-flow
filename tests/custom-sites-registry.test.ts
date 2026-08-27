import { describe, it, expect } from "vitest"

/**
 * Registre des sites personnalisés — métadonnées PURES (`lib/custom-sites/meta`).
 *
 * On teste ici la SOURCE DE VÉRITÉ des clés (pas les composants de page, qui
 * vivent dans `registry.ts` côté serveur). Depuis le lot Spirit, la clé
 * "spirit-acs" est enregistrée ; toute autre clé retombe sur le site standard.
 */

import {
  isRegisteredCustomSiteKey,
  getCustomSiteMeta,
  customSiteLabel,
  listRegisteredCustomSites,
} from "@/lib/custom-sites/meta"

describe("meta — clé inconnue refusée (repli site standard)", () => {
  it("isRegisteredCustomSiteKey renvoie false pour une clé inconnue", () => {
    expect(isRegisteredCustomSiteKey("n-importe-quoi")).toBe(false)
  })

  it("getCustomSiteMeta renvoie null pour une clé inconnue", () => {
    expect(getCustomSiteMeta("n-importe-quoi")).toBeNull()
  })

  it("customSiteLabel renvoie null pour une clé inconnue", () => {
    expect(customSiteLabel("n-importe-quoi")).toBeNull()
  })
})

describe("meta — valeur nulle/vide (site standard)", () => {
  it("null / undefined / vide => non enregistré, métadonnée null", () => {
    expect(isRegisteredCustomSiteKey(null)).toBe(false)
    expect(isRegisteredCustomSiteKey(undefined)).toBe(false)
    expect(isRegisteredCustomSiteKey("   ")).toBe(false)
    expect(getCustomSiteMeta(null)).toBeNull()
    expect(customSiteLabel(null)).toBeNull()
  })
})

describe("meta — spirit-acs enregistré", () => {
  it("isRegisteredCustomSiteKey('spirit-acs') est true (clé tolérante aux espaces)", () => {
    expect(isRegisteredCustomSiteKey("spirit-acs")).toBe(true)
    expect(isRegisteredCustomSiteKey("  spirit-acs  ")).toBe(true)
  })

  it("customSiteLabel expose le nom lisible attendu", () => {
    expect(customSiteLabel("spirit-acs")).toBe("Spirit ACS")
  })

  it("listRegisteredCustomSites contient spirit-acs", () => {
    const list = listRegisteredCustomSites()
    expect(list).toEqual(expect.arrayContaining([{ key: "spirit-acs", name: "Spirit ACS" }]))
  })
})
