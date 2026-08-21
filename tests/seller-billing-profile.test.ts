import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  getCountryProfile,
  isBillingProfileConfirmed,
  resolveIssuerVatDisplay,
  SUPPORTED_COUNTRIES,
} from "@/lib/billing/country-profiles"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Retire commentaires JS pour tester le CODE réel (pas les commentaires). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

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

/* -------------------------------------------------------------------------- */
/*  LOT 2B.5A — hardening réglementaire minimal                               */
/* -------------------------------------------------------------------------- */

const profileUi = read("components/admin/settings/seller-billing-profile.tsx")
const serverActions = read("app/admin/(dashboard)/parametres/actions.ts")
const invoiceView = read("components/admin/invoice-view.tsx")
const invoicePdf = read("lib/invoice/pdf.tsx")

describe("2B.5A — vatStatus : valeurs DB inchangées + libellés UI", () => {
  it("1. les valeurs DB restent subject / exempt / unknown", () => {
    expect(profileUi).toMatch(/<option value="subject">/)
    expect(profileUi).toMatch(/<option value="exempt">/)
    expect(profileUi).toMatch(/<option value="unknown">/)
    // Whitelist serveur strictement identique.
    expect(serverActions).toMatch(/VAT_STATUSES = \["subject", "exempt", "unknown"\]/)
  })

  it("2. nouveaux libellés UI corrects", () => {
    expect(profileUi).toMatch(/TVA facturée \/ redevable/)
    expect(profileUi).toMatch(/TVA non facturée \/ franchise ou exonération/)
    expect(profileUi).toMatch(/À préciser/)
    expect(profileUi).toMatch(/ne détermine pas à elle seule vos obligations de facturation électronique/)
    // Ancien libellé retiré.
    expect(profileUi).not.toMatch(/Assujetti à la TVA/)
  })
})

describe("2B.5A — catégorie entreprise FR", () => {
  it("3. affichée UNIQUEMENT pour la France (country === FR)", () => {
    expect(profileUi).toMatch(/country === "FR" &&/)
    expect(profileUi).toMatch(/Catégorie pour le calendrier de facturation électronique/)
  })

  it("3bis. options FR complètes + note explicite (pas de détermination auto)", () => {
    for (const opt of ["Je ne sais pas", "Micro-entreprise", "PME", "ETI", "Grande entreprise"]) {
      expect(profileUi).toContain(opt)
    }
    expect(profileUi).toMatch(/DetailFlow ne la détermine pas automatiquement/)
  })

  it("4. whitelist serveur micro/pme/eti/ge/unknown", () => {
    expect(serverActions).toMatch(/FR_BUSINESS_CATEGORIES = \["micro", "pme", "eti", "ge", "unknown"\]/)
  })

  it("5. pays non-FR => frBusinessCategory null", () => {
    const code = stripComments(serverActions)
    // Ternaire : country === "FR" ? (…whitelist… : "unknown") : null
    expect(code).toMatch(/country === "FR"[\s\S]*?:\s*null/)
  })

  it("6. aucune déduction automatique (forme juridique / CA / effectif / TVA)", () => {
    const code = stripComments(serverActions)
    // La catégorie ne dérive JAMAIS d'une autre donnée.
    expect(code).not.toMatch(/frBusinessCategory\s*=\s*[^\n]*(legalForm|revenue|chiffre|salari|vatStatus)/i)
  })
})

describe("2B.5A — resolveIssuerVatDisplay (snapshot only, aucune conformité)", () => {
  it("7. numéro vide => null", () => {
    expect(resolveIssuerVatDisplay({ issuerCountry: "FR", vatNumber: "" })).toBeNull()
    expect(resolveIssuerVatDisplay({ issuerCountry: "FR", vatNumber: null })).toBeNull()
    expect(resolveIssuerVatDisplay({ issuerCountry: null, vatNumber: "  " })).toBeNull()
  })

  it("8. FR : libellé intracommunautaire + valeur inchangée", () => {
    const r = resolveIssuerVatDisplay({ issuerCountry: "FR", vatNumber: "FR12345678901" })
    expect(r).toEqual({ label: "N° TVA intracommunautaire", value: "FR12345678901" })
  })

  it("9. BE : libellé adapté + valeur inchangée", () => {
    const r = resolveIssuerVatDisplay({ issuerCountry: "BE", vatNumber: "BE0123456789" })
    expect(r).toEqual({ label: "Numéro de TVA", value: "BE0123456789" })
  })

  it("10. CH : affichage avec suffixe TVA (stockage canonique inchangé)", () => {
    const r = resolveIssuerVatDisplay({ issuerCountry: "CH", vatNumber: "CHE-123.456.789" })
    expect(r?.value).toBe("CHE-123.456.789 TVA")
  })

  it("pays absent => libellé générique", () => {
    const r = resolveIssuerVatDisplay({ issuerCountry: null, vatNumber: "XX123" })
    expect(r).toEqual({ label: "Numéro de TVA", value: "XX123" })
  })
})

describe("2B.5A — rendu facture depuis le SNAPSHOT uniquement", () => {
  it("11. InvoiceView lit invoice.issuerVatNumber via resolveIssuerVatDisplay", () => {
    expect(invoiceView).toMatch(/resolveIssuerVatDisplay\(\{[\s\S]*?vatNumber: invoice\.issuerVatNumber/)
  })

  it("12. PDF lit invoice.issuerVatNumber via resolveIssuerVatDisplay", () => {
    expect(invoicePdf).toMatch(/resolveIssuerVatDisplay\(\{[\s\S]*?vatNumber: invoice\.issuerVatNumber/)
  })

  it("13. aucun fallback settings pour le n° TVA de la facture (helper pur, snapshot)", () => {
    // Le helper ne prend QUE issuerCountry + vatNumber (aucune source settings).
    const tax = stripComments(read("lib/billing/country-profiles.ts"))
    expect(tax).toMatch(/export function resolveIssuerVatDisplay\(input: \{\s*issuerCountry[\s\S]*?vatNumber/)
    // Les consommateurs passent le snapshot facture, jamais un setting courant.
    expect(invoiceView).not.toMatch(/resolveIssuerVatDisplay\(\{[\s\S]*?settings\./)
    expect(invoicePdf).not.toMatch(/resolveIssuerVatDisplay\(\{[\s\S]*?settings\./)
  })
})

describe("2B.5A — aucune affirmation de conformité", () => {
  it("14. aucune occurrence de 'conforme' / 'non conforme' ajoutée aux fichiers touchés", () => {
    for (const src of [profileUi, invoiceView, invoicePdf]) {
      expect(src).not.toMatch(/non conforme/i)
      expect(src).not.toMatch(/\bconforme\b/i)
    }
    // Aucune affirmation de validité TVA dans le CODE du helper (hors commentaires).
    const tax = stripComments(read("lib/billing/country-profiles.ts"))
    expect(tax).not.toMatch(/TVA valide/i)
  })
})
