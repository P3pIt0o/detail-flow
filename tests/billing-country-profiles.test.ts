import { describe, it, expect } from "vitest"
import {
  getCountryProfile,
  resolveCustomerType,
  formatSwissVatForDisplay,
  isBillingProfileConfirmed,
} from "@/lib/billing/country-profiles"

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
  it("TVA suisse : stockage CANONIQUE sans suffixe linguistique", () => {
    // Toutes les saisies (TVA/MWST/IVA, avec/sans ponctuation) => même canonique.
    for (const raw of ["CHE123456789 TVA", "CHE-123.456.789 MWST", "CHE-123.456.789 IVA", "CHE123456789"]) {
      const r = ch.validateVatNumber(raw)
      expect(r.valid).toBe(true)
      expect(r.normalized).toBe("CHE-123.456.789")
    }
  })
  it("legalRegistrationNumber et vatNumber partagent la forme canonique CHE-...", () => {
    expect(ch.normalizeLegalId("CHE123456789")).toBe("CHE-123.456.789")
    expect(ch.normalizeVatNumber("CHE-123.456.789 TVA")).toBe("CHE-123.456.789")
  })
  it("affichage : suffixe TVA ajouté seulement au rendu", () => {
    expect(formatSwissVatForDisplay("CHE-123.456.789")).toBe("CHE-123.456.789 TVA")
    expect(formatSwissVatForDisplay("")).toBe("")
  })
  it("format invalide => refus", () => {
    expect(ch.validateLegalId("CHE-12").valid).toBe(false)
  })
})

describe("Pays confirmé — default FR historique ≠ choix confirmé", () => {
  it("billingProfileConfirmedAt NULL => profil NON confirmé (à confirmer)", () => {
    expect(isBillingProfileConfirmed(null)).toBe(false)
    expect(isBillingProfileConfirmed(undefined)).toBe(false)
  })
  it("tenant historique country=FR non confirmé => pas un profil légal FR confirmé", () => {
    // Le pays opérationnel peut être FR (default) sans confirmation du pro.
    const country = "FR"
    const confirmed = isBillingProfileConfirmed(null)
    expect(country).toBe("FR")
    expect(confirmed).toBe(false) // ne jamais traiter comme profil légal FR confirmé
  })
  it("confirmation renseignée => profil confirmé", () => {
    expect(isBillingProfileConfirmed(new Date())).toBe(true)
  })
})

describe("Type de client — NULL n'est jamais B2C", () => {
  it("NULL / undefined / inconnu => unknown (jamais individual)", () => {
    expect(resolveCustomerType(null)).toBe("unknown")
    expect(resolveCustomerType(undefined)).toBe("unknown")
    expect(resolveCustomerType("")).toBe("unknown")
    expect(resolveCustomerType("legacy")).toBe("unknown")
  })
  it("valeurs explicites préservées", () => {
    expect(resolveCustomerType("individual")).toBe("individual")
    expect(resolveCustomerType("business")).toBe("business")
  })
})

describe("Devise legacy — EUR par défaut n'écrase pas une confirmation CHF", () => {
  // Reproduit la chaîne de résolution d'émission (sans companies.currency legacy).
  const resolveIssueCurrency = (
    invoiceCurrency: string | null,
    settingsDefaultCurrency: string | null,
    issuerCountry: string,
  ) => invoiceCurrency ?? settingsDefaultCurrency ?? getCountryProfile(issuerCountry).defaultCurrency

  it("tenant CH sans confirmation => suggestion CHF (pas EUR legacy)", () => {
    expect(resolveIssueCurrency(null, null, "CH")).toBe("CHF")
  })
  it("confirmation CHF explicite prioritaire", () => {
    expect(resolveIssueCurrency(null, "CHF", "CH")).toBe("CHF")
  })
  it("devise déjà posée sur la facture est conservée", () => {
    expect(resolveIssueCurrency("USD", "CHF", "CH")).toBe("USD")
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
