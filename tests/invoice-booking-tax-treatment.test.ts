import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { resolveTaxCalculation } from "@/lib/invoice/tax-treatment"

/**
 * Brouillon créé depuis une réservation : taxTreatment snapshoté UNIQUEMENT
 * depuis settings.vatStatus (choix explicite du vendeur). Sans DB.
 */
const source = readFileSync(join(__dirname, "../lib/invoice/actions.ts"), "utf8")

function functionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, `${name} introuvable`).toBeGreaterThan(-1)
  const next = source.indexOf("\nexport ", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const fromBooking = functionBody("createInvoiceFromBooking")
const issue = functionBody("issueInvoice")

function mapVatStatus(vatStatus: string | null | undefined) {
  const s = (vatStatus ?? "").trim().toLowerCase()
  return s === "subject" ? "STANDARD" : s === "exempt" ? "EXEMPT" : null
}

describe("createInvoiceFromBooking — mapping vatStatus => taxTreatment", () => {
  it("source : subject => STANDARD, exempt => EXEMPT, sinon null", () => {
    expect(fromBooking).toMatch(/settings\?\.vatStatus/)
    expect(fromBooking).toMatch(/sellerVatStatus === "subject" \? "STANDARD"/)
    expect(fromBooking).toMatch(/sellerVatStatus === "exempt" \? "EXEMPT" : null/)
  })

  it("1. subject + 20 % => STANDARD, mention null, TVA activée à 20", () => {
    const t = mapVatStatus("subject")
    expect(t).toBe("STANDARD")
    expect(resolveTaxCalculation({ taxTreatment: t, legacyVatEnabled: false, vatRate: 20 })).toEqual({
      vatEnabled: true,
      vatRate: 20,
    })
    expect(fromBooking).toMatch(/draftTaxTreatment === "EXEMPT" \? settings\?\.vatExemptNote\?\.trim\(\) \|\| null : null/)
  })

  it("2. exempt => EXEMPT, TVA désactivée, mention reprise des settings", () => {
    const t = mapVatStatus("exempt")
    expect(t).toBe("EXEMPT")
    expect(resolveTaxCalculation({ taxTreatment: t, legacyVatEnabled: true, vatRate: 20 }).vatEnabled).toBe(false)
  })

  it("3. null / unknown => null, comportement legacy (vatEnabled des settings)", () => {
    for (const s of [null, undefined, "", "unknown", "UNKNOWN"]) expect(mapVatStatus(s)).toBeNull()
    expect(resolveTaxCalculation({ taxTreatment: null, legacyVatEnabled: true, vatRate: 20 })).toEqual({
      vatEnabled: true,
      vatRate: 20,
    })
    expect(resolveTaxCalculation({ taxTreatment: null, legacyVatEnabled: false, vatRate: 20 }).vatEnabled).toBe(false)
  })

  it("source : une seule source de vérité (resolveTaxCalculation) pour calcul ET persistance", () => {
    expect(fromBooking).toMatch(/const draftTax = resolveTaxCalculation\(/)
    expect(fromBooking).toMatch(/const vatEnabled = draftTax\.vatEnabled/)
    expect(fromBooking).toMatch(/const vatRate = draftTax\.vatRate/)
    expect(fromBooking).toMatch(/taxTreatment: draftTaxTreatment,/)
    expect(fromBooking).toMatch(/taxLegalMention: draftTaxLegalMention,/)
    expect(fromBooking).not.toMatch(/settings\?\.vatEnabled \?\? false\s*\n\s*const vatRate = settings/)
  })

  it("4. aucune inférence depuis pays, client, n° TVA ou taux seul", () => {
    for (const forbidden of [/country/i, /customerType/, /vatNumber/, /vies/i, /vatRate\s*>\s*0/, /vatEnabled\s*\?\s*"STANDARD"/]) {
      expect(fromBooking).not.toMatch(forbidden)
    }
  })
})

describe("issueInvoice — snapshot du brouillon conservé", () => {
  it("5. ne réécrit pas taxTreatment depuis les settings", () => {
    expect(issue).not.toMatch(/taxTreatment\s*:/)
    expect(issue).not.toMatch(/vatStatus/)
  })
})
