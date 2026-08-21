import { describe, it, expect } from "vitest"
import { getCountryProfile, resolveIssuerBillingSnapshot } from "@/lib/billing/country-profiles"

/**
 * Hardening PR #71 (LOT 2A). Tests de régression des 4 correctifs :
 *  1. vendeur non confirmé => aucun snapshot multi-pays FR ;
 *  2. fallback invoiceSiret réservé au FR confirmé ;
 *  3. client BUSINESS => pays obligatoire (profil GENERIC si vide, jamais FR) ;
 *  4. validation TVA suisse sans troncation.
 */

/* ------------------------- 1. VENDEUR NON CONFIRMÉ ------------------------ */

describe("VENDEUR legacy non confirmé", () => {
  it("companies.country=FR historique + confirmedAt NULL => aucun snapshot FR", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: false,
      companyCountry: "FR", // valeur historique par défaut
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: "12345678900012",
      vatNumber: "FR12345678901",
      sellerDefaultCurrency: null,
      invoiceCurrency: null,
    })
    expect(snap.issuerCountry).toBeNull()
    expect(snap.issuerLegalRegistrationNumber).toBeNull()
    expect(snap.issuerLegalRegistrationScheme).toBeNull()
    expect(snap.issuerVatNumber).toBeNull()
    // Devise non dérivée d'un pays non confirmé.
    expect(snap.currencyCode).toBeNull()
  })

  it("non confirmé mais devise déjà posée sur la facture => conservée", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: false,
      companyCountry: "BE",
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: null,
      vatNumber: null,
      sellerDefaultCurrency: null,
      invoiceCurrency: "EUR",
    })
    expect(snap.issuerCountry).toBeNull()
    expect(snap.currencyCode).toBe("EUR")
  })
})

/* -------------------- 2. FALLBACK invoiceSiret FR ONLY -------------------- */

describe("Fallback invoiceSiret réservé au FR confirmé", () => {
  it("BE confirmé + invoiceSiret présent => JAMAIS repris comme BCE", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: true,
      companyCountry: "BE",
      legalRegistrationNumber: null, // nouveau générique absent
      legalRegistrationScheme: null,
      invoiceSiret: "12345678900012",
      vatNumber: null,
      sellerDefaultCurrency: null,
      invoiceCurrency: null,
    })
    expect(snap.issuerCountry).toBe("BE")
    expect(snap.issuerLegalRegistrationNumber).toBeNull()
    expect(snap.issuerLegalRegistrationScheme).toBeNull()
    expect(snap.currencyCode).toBe("EUR") // suggestion pays confirmé
  })

  it("CH confirmé + invoiceSiret présent => JAMAIS repris comme UID", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: true,
      companyCountry: "CH",
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: "12345678900012",
      vatNumber: null,
      sellerDefaultCurrency: null,
      invoiceCurrency: null,
    })
    expect(snap.issuerLegalRegistrationNumber).toBeNull()
    expect(snap.currencyCode).toBe("CHF")
  })

  it("FR confirmé + générique absent + invoiceSiret présent => fallback FR autorisé", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: true,
      companyCountry: "FR",
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: "12345678900012",
      vatNumber: "FR12345678901",
      sellerDefaultCurrency: null,
      invoiceCurrency: null,
    })
    expect(snap.issuerCountry).toBe("FR")
    expect(snap.issuerLegalRegistrationNumber).toBe("12345678900012")
    expect(snap.issuerLegalRegistrationScheme).toBe("FR_SIRET") // 14 chiffres
    expect(snap.issuerVatNumber).toBe("FR12345678901")
  })

  it("NON confirmé + sellerDefaultCurrency présent => currencyCode null (devise vendeur ignorée)", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: false,
      companyCountry: "FR",
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: "12345678900012",
      vatNumber: null,
      sellerDefaultCurrency: "CHF",
      invoiceCurrency: null,
    })
    expect(snap.currencyCode).toBeNull()
  })

  it("NON confirmé + invoiceCurrency existante => conservée", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: false,
      companyCountry: "FR",
      legalRegistrationNumber: null,
      legalRegistrationScheme: null,
      invoiceSiret: null,
      vatNumber: null,
      sellerDefaultCurrency: "CHF",
      invoiceCurrency: "EUR",
    })
    expect(snap.currencyCode).toBe("EUR")
  })

  it("FR confirmé + identifiant générique présent => prioritaire sur invoiceSiret", () => {
    const snap = resolveIssuerBillingSnapshot({
      confirmed: true,
      companyCountry: "FR",
      legalRegistrationNumber: "123456789", // SIREN
      legalRegistrationScheme: "FR_SIREN",
      invoiceSiret: "12345678900012",
      vatNumber: null,
      sellerDefaultCurrency: "EUR",
      invoiceCurrency: null,
    })
    expect(snap.issuerLegalRegistrationNumber).toBe("123456789")
    expect(snap.issuerLegalRegistrationScheme).toBe("FR_SIREN")
  })
})

/* ------------------ 3. CLIENT BUSINESS — PAYS OBLIGATOIRE ----------------- */

describe("CLIENT — pays vide utilise GENERIC (jamais FR)", () => {
  it("getCountryProfile('OTHER') => GENERIC, libellés non FR", () => {
    const p = getCountryProfile("OTHER")
    expect(p.countryCode).toBe("GENERIC")
    expect(p.customerLegalIdLabel).not.toMatch(/SIREN|SIRET/)
  })

  it("GENERIC accepte un identifiant libre (aucune prétention de conformité)", () => {
    const p = getCountryProfile("OTHER")
    expect(p.validateLegalId("ABC-123").valid).toBe(true)
    expect(p.validateLegalId("ABC-123").scheme).toBe("GENERIC")
  })
})

/* ----------------------- 4. VALIDATION TVA SUISSE ------------------------ */

describe("SUISSE — TVA sans troncation silencieuse", () => {
  const ch = getCountryProfile("CH")
  const canonical = "CHE-123.456.789"

  it.each([
    "CHE123456789",
    "CHE-123.456.789",
    "CHE-123.456.789 TVA",
    "CHE-123.456.789 MWST",
    "CHE-123.456.789 IVA",
  ])("accepte %s et normalise en canonique", (input) => {
    const r = ch.validateVatNumber(input)
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe(canonical)
  })

  it.each(["CHE-123.456.789999", "CHE12345678999"])("refuse %s (chiffres en trop, pas de troncation)", (input) => {
    const r = ch.validateVatNumber(input)
    expect(r.valid).toBe(false)
  })

  it("normalizeVatNumber ne tronque pas un excédent", () => {
    expect(ch.normalizeVatNumber("CHE-123.456.789999")).not.toBe(canonical)
  })
})
