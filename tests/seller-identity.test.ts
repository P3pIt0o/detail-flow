import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  resolveIssuerLegalIdentityDisplay,
  buildIssuerIdentityWarning,
} from "@/lib/billing/country-profiles"

describe("resolveIssuerLegalIdentityDisplay — identité vendeur depuis le snapshot", () => {
  const legacy = { legacySiret: "12345678900012" as string | null }

  it("FR_SIREN => label SIREN", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "123456789",
      legalRegistrationScheme: "FR_SIREN",
      legacySiret: null,
    })
    expect(r).toEqual({ label: "SIREN", value: "123456789" })
  })

  it("FR_SIRET => label SIRET", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "12345678900012",
      legalRegistrationScheme: "FR_SIRET",
      legacySiret: null,
    })
    expect(r).toEqual({ label: "SIRET", value: "12345678900012" })
  })

  it("BE_BCE => label BCE", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: "BE_BCE",
      legacySiret: null,
    })
    expect(r).toEqual({ label: "BCE", value: "0123456789" })
  })

  it("CH_UID => label IDE / UID", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "CHE-123.456.789",
      legalRegistrationScheme: "CH_UID",
      legacySiret: null,
    })
    expect(r).toEqual({ label: "IDE / UID", value: "CHE-123.456.789" })
  })

  it("GENERIC => label Identifiant légal", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "X-999",
      legalRegistrationScheme: "GENERIC",
      legacySiret: null,
    })
    expect(r).toEqual({ label: "Identifiant légal", value: "X-999" })
  })

  it("numéro présent + scheme NULL => Identifiant légal (jamais deviné depuis le pays)", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: null,
      legacySiret: null,
    })
    expect(r).toEqual({ label: "Identifiant légal", value: "0123456789" })
  })

  it("legacy : numéro générique NULL + issuerSiret présent => SIRET", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      legacySiret: legacy.legacySiret,
    })
    expect(r).toEqual({ label: "SIRET", value: "12345678900012" })
  })

  it("facture BE moderne => jamais SIRET", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: "BE_BCE",
      legacySiret: "12345678900012", // même si un ancien SIRET traîne
    })
    expect(r?.label).toBe("BCE")
    expect(r?.label).not.toBe("SIRET")
  })

  it("facture CH moderne => jamais SIRET", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: "CHE-123.456.789",
      legalRegistrationScheme: "CH_UID",
      legacySiret: "12345678900012",
    })
    expect(r?.label).toBe("IDE / UID")
    expect(r?.label).not.toBe("SIRET")
  })

  it("rien de renseigné => null", () => {
    const r = resolveIssuerLegalIdentityDisplay({
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      legacySiret: null,
    })
    expect(r).toBeNull()
  })

  it("immutabilité : snapshot BE reste BCE (aucune entrée tenant possible)", () => {
    // Le helper ne reçoit QUE le snapshot facture : le tenant courant (qui
    // passerait ensuite à CH/UID) ne peut structurellement pas influencer le rendu.
    const snapshotBE = {
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: "BE_BCE",
      legacySiret: null,
    }
    expect(resolveIssuerLegalIdentityDisplay(snapshotBE)).toEqual({ label: "BCE", value: "0123456789" })
  })
})

describe("buildIssuerIdentityWarning — basé exclusivement sur le snapshot", () => {
  it("FR sans identité => warning mentionnant l'identifiant", () => {
    const w = buildIssuerIdentityWarning("FR", false)
    expect(w).toContain("SIREN / SIRET")
  })

  it("BE sans identité => warning BCE", () => {
    const w = buildIssuerIdentityWarning("BE", false)
    expect(w).toContain("BCE")
  })

  it("CH sans identité => warning IDE / UID", () => {
    const w = buildIssuerIdentityWarning("CH", false)
    expect(w).toContain("IDE / UID")
  })

  it("pays supporté mais identité présente => pas de warning", () => {
    expect(buildIssuerIdentityWarning("FR", true)).toBeNull()
  })

  it("issuerCountry NULL legacy => pas de warning (ne déduit pas FR du tenant)", () => {
    expect(buildIssuerIdentityWarning(null, false)).toBeNull()
  })

  it("pays non supporté => pas de warning", () => {
    expect(buildIssuerIdentityWarning("US", false)).toBeNull()
  })

  it("le warning n'affirme jamais la conformité", () => {
    const messages = [
      buildIssuerIdentityWarning("FR", false),
      buildIssuerIdentityWarning("BE", false),
      buildIssuerIdentityWarning("CH", false),
    ]
    for (const m of messages) {
      expect(m).not.toMatch(/garantir la conformité/i)
      expect(m).not.toMatch(/\bconforme\b/i)
      expect(m).not.toMatch(/non conforme/i)
    }
  })
})

describe("garde structurelle — le PDF ne rend plus un SIRET hardcodé", () => {
  it("pdf.tsx n'affiche pas 'SIRET : {invoice.issuerSiret}' en dur", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/invoice/pdf.tsx"), "utf8")
    expect(src).not.toMatch(/SIRET\s*:\s*\{?\s*invoice\.issuerSiret/)
    // Le rendu doit passer par le helper.
    expect(src).toContain("resolveIssuerLegalIdentityDisplay")
  })
})
