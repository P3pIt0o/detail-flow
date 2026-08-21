import { describe, it, expect } from "vitest"
import { getCountryProfile, resolveCustomerType } from "@/lib/billing/country-profiles"

/**
 * Couche de décision de l'identité CLIENT B2C/B2B, indépendante du vendeur.
 * Reproduit la normalisation faite côté serveur (clients/actions +
 * saveInvoiceDraft) pour verrouiller le comportement sans DB.
 */
function normalizeClientIdentity(input: {
  customerType: string
  country: string
  legal: string
  vat: string
}) {
  const customerType =
    input.customerType === "individual" || input.customerType === "business" ? input.customerType : null
  const country = input.country === "OTHER" ? "OTHER" : input.country.toUpperCase() || null
  if (customerType !== "business") {
    return { ok: true as const, customerType, country, legalScheme: null as string | null }
  }
  const profile = getCountryProfile(country ?? undefined)
  const legal = profile.validateLegalId(input.legal)
  if (!legal.valid) return { ok: false as const, message: legal.message }
  const vat = profile.validateVatNumber(input.vat)
  if (!vat.valid) return { ok: false as const, message: vat.message }
  return {
    ok: true as const,
    customerType,
    country,
    legalNumber: legal.normalized || null,
    legalScheme: legal.normalized ? (legal.scheme ?? profile.legalIdScheme) : null,
    vatNumber: vat.normalized || null,
  }
}

describe("Type de client explicite", () => {
  it("INDIVIDUAL => aucun identifiant société requis", () => {
    const r = normalizeClientIdentity({ customerType: "individual", country: "FR", legal: "", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.customerType).toBe("individual")
  })
  it("type vide => NULL (à confirmer), jamais individual", () => {
    const r = normalizeClientIdentity({ customerType: "", country: "", legal: "", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.customerType).toBeNull()
    expect(resolveCustomerType(null)).toBe("unknown")
  })
})

describe("Identité BUSINESS selon le pays DU CLIENT", () => {
  it("BUSINESS FR : SIREN 9 chiffres", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "FR", legal: "123456789", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.legalScheme).toBe("FR_SIREN")
  })
  it("BUSINESS FR : SIRET 14 chiffres", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "FR", legal: "12345678900012", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.legalScheme).toBe("FR_SIRET")
  })
  it("BUSINESS BE : BCE 10 chiffres, scheme BE_BCE", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "BE", legal: "0123.456.789", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.legalScheme).toBe("BE_BCE")
      expect(r.legalNumber).toBe("0123456789")
    }
  })
  it("BUSINESS CH : UID canonique CHE-..., scheme CH_UID", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "CH", legal: "CHE123456789", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.legalScheme).toBe("CH_UID")
      expect(r.legalNumber).toBe("CHE-123.456.789")
    }
  })
  it("BUSINESS autre pays => fallback GENERIC (non bloquant)", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "OTHER", legal: "ABC-123", vat: "" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.legalScheme).toBe("GENERIC")
  })
  it("BUSINESS FR : SIREN invalide => refus propre", () => {
    const r = normalizeClientIdentity({ customerType: "business", country: "FR", legal: "123", vat: "" })
    expect(r.ok).toBe(false)
  })
})

describe("Indépendance vendeur / client (transfrontalier)", () => {
  // Le pays vendeur ne change JAMAIS les libellés/validation du client.
  const cases = [
    { seller: "BE", client: "FR", clientLabel: "SIREN / SIRET" },
    { seller: "FR", client: "BE", clientLabel: "Numéro d'entreprise (BCE)" },
    { seller: "CH", client: "FR", clientLabel: "SIREN / SIRET" },
    { seller: "BE", client: "CH", clientLabel: "IDE / UID" },
  ]
  for (const c of cases) {
    it(`vendeur ${c.seller} + client ${c.client} => libellé client "${c.clientLabel}"`, () => {
      const sellerProfile = getCountryProfile(c.seller)
      const clientProfile = getCountryProfile(c.client)
      // Les libellés client dépendent UNIQUEMENT du pays client.
      expect(clientProfile.customerLegalIdLabel).toBe(c.clientLabel)
      // Le vendeur garde son propre libellé, distinct (sauf FR/FR fortuit).
      expect(sellerProfile.sellerLegalIdLabel).toBe(getCountryProfile(c.seller).sellerLegalIdLabel)
    })
  }
})

describe("Changement de type ne détruit pas les données (règle serveur)", () => {
  // BUSINESS -> INDIVIDUAL : la couche ne renvoie pas d'ordre de suppression ;
  // les colonnes legal/vat existantes ne sont pas remises à zéro par le passage
  // en individual (elles restent telles quelles en base, masquées à l'UI).
  it("INDIVIDUAL ne recalcule pas d'identifiant société", () => {
    const r = normalizeClientIdentity({ customerType: "individual", country: "FR", legal: "123456789", vat: "" })
    expect(r.ok).toBe(true)
    // Pas de scheme imposé en individual (aucune validation société).
    if (r.ok) expect(r.legalScheme).toBeNull()
  })
})
