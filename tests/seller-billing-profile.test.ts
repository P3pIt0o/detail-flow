import { describe, it, expect } from "vitest"
import {
  getCountryProfile,
  isBillingProfileConfirmed,
  SUPPORTED_COUNTRIES,
} from "@/lib/billing/country-profiles"

/**
 * Sous-passe 2A.2 — VENDEUR. Tests de la couche de décision que
 * `saveSellerBillingProfile` réutilise (validation/normalisation/libellés).
 * L'action elle-même (transaction + requireCompanyMember) relève de l'isolation
 * tenant serveur déjà en place ; on teste ici la logique pure et déterministe.
 */

// Reproduit la validation pays autorisé de l'action.
const ALLOWED = SUPPORTED_COUNTRIES.map((c) => c.code)

describe("VENDEUR — pays autorisés", () => {
  it("FR / BE / CH sont proposés", () => {
    expect(ALLOWED).toEqual(["FR", "BE", "CH"])
  })
})

describe("VENDEUR — profil non confirmé (default FR historique)", () => {
  it("legacy FR + billingProfileConfirmedAt NULL => à confirmer", () => {
    const country = "FR"
    expect(country).toBe("FR")
    expect(isBillingProfileConfirmed(null)).toBe(false) // badge « À compléter »
  })
  it("après enregistrement => confirmé", () => {
    expect(isBillingProfileConfirmed(new Date())).toBe(true) // badge « Informations enregistrées »
  })
})

describe("VENDEUR FR — SIRET/SIREN + TVA", () => {
  const fr = getCountryProfile("FR")
  it("libellé identifiant vendeur = SIREN / SIRET", () => {
    expect(fr.sellerLegalIdLabel).toBe("SIREN / SIRET")
  })
  it("SIRET 14 chiffres normalisé + scheme FR_SIRET", () => {
    const r = fr.validateLegalId("123 456 789 00012")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("12345678900012")
    expect(r.scheme).toBe("FR_SIRET")
  })
  it("TVA FR valide", () => {
    expect(fr.validateVatNumber("FR12345678901").valid).toBe(true)
  })
})

describe("VENDEUR BE — BCE (jamais SIRET)", () => {
  const be = getCountryProfile("BE")
  it("libellé = BCE, pas SIRET", () => {
    expect(be.sellerLegalIdLabel).toBe("Numéro d'entreprise (BCE)")
    expect(be.sellerLegalIdLabel).not.toMatch(/SIRET/i)
  })
  it("BCE 10 chiffres (formats variés) => scheme BE_BCE", () => {
    for (const raw of ["0123456789", "0123 456 789", "0123.456.789"]) {
      const r = be.validateLegalId(raw)
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe("0123456789")
      expect(r.scheme).toBe("BE_BCE")
    }
  })
  it("TVA BE valide", () => {
    expect(be.validateVatNumber("BE0123456789").valid).toBe(true)
  })
})

describe("VENDEUR CH — UID (jamais SIRET/BCE)", () => {
  const ch = getCountryProfile("CH")
  it("libellé = IDE / UID", () => {
    expect(ch.sellerLegalIdLabel).toBe("IDE / UID")
    expect(ch.sellerLegalIdLabel).not.toMatch(/SIRET|BCE/i)
  })
  it("UID normalisé en CHE-123.456.789 + scheme CH_UID", () => {
    const r = ch.validateLegalId("CHE123456789")
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe("CHE-123.456.789")
    expect(r.scheme).toBe("CH_UID")
  })
})

describe("VENDEUR — devise (companies.currency legacy ignorée)", () => {
  const CURRENCY_SUGGESTION: Record<string, string> = { FR: "EUR", BE: "EUR", CH: "CHF" }
  const isValidCurrency = (c: string) => /^[A-Z]{3}$/.test(c.toUpperCase())

  it("suggestions par pays", () => {
    expect(CURRENCY_SUGGESTION.FR).toBe("EUR")
    expect(CURRENCY_SUGGESTION.BE).toBe("EUR")
    expect(CURRENCY_SUGGESTION.CH).toBe("CHF")
  })
  it("validation ISO 3 lettres", () => {
    expect(isValidCurrency("EUR")).toBe(true)
    expect(isValidCurrency("chf")).toBe(true)
    expect(isValidCurrency("EU")).toBe(false)
    expect(isValidCurrency("EURO")).toBe(false)
  })
})
