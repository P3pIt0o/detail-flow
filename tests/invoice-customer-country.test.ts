import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { SUPPORTED_COUNTRIES } from "@/lib/billing/country-profiles"

/**
 * Pays acheteur (BT-55) : choisi explicitement dans le brouillon, jamais déduit,
 * exigé à l'émission uniquement pour les brouillons au nouveau modèle fiscal.
 * Tests structurels sans DB.
 */
const source = readFileSync(join(__dirname, "../lib/invoice/actions.ts"), "utf8")
const fieldsSource = readFileSync(join(__dirname, "../components/admin/customer-identity-fields.tsx"), "utf8")

function functionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, `${name} introuvable`).toBeGreaterThan(-1)
  const next = source.indexOf("\nexport ", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const fromBooking = functionBody("createInvoiceFromBooking")
const saveDraft = functionBody("saveInvoiceDraft")
const issue = functionBody("issueInvoice")
const issueCredit = functionBody("issueCreditNote")

/** Réplique exacte de la normalisation de saveInvoiceDraft. */
function normalizeCountry(raw: string | null | undefined) {
  const c = (raw ?? "").trim().toUpperCase()
  return c === "OTHER" ? "OTHER" : c || null
}

describe("createInvoiceFromBooking — pays acheteur", () => {
  it("1. aucun pays posé à la création (null par défaut, jamais déduit)", () => {
    expect(fromBooking).not.toMatch(/customerCountry/)
    expect(fromBooking).not.toMatch(/postalCode|zipCode|navigator|languages/)
  })
})

describe("saveInvoiceDraft — sélection explicite du pays", () => {
  it.each(["FR", "BE", "CH"])("2-4. %s enregistré tel quel", (code) => {
    expect(normalizeCountry(code)).toBe(code)
    expect(normalizeCountry(code.toLowerCase())).toBe(code)
  })

  it("vide => null (pas de FR imposé)", () => {
    expect(normalizeCountry("")).toBeNull()
    expect(normalizeCountry(null)).toBeNull()
  })

  it("persiste customerCountry depuis l'entrée utilisateur uniquement", () => {
    expect(saveDraft).toMatch(/const rawCustCountry = \(input\.customerCountry \?\? ""\)\.trim\(\)\.toUpperCase\(\)/)
    expect(saveDraft).toMatch(/\n\s+customerCountry,\n/)
  })

  it("le formulaire propose FR, BE, CH et « À préciser » par défaut", () => {
    expect(SUPPORTED_COUNTRIES.map((c) => c.code)).toEqual(expect.arrayContaining(["FR", "BE", "CH"]))
    expect(fieldsSource).toMatch(/<option value="">À préciser<\/option>/)
  })
})

describe("issueInvoice — pays requis avant émission (nouveau modèle uniquement)", () => {
  it("5. message explicite si pays absent et taxTreatment renseigné", () => {
    expect(issue).toMatch(/draftTaxTreatment !== null && !inv\.customerCountry\?\.trim\(\)/)
    expect(issue).toMatch(/Renseignez le pays du client avant d'émettre la facture\./)
  })

  it("le contrôle précède la transaction de numérotation (brouillon conservé)", () => {
    expect(issue.indexOf("Renseignez le pays du client")).toBeLessThan(issue.indexOf("db.transaction"))
  })

  it("6. le pays n'est jamais déduit ni réécrit à l'émission", () => {
    expect(issue).not.toMatch(/customerCountry\s*:/)
    expect(issue).not.toMatch(/customerCountry\s*=/)
  })

  it("8. scoping tenant conservé (loadOwnedInvoice par companyId)", () => {
    expect(issue).toMatch(/loadOwnedInvoice\(invoiceId, companyId\)/)
  })

  it("9. factures déjà émises refusées avant tout contrôle de pays", () => {
    expect(issue.indexOf('inv.status !== "draft"')).toBeLessThan(issue.indexOf("Renseignez le pays du client"))
  })

  it("avoirs non concernés par ce contrôle", () => {
    expect(issueCredit).not.toMatch(/Renseignez le pays du client/)
  })
})
