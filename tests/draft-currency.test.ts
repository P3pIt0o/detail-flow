import { describe, it, expect } from "vitest"
import { resolveDraftCurrency, resolveIssuerBillingSnapshot } from "@/lib/billing/country-profiles"

/**
 * LOT 2B.1 hardening — devise figée dès la création du brouillon
 * (createInvoiceFromBooking). Logique pure testée via resolveDraftCurrency,
 * immutabilité via resolveIssuerBillingSnapshot (priorité invoiceCurrency).
 */
describe("resolveDraftCurrency — snapshot devise au brouillon", () => {
  it("1. profil confirmé + defaultCurrency CHF => brouillon CHF", () => {
    expect(resolveDraftCurrency(true, "CHF")).toBe("CHF")
  })

  it("2. profil confirmé + defaultCurrency EUR => brouillon EUR", () => {
    expect(resolveDraftCurrency(true, "EUR")).toBe("EUR")
  })

  it("3. profil NON confirmé + defaultCurrency CHF => null (aucune déduction)", () => {
    expect(resolveDraftCurrency(false, "CHF")).toBeNull()
  })

  it("3b. profil confirmé mais defaultCurrency absent/vide => null (rien inventé)", () => {
    expect(resolveDraftCurrency(true, null)).toBeNull()
    expect(resolveDraftCurrency(true, "")).toBeNull()
    expect(resolveDraftCurrency(true, "   ")).toBeNull()
  })

  it("normalise en majuscules", () => {
    expect(resolveDraftCurrency(true, "chf")).toBe("CHF")
  })
})

describe("immutabilité devise brouillon -> émission", () => {
  const base = {
    confirmed: true,
    companyCountry: "CH",
    legalRegistrationNumber: null,
    legalRegistrationScheme: null,
    invoiceSiret: null,
    vatNumber: null,
  }

  it("4. brouillon créé en CHF, defaultCurrency devient EUR => facture reste CHF", () => {
    // La facture porte déjà CHF ; le vendeur a changé sa devise en EUR.
    const snap = resolveIssuerBillingSnapshot({
      ...base,
      sellerDefaultCurrency: "EUR", // nouvelle devise vendeur
      invoiceCurrency: "CHF", // snapshot déjà posé sur le brouillon
    })
    expect(snap.currencyCode).toBe("CHF")
  })

  it("5. issueInvoice sur facture ayant déjà CHF => conserve CHF", () => {
    const snap = resolveIssuerBillingSnapshot({
      ...base,
      sellerDefaultCurrency: null,
      invoiceCurrency: "CHF",
    })
    expect(snap.currencyCode).toBe("CHF")
  })
})
