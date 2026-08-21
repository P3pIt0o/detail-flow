import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  resolveCustomerLegalIdentityDisplay,
  resolveCustomerCountryLabel,
  resolveCustomerVatDisplay,
  resolveIssuerLegalIdentityDisplay,
} from "@/lib/billing/country-profiles"

/* -------------------------------------------------------------------------- */
/*  Identité légale client                                                    */
/* -------------------------------------------------------------------------- */

describe("resolveCustomerLegalIdentityDisplay", () => {
  it("business FR + FR_SIREN => SIREN", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "business",
        customerCountry: "FR",
        legalRegistrationNumber: "123456789",
        legalRegistrationScheme: "FR_SIREN",
      }),
    ).toEqual({ label: "SIREN", value: "123456789" })
  })

  it("business FR + FR_SIRET => SIRET", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "business",
        customerCountry: "FR",
        legalRegistrationNumber: "12345678900012",
        legalRegistrationScheme: "FR_SIRET",
      }),
    ).toEqual({ label: "SIRET", value: "12345678900012" })
  })

  it("business BE => BCE", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "business",
        customerCountry: "BE",
        legalRegistrationNumber: "0123456789",
        legalRegistrationScheme: "BE_BCE",
      })?.label,
    ).toBe("BCE")
  })

  it("business CH => IDE / UID", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "business",
        customerCountry: "CH",
        legalRegistrationNumber: "CHE-123.456.789",
        legalRegistrationScheme: "CH_UID",
      })?.label,
    ).toBe("IDE / UID")
  })

  it("scheme inconnu + numéro => Identifiant légal (jamais deviné depuis le pays)", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "business",
        customerCountry: "BE",
        legalRegistrationNumber: "0123456789",
        legalRegistrationScheme: null,
      }),
    ).toEqual({ label: "Identifiant légal", value: "0123456789" })
  })

  it("individual avec champs business résiduels => aucun identifiant business", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: "individual",
        customerCountry: "BE",
        legalRegistrationNumber: "0123456789",
        legalRegistrationScheme: "BE_BCE",
      }),
    ).toBeNull()
  })

  it("customerType NULL legacy => null (aucune supposition)", () => {
    expect(
      resolveCustomerLegalIdentityDisplay({
        customerType: null,
        customerCountry: null,
        legalRegistrationNumber: "0123456789",
        legalRegistrationScheme: "BE_BCE",
      }),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Pays client                                                               */
/* -------------------------------------------------------------------------- */

describe("resolveCustomerCountryLabel — pays affiché uniquement pour BUSINESS", () => {
  it("business + BE => Belgique", () => {
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: "BE" })).toBe("Belgique")
  })

  it("business + FR => France", () => {
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: "FR" })).toBe("France")
  })

  it("business + CH => Suisse", () => {
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: "CH" })).toBe("Suisse")
  })

  it("individual + BE => null (pays masqué)", () => {
    expect(resolveCustomerCountryLabel({ customerType: "individual", customerCountry: "BE" })).toBeNull()
  })

  it("individual + FR => null (pays masqué)", () => {
    expect(resolveCustomerCountryLabel({ customerType: "individual", customerCountry: "FR" })).toBeNull()
  })

  it("customerType NULL + BE => null (legacy, aucun pays B2B)", () => {
    expect(resolveCustomerCountryLabel({ customerType: null, customerCountry: "BE" })).toBeNull()
  })

  it("customerType NULL + country NULL => null", () => {
    expect(resolveCustomerCountryLabel({ customerType: null, customerCountry: null })).toBeNull()
  })

  it("business + country NULL => null (aucun FR implicite)", () => {
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: null })).toBeNull()
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: "" })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  TVA client (identité uniquement)                                          */
/* -------------------------------------------------------------------------- */

describe("resolveCustomerVatDisplay", () => {
  it("business BE avec VAT => libellé Numéro de TVA", () => {
    expect(
      resolveCustomerVatDisplay({ customerType: "business", customerCountry: "BE", vatNumber: "BE0123456789" }),
    ).toEqual({ label: "Numéro de TVA", value: "BE0123456789" })
  })

  it("business FR avec VAT => N° TVA intracommunautaire", () => {
    expect(
      resolveCustomerVatDisplay({ customerType: "business", customerCountry: "FR", vatNumber: "FR12345678901" })?.label,
    ).toBe("N° TVA intracommunautaire")
  })

  it("business CH avec VAT => formatage suisse (suffixe TVA)", () => {
    const r = resolveCustomerVatDisplay({
      customerType: "business",
      customerCountry: "CH",
      vatNumber: "CHE-123.456.789",
    })
    expect(r?.label).toBe("Numéro de TVA")
    expect(r?.value).toBe("CHE-123.456.789 TVA")
  })

  it("individual => jamais de TVA rendue", () => {
    expect(
      resolveCustomerVatDisplay({ customerType: "individual", customerCountry: "FR", vatNumber: "FR12345678901" }),
    ).toBeNull()
  })

  it("business sans VAT => null", () => {
    expect(resolveCustomerVatDisplay({ customerType: "business", customerCountry: "FR", vatNumber: null })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Immutabilité & indépendance vendeur/client                                */
/* -------------------------------------------------------------------------- */

describe("indépendance vendeur / client", () => {
  it("vendeur FR + client BE => vendeur SIREN, client BCE", () => {
    const seller = resolveIssuerLegalIdentityDisplay({
      issuerCountry: "FR",
      legalRegistrationNumber: "123456789",
      legalRegistrationScheme: "FR_SIREN",
      legacySiret: null,
    })
    const customer = resolveCustomerLegalIdentityDisplay({
      customerType: "business",
      customerCountry: "BE",
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: "BE_BCE",
    })
    expect(seller?.label).toBe("SIREN")
    expect(customer?.label).toBe("BCE")
  })

  it("vendeur CH + client FR => vendeur UID, client SIRET", () => {
    const seller = resolveIssuerLegalIdentityDisplay({
      issuerCountry: "CH",
      legalRegistrationNumber: "CHE-123.456.789",
      legalRegistrationScheme: "CH_UID",
      legacySiret: null,
    })
    const customer = resolveCustomerLegalIdentityDisplay({
      customerType: "business",
      customerCountry: "FR",
      legalRegistrationNumber: "12345678900012",
      legalRegistrationScheme: "FR_SIRET",
    })
    expect(seller?.label).toBe("IDE / UID")
    expect(customer?.label).toBe("SIRET")
  })

  it("immutabilité : le helper ne reçoit QUE le snapshot facture (aucune fiche client)", () => {
    // Snapshot BE figé ; une modification ultérieure de la fiche client ne peut
    // structurellement pas être injectée car le helper n'a pas d'accès DB.
    const snap = {
      customerType: "business",
      customerCountry: "BE",
      legalRegistrationNumber: "0123456789",
      legalRegistrationScheme: "BE_BCE",
    }
    expect(resolveCustomerLegalIdentityDisplay(snap)).toEqual({ label: "BCE", value: "0123456789" })
  })
})

/* -------------------------------------------------------------------------- */
/*  Hardening serveur : reset B2B pour non-business (logique reproduite)       */
/* -------------------------------------------------------------------------- */

// Reproduit la règle appliquée dans saveInvoiceDraft : seul "business" conserve
// une identité pro ; individual / null => forcés à null.
function applyNonBusinessReset(customerType: string | null, fields: {
  legalNumber: string | null
  legalScheme: string | null
  vat: string | null
}) {
  if (customerType === "business") return fields
  return { legalNumber: null, legalScheme: null, vat: null }
}

describe("hardening serveur — reset identité B2B pour non-business", () => {
  it("individual => legal number / scheme / VAT forcés à null", () => {
    expect(
      applyNonBusinessReset("individual", { legalNumber: "0123456789", legalScheme: "BE_BCE", vat: "BE0123456789" }),
    ).toEqual({ legalNumber: null, legalScheme: null, vat: null })
  })

  it("null legacy => aucune identité B2B inventée", () => {
    expect(
      applyNonBusinessReset(null, { legalNumber: "0123456789", legalScheme: "BE_BCE", vat: "BE0123456789" }),
    ).toEqual({ legalNumber: null, legalScheme: null, vat: null })
  })

  it("business => conserve l'identité", () => {
    expect(
      applyNonBusinessReset("business", { legalNumber: "0123456789", legalScheme: "BE_BCE", vat: "BE0123456789" }),
    ).toEqual({ legalNumber: "0123456789", legalScheme: "BE_BCE", vat: "BE0123456789" })
  })
})

/* -------------------------------------------------------------------------- */
/*  Gardes structurelles : le rendu ne lit QUE invoice.customer*              */
/* -------------------------------------------------------------------------- */

describe("garde structurelle — rendu basé uniquement sur le snapshot", () => {
  const pdf = readFileSync(join(process.cwd(), "lib/invoice/pdf.tsx"), "utf8")
  const view = readFileSync(join(process.cwd(), "components/admin/invoice-view.tsx"), "utf8")

  it("le PDF ne requête pas la table clients au rendu", () => {
    expect(pdf).not.toMatch(/from\s+["']@\/lib\/db["']/)
    expect(pdf).not.toMatch(/\bcustomers\b/)
    expect(pdf).not.toMatch(/db\.(query|select|transaction)/)
  })

  it("InvoiceView ne requête pas la table clients au rendu", () => {
    expect(view).not.toMatch(/\bcustomers\b/)
    expect(view).not.toMatch(/db\.(query|select|transaction)/)
  })

  it("les helpers client utilisent bien les champs invoice.customer*", () => {
    expect(pdf).toMatch(/invoice\.customerType/)
    expect(pdf).toMatch(/invoice\.customerCountry/)
    expect(view).toMatch(/invoice\.customerType/)
    expect(view).toMatch(/invoice\.customerCountry/)
  })

  it("PDF + InvoiceView passent customerType à resolveCustomerCountryLabel (garde individual)", () => {
    // Le pays ne peut être rendu pour un individual/legacy que si customerType
    // est bien transmis au helper (qui retourne null hors business).
    expect(pdf).toMatch(/resolveCustomerCountryLabel\(\{[\s\S]*?customerType: invoice\.customerType/)
    expect(view).toMatch(/resolveCustomerCountryLabel\(\{[\s\S]*?customerType: invoice\.customerType/)
  })
})

/* -------------------------------------------------------------------------- */
/*  Garde de rendu : individual + customerCountry résiduel => pays masqué      */
/* -------------------------------------------------------------------------- */

describe("garde de rendu — individual avec customerCountry résiduel", () => {
  it("individual conservant un ancien pays BE => aucun pays affiché", () => {
    expect(resolveCustomerCountryLabel({ customerType: "individual", customerCountry: "BE" })).toBeNull()
  })

  it("business => pays affiché (contrôle positif)", () => {
    expect(resolveCustomerCountryLabel({ customerType: "business", customerCountry: "BE" })).toBe("Belgique")
  })
})
