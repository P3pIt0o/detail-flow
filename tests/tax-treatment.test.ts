import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  TAX_TREATMENTS,
  isTaxTreatment,
  normalizeTaxTreatment,
  resolveTaxCalculation,
  getTaxTreatmentLabel,
  type TaxTreatment,
} from "@/lib/invoice/tax-treatment"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Retire commentaires JS (/* *​/, //) et SQL (--) pour tester le CODE réel. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/--[^\n]*/g, " ")

/* -------------------------------------------------------------------------- */
/*  Helper pur : normalisation / validation                                   */
/* -------------------------------------------------------------------------- */

describe("normalizeTaxTreatment / isTaxTreatment", () => {
  it("1. normalizeTaxTreatment('standard') => STANDARD", () => {
    expect(normalizeTaxTreatment("standard")).toBe("STANDARD")
  })

  it("2. normalizeTaxTreatment(' reverse_charge ') => REVERSE_CHARGE", () => {
    expect(normalizeTaxTreatment(" reverse_charge ")).toBe("REVERSE_CHARGE")
  })

  it("3. normalizeTaxTreatment(null) => null", () => {
    expect(normalizeTaxTreatment(null)).toBeNull()
    expect(normalizeTaxTreatment(undefined)).toBeNull()
    expect(normalizeTaxTreatment("")).toBeNull()
    expect(normalizeTaxTreatment("   ")).toBeNull()
  })

  it("4. normalizeTaxTreatment('OTHER') => null (OTHER non supporté)", () => {
    expect(normalizeTaxTreatment("OTHER")).toBeNull()
    expect(normalizeTaxTreatment("nimportequoi")).toBeNull()
  })

  it("5. isTaxTreatment accepte uniquement les 4 valeurs", () => {
    expect(TAX_TREATMENTS).toEqual(["STANDARD", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"])
    for (const v of TAX_TREATMENTS) expect(isTaxTreatment(v)).toBe(true)
    for (const v of ["OTHER", "standard", "", "FR", "REVERSE"]) expect(isTaxTreatment(v)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Helper pur : resolveTaxCalculation                                        */
/* -------------------------------------------------------------------------- */

describe("resolveTaxCalculation — mécanique, sans logique de pays", () => {
  it("6. NULL + legacyVatEnabled true => vatEnabled true", () => {
    expect(resolveTaxCalculation({ taxTreatment: null, legacyVatEnabled: true, vatRate: 20 }).vatEnabled).toBe(true)
  })

  it("7. NULL + legacyVatEnabled false => vatEnabled false", () => {
    expect(resolveTaxCalculation({ taxTreatment: null, legacyVatEnabled: false, vatRate: 20 }).vatEnabled).toBe(false)
  })

  it("8. STANDARD + legacy false => vatEnabled true", () => {
    expect(resolveTaxCalculation({ taxTreatment: "STANDARD", legacyVatEnabled: false, vatRate: 20 }).vatEnabled).toBe(
      true,
    )
  })

  it("9. STANDARD conserve le taux fourni", () => {
    expect(resolveTaxCalculation({ taxTreatment: "STANDARD", legacyVatEnabled: false, vatRate: 7.7 }).vatRate).toBe(7.7)
  })

  it("10. EXEMPT => vatEnabled false", () => {
    expect(resolveTaxCalculation({ taxTreatment: "EXEMPT", legacyVatEnabled: true, vatRate: 20 }).vatEnabled).toBe(false)
  })

  it("11. REVERSE_CHARGE => vatEnabled false", () => {
    expect(
      resolveTaxCalculation({ taxTreatment: "REVERSE_CHARGE", legacyVatEnabled: true, vatRate: 20 }).vatEnabled,
    ).toBe(false)
  })

  it("12. OUT_OF_SCOPE => vatEnabled false", () => {
    expect(resolveTaxCalculation({ taxTreatment: "OUT_OF_SCOPE", legacyVatEnabled: true, vatRate: 20 }).vatEnabled).toBe(
      false,
    )
  })

  it("13. NaN vatRate => taux sûr 0", () => {
    expect(resolveTaxCalculation({ taxTreatment: "STANDARD", legacyVatEnabled: true, vatRate: NaN }).vatRate).toBe(0)
    expect(
      resolveTaxCalculation({ taxTreatment: null, legacyVatEnabled: true, vatRate: Number.POSITIVE_INFINITY }).vatRate,
    ).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/*  Helper pur : libellés                                                     */
/* -------------------------------------------------------------------------- */

describe("getTaxTreatmentLabel", () => {
  it("14. STANDARD => 'TVA normale'", () => expect(getTaxTreatmentLabel("STANDARD")).toBe("TVA normale"))
  it("15. EXEMPT => 'Sans TVA / exonération'", () =>
    expect(getTaxTreatmentLabel("EXEMPT")).toBe("Sans TVA / exonération"))
  it("16. REVERSE_CHARGE => 'Autoliquidation'", () =>
    expect(getTaxTreatmentLabel("REVERSE_CHARGE")).toBe("Autoliquidation"))
  it("17. OUT_OF_SCOPE => 'Hors champ'", () => expect(getTaxTreatmentLabel("OUT_OF_SCOPE")).toBe("Hors champ"))
  it("null / inconnu => null", () => {
    expect(getTaxTreatmentLabel(null)).toBeNull()
    expect(getTaxTreatmentLabel("OTHER")).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Schéma + migration (structurels)                                          */
/* -------------------------------------------------------------------------- */

describe("schéma & migration", () => {
  const schema = read("lib/db/schema.ts")
  const migration = read("scripts/2b4-tax-treatment-migration.sql")

  it("18. schema possède taxTreatment + taxLegalMention nullable (sans notNull)", () => {
    expect(schema).toMatch(/taxTreatment:\s*text\("taxTreatment"\)\s*,/)
    expect(schema).toMatch(/taxLegalMention:\s*text\("taxLegalMention"\)\s*,/)
    expect(schema).not.toMatch(/taxTreatment"\)\.notNull/)
    expect(schema).not.toMatch(/taxLegalMention"\)\.notNull/)
    expect(schema).not.toMatch(/taxTreatment"\)\.default/)
    expect(schema).not.toMatch(/taxLegalMention"\)\.default/)
  })

  it("19. migration contient uniquement les deux ADD COLUMN IF NOT EXISTS", () => {
    const adds = migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? []
    expect(adds).toHaveLength(2)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "taxTreatment" text/)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "taxLegalMention" text/)
  })

  it("20. migration ne contient aucun UPDATE / backfill / DEFAULT / NOT NULL", () => {
    const sql = stripComments(migration)
    expect(sql).not.toMatch(/\bUPDATE\b/i)
    expect(sql).not.toMatch(/\bINSERT\b/i)
    expect(sql).not.toMatch(/\bDEFAULT\b/i)
    expect(sql).not.toMatch(/NOT NULL/i)
    expect(sql).not.toMatch(/\bDROP\b/i)
  })
})

/* -------------------------------------------------------------------------- */
/*  saveInvoiceDraft — hardening serveur (structurel sur actions.ts)          */
/* -------------------------------------------------------------------------- */

describe("saveInvoiceDraft — hardening serveur", () => {
  const actions = read("lib/invoice/actions.ts")

  it("21. SaveDraftInput possède taxTreatment + taxLegalMention", () => {
    expect(actions).toMatch(/taxTreatment\?:\s*string \| null/)
    expect(actions).toMatch(/taxLegalMention\?:\s*string \| null/)
  })

  it("22. saveInvoiceDraft refuse une valeur taxTreatment inconnue", () => {
    expect(actions).toMatch(/isTaxTreatment\(rawTaxTreatment\)/)
    expect(actions).toMatch(/Traitement TVA invalide\./)
  })

  it("23-26. vatEnabled/vatRate proviennent de resolveTaxCalculation (serveur = vérité)", () => {
    expect(actions).toMatch(/const effectiveTax = resolveTaxCalculation\(\{[\s\S]*?legacyVatEnabled: input\.vatEnabled/)
    expect(actions).toMatch(/vatEnabled:\s*effectiveTax\.vatEnabled/)
    expect(actions).toMatch(/vatRate:\s*String\(effectiveTax\.vatRate\)/)
  })

  it("27-28. taxLegalMention forcée null pour STANDARD et legacy null", () => {
    // La mention n'est conservée que si taxTreatment existe ET n'est pas STANDARD.
    expect(actions).toMatch(
      /taxLegalMention\s*=\s*\n?\s*taxTreatment && taxTreatment !== "STANDARD"\s*\?\s*input\.taxLegalMention\?\.trim\(\) \|\| null\s*:\s*null/,
    )
  })

  it("29-31. EXEMPT/REVERSE_CHARGE/OUT_OF_SCOPE conservent la mention saisie", () => {
    // même expression : pour tout traitement non-STANDARD non-null la mention est input.taxLegalMention.
    expect(actions).toMatch(/taxTreatment !== "STANDARD"\s*\?\s*input\.taxLegalMention\?\.trim\(\)/)
    // persistée dans l'update
    expect(actions).toMatch(/taxTreatment,\s*\n\s*taxLegalMention,/)
  })

  it("43-44. saveInvoiceDraft reste protégé par le statut draft", () => {
    expect(actions).toMatch(/if \(inv\.status !== "draft"\)/)
    expect(actions).toMatch(/Seul un brouillon peut être modifié\./)
  })
})

/* -------------------------------------------------------------------------- */
/*  issueInvoice — mention obligatoire + immutabilité fiscale                 */
/* -------------------------------------------------------------------------- */

describe("issueInvoice — mention + snapshot", () => {
  const actions = read("lib/invoice/actions.ts")

  it("32. mention OPTIONNELLE : l'émission n'est jamais bloquée pour une mention manquante", () => {
    // Le traitement du brouillon est toujours lu (pour le fallback vatExemptNote)…
    expect(actions).toMatch(/const draftTaxTreatment = normalizeTaxTreatment\(inv\.taxTreatment\)/)
    // …mais AUCUN blocage d'émission lié à une mention absente n'existe.
    expect(actions).not.toMatch(/Ajoutez la mention fiscale correspondant au traitement TVA choisi/)
    expect(actions).not.toMatch(/!\(inv\.taxLegalMention \?\? ""\)\.trim\(\)/)
  })

  it("33-34. legacy null conserve vatExemptNote ; nouveau modèle ne le récupère jamais", () => {
    expect(actions).toMatch(
      /vatExemptNote:\s*draftTaxTreatment == null && !inv\.vatEnabled \? \(s\?\.vatExemptNote \?\? null\) : null/,
    )
  })

  it("issueInvoice reste protégé par le statut draft (immutabilité)", () => {
    expect(actions).toMatch(/if \(inv\.status !== "draft"\) return \{ ok: false, error: "Cette facture est déjà émise/)
  })

  it("issueInvoice ne recalcule pas taxTreatment depuis settings/pays", () => {
    const code = stripComments(actions)
    // Le traitement vient EXCLUSIVEMENT du brouillon (inv.taxTreatment).
    expect(code).toMatch(/normalizeTaxTreatment\(inv\.taxTreatment\)/)
    // Jamais réassigné depuis les settings de facturation (issuer/s?.).
    expect(code).not.toMatch(/\btaxTreatment\s*=\s*(issuer|s\?\.)/)
    // L'update d'émission ne réécrit PAS taxTreatment / taxLegalMention (immutabilité).
    const issueUpdate = code.slice(code.indexOf('status: "issued"'))
    expect(issueUpdate).not.toMatch(/taxTreatment:/)
    expect(issueUpdate).not.toMatch(/taxLegalMention:/)
  })
})

/* -------------------------------------------------------------------------- */
/*  PDF + InvoiceView                                                         */
/* -------------------------------------------------------------------------- */

describe("PDF & InvoiceView", () => {
  const pdf = read("lib/invoice/pdf.tsx")
  const view = read("components/admin/invoice-view.tsx")

  it("35. PDF nouveau modèle affiche taxLegalMention", () => {
    expect(pdf).toMatch(/invoice\.taxTreatment != null/)
    expect(pdf).toMatch(/invoice\.taxLegalMention/)
  })

  it("36. PDF nouveau modèle n'utilise pas vatExemptNote (branché sur taxTreatment == null)", () => {
    // vatExemptNote n'apparaît que dans la branche legacy (taxTreatment == null).
    expect(pdf).toMatch(/invoice\.taxTreatment != null[\s\S]*?:\s*!invoice\.vatEnabled && invoice\.vatExemptNote/)
  })

  it("37. PDF legacy continue à afficher vatExemptNote", () => {
    expect(pdf).toMatch(/!invoice\.vatEnabled && invoice\.vatExemptNote/)
  })

  it("38. InvoiceView utilise invoice.taxTreatment et invoice.taxLegalMention", () => {
    expect(view).toMatch(/getTaxTreatmentLabel\(invoice\.taxTreatment\)/)
    expect(view).toMatch(/invoice\.taxLegalMention/)
  })

  it("39. InvoiceView ne relit aucun setting fiscal courant", () => {
    expect(view).not.toMatch(/db\.(query|select|transaction)/)
    expect(view).not.toMatch(/settings/i)
    // n'affirme jamais la conformité
    for (const banned of [/\bConforme\b/, /TVA valide/, /applicable\b/i, /vérifié/i, /Obligation respectée/]) {
      expect(view).not.toMatch(banned)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  Aucune inférence fiscale — garde structurelle sur tax-treatment.ts        */
/* -------------------------------------------------------------------------- */

describe("aucune inférence fiscale", () => {
  const tax = stripComments(read("lib/invoice/tax-treatment.ts"))
  const calc = read("lib/invoice/calc.ts")

  it("40. tax-treatment.ts ne contient aucune logique de pays", () => {
    expect(tax).not.toMatch(/country-profiles/)
    expect(tax).not.toMatch(/\bimport\b/)
    for (const banned of [/sellerCountry/, /issuerCountry/, /customerCountry/, /\bFR\b/, /\bBE\b/, /\bCH\b/]) {
      expect(tax).not.toMatch(banned)
    }
  })

  it("41. aucune inférence depuis customerType / customerCountry / issuerCountry / VAT", () => {
    for (const banned of [/customerType/, /customerCountry/, /issuerCountry/, /vatNumber/i, /VIES/i]) {
      expect(tax).not.toMatch(banned)
    }
  })

  it("42. computeInvoice inchangé : aucune propriété taxTreatment dans InvoiceCalcInput", () => {
    expect(calc).not.toMatch(/taxTreatment/)
  })
})
