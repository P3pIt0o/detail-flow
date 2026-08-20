import { describe, it, expect } from "vitest"
import { getCountryProfile } from "@/lib/billing/country-profiles"

/**
 * LOT 2A — sous-étape 1 (fondations) : abstraction CountryBillingProfile.
 *
 * Tests PURS de forme (normalisation + validation), aucune écriture DB, aucun
 * appel réseau (pas de VIES/officiel). On vérifie l'INDÉPENDANCE des parties :
 * le profil dépend uniquement du pays de la partie considérée (vendeur OU
 * client), jamais de l'autre.
 */

describe("Identité vendeur — libellés par pays", () => {
  it("FR => SIRET, BE => BCE, CH => IDE/UID (jamais mélangés)", () => {
    expect(getCountryProfile("FR").sellerLegalIdLabel).toMatch(/SIRET/)
    expect(getCountryProfile("BE").sellerLegalIdLabel).toMatch(/BCE/)
    expect(getCountryProfile("CH").sellerLegalIdLabel).toMatch(/IDE|UID/)
    // Un vendeur belge n'affiche jamais "SIRET".
    expect(getCountryProfile("BE").sellerLegalIdLabel).not.toMatch(/SIRET/)
    // Un vendeur suisse n'affiche ni SIRET ni BCE.
    expect(getCountryProfile("CH").sellerLegalIdLabel).not.toMatch(/SIRET|BCE/)
  })

  it("devise par défaut : FR/BE => EUR, CH => CHF", () => {
    expect(getCountryProfile("FR").defaultCurrency).toBe("EUR")
    expect(getCountryProfile("BE").defaultCurrency).toBe("EUR")
    expect(getCountryProfile("CH").defaultCurrency).toBe("CHF")
  })
})

describe("France — SIREN / SIRET / TVA", () => {
  const fr = getCountryProfile("FR")
  it("SIREN = 9 chiffres", () => {
    const r = fr.validateLegalId("732 829 320")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("732829320")
    expect(r.scheme).toBe("FR_SIREN")
  })
  it("SIRET = 14 chiffres", () => {
    const r = fr.validateLegalId("732 829 320 00074")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("73282932000074")
    expect(r.scheme).toBe("FR_SIRET")
  })
  it("longueur invalide => refus", () => {
    expect(fr.validateLegalId("1234").valid).toBe(false)
  })
  it("TVA FR = FR + 11 caractères", () => {
    expect(fr.validateVatNumber("FR 40 732829320").valid).toBe(true)
    expect(fr.validateVatNumber("BE0123456789").valid).toBe(false)
  })
})

describe("Belgique — BCE / TVA", () => {
  const be = getCountryProfile("BE")
  it("BCE = 10 chiffres (formats variés acceptés)", () => {
    for (const raw of ["0123456789", "0123 456 789", "0123.456.789"]) {
      const r = be.validateLegalId(raw)
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe("0123456789")
      expect(r.scheme).toBe("BE_BCE")
    }
  })
  it("TVA BE = BE + 10 chiffres", () => {
    expect(be.validateVatNumber("BE 0123.456.789").valid).toBe(true)
    expect(be.validateVatNumber("FR12345678901").valid).toBe(false)
  })
  it("non assujetti => TVA vide acceptée (non requise)", () => {
    expect(be.validateVatNumber("", false).valid).toBe(true)
  })
})

describe("Suisse — IDE/UID / TVA", () => {
  const ch = getCountryProfile("CH")
  it("UID reformaté en CHE-123.456.789", () => {
    const r = ch.validateLegalId("CHE123456789")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("CHE-123.456.789")
    expect(r.scheme).toBe("CH_UID")
  })
  it("TVA suisse conserve le suffixe TVA", () => {
    const r = ch.validateVatNumber("CHE-123.456.789 TVA")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("CHE-123.456.789 TVA")
  })
  it("format invalide => refus", () => {
    expect(ch.validateLegalId("CHE-12").valid).toBe(false)
  })
})

describe("Transfrontalier — indépendance vendeur / client", () => {
  // Le profil d'une partie ne dépend QUE de son pays.
  it("vendeur BE + client FR : chacun ses identifiants", () => {
    const seller = getCountryProfile("BE")
    const customer = getCountryProfile("FR")
    expect(seller.validateLegalId("0123456789").scheme).toBe("BE_BCE")
    expect(customer.validateLegalId("73282932000074").scheme).toBe("FR_SIRET")
  })
  it("vendeur CH + client FR", () => {
    expect(getCountryProfile("CH").validateLegalId("CHE123456789").scheme).toBe("CH_UID")
    expect(getCountryProfile("FR").validateLegalId("732829320").scheme).toBe("FR_SIREN")
  })
})

describe("Fallback GENERIC (autres pays préparés)", () => {
  const g = getCountryProfile("DE")
  it("pays non supporté => GENERIC, aucune validation stricte", () => {
    expect(g.countryCode).toBe("GENERIC")
    const r = g.validateLegalId("HRB 12345")
    expect(r.valid).toBe(true)
    expect(r.scheme).toBe("GENERIC")
  })
  it("code vide => défaut FR (rétrocompat historique)", () => {
    expect(getCountryProfile(null).countryCode).toBe("FR")
  })
})
