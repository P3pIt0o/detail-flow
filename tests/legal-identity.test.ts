import { describe, it, expect } from "vitest"
import { legalConfig, legalEditorName, DATA_PROCESSORS, LEGAL_MISSING_INFO } from "@/config/legal"

/**
 * Vérifie l'identité légale finale de l'exploitant DetailFlow et l'audit
 * d'hébergement (Vercel = application, Infomaniak = domaine/messagerie).
 */
describe("legal identity — DetailFlow / Clément Roig EI", () => {
  it("exploitant = Clément Roig", () => {
    expect(legalConfig.legalBusinessName).toBe("Clément Roig")
    expect(legalEditorName).toBe("Clément Roig")
  })

  it("forme juridique = entrepreneur individuel (EI)", () => {
    expect(legalConfig.legalForm).toMatch(/entrepreneur individuel/i)
    expect(legalConfig.legalForm).toContain("EI")
  })

  it("responsable de la publication renseigné", () => {
    expect(legalConfig.publicationDirector).toBe("Clément Roig")
  })

  it("identité française correcte (SIREN, SIRET, RCS Bourg-en-Bresse)", () => {
    expect(legalConfig.siren).toBe("931 535 587")
    expect(legalConfig.siret).toBe("931 535 587 00014")
    expect(legalConfig.rcs).toMatch(/Bourg-en-Bresse/)
  })

  it("adresse française à Chevry (01)", () => {
    expect(legalConfig.address.city).toBe("Chevry")
    expect(legalConfig.address.postalCode).toBe("01170")
    expect(legalConfig.address.country).toBe("France")
    expect(legalConfig.addressLine).toContain("243 rue la Pièce")
  })

  it("aucune ancienne adresse genevoise pour DetailFlow / SiteAlpha", () => {
    expect(legalConfig.addressLine).not.toMatch(/Genève|Carl-Vogt|1205/i)
    expect(legalConfig.technicalManager.address).not.toMatch(/Genève|Carl-Vogt|1205/i)
    expect(legalConfig.developer.address).not.toMatch(/Genève|Carl-Vogt|1205/i)
  })

  it("aucun IDE/UID suisse attribué à DetailFlow (l'IDE reste celui d'Infomaniak)", () => {
    // DetailFlow lui-même ne porte pas d'IDE suisse.
    expect(legalConfig).not.toHaveProperty("ide")
    // L'IDE présent appartient bien à l'hébergeur Infomaniak, pas à l'exploitant.
    expect(legalConfig.host.ide).toMatch(/^CHE-/)
  })

  it("TVA non renseignée tant qu'elle n'est pas confirmée", () => {
    expect(legalConfig.vatNumber).toBeNull()
  })

  it("SiteAlpha présenté comme agence web du même exploitant (pas société distincte)", () => {
    expect(legalConfig.technicalManager.name).toBe("SiteAlpha")
    expect(legalConfig.technicalManager.role).toMatch(/agence web/i)
    expect(legalConfig.technicalManager.address).toBe(legalConfig.addressLine)
    expect(legalConfig.technicalManager.website).toBe("https://www.sitealpha.ch")
  })
})

describe("hosting audit — Vercel (app) vs Infomaniak (domaine/messagerie)", () => {
  it("hébergeur applicatif = Vercel", () => {
    expect(legalConfig.appHost.name).toBe("Vercel Inc.")
    expect(legalConfig.appHost.role).toMatch(/h[ée]bergement|diffusion/i)
  })

  it("Infomaniak limité au domaine et à la messagerie (pas hébergeur applicatif)", () => {
    expect(legalConfig.host.name).toBe("Infomaniak Network SA")
    expect(legalConfig.host.role).toMatch(/domaine|messagerie/i)
  })

  it("liste des sous-traitants : Vercel héberge l'application", () => {
    const vercel = DATA_PROCESSORS.find((p) => p.name.includes("Vercel"))
    expect(vercel).toBeDefined()
    expect(vercel?.purpose).toMatch(/h[ée]bergement/i)
  })

  it("aucune mention publique de v0 dans la config légale", () => {
    const serialized = JSON.stringify({ legalConfig, DATA_PROCESSORS, LEGAL_MISSING_INFO })
    expect(serialized).not.toMatch(/\bv0\b/i)
  })
})
