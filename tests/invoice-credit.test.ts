import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  canIssueCredit,
  computeCreditSummary,
  CREDITABLE_INVOICE_STATUSES,
  isCreditNote,
  validateCreditReason,
} from "@/lib/invoice/credit"

describe("computeCreditSummary", () => {
  it("aucun avoir émis => rien crédité, tout restant", () => {
    const s = computeCreditSummary(10_000, [])
    expect(s.creditedCents).toBe(0)
    expect(s.remainingCents).toBe(10_000)
    expect(s.fullyCredited).toBe(false)
  })

  it("avoirs partiels cumulés => restant réduit", () => {
    const s = computeCreditSummary(10_000, [3_000, 2_000])
    expect(s.creditedCents).toBe(5_000)
    expect(s.remainingCents).toBe(5_000)
    expect(s.fullyCredited).toBe(false)
  })

  it("cumul égal au total => intégralement créditée, restant nul", () => {
    const s = computeCreditSummary(10_000, [10_000])
    expect(s.remainingCents).toBe(0)
    expect(s.fullyCredited).toBe(true)
  })

  it("total nul => jamais marqué comme intégralement crédité", () => {
    const s = computeCreditSummary(0, [])
    expect(s.fullyCredited).toBe(false)
  })

  it("ignore les montants négatifs éventuels", () => {
    const s = computeCreditSummary(10_000, [-500, 2_000])
    expect(s.creditedCents).toBe(2_000)
  })
})

describe("canIssueCredit", () => {
  it("refuse un montant nul ou négatif", () => {
    expect(canIssueCredit(10_000, 0, 0).ok).toBe(false)
    expect(canIssueCredit(10_000, 0, -100).ok).toBe(false)
  })

  it("autorise un avoir dans la limite du total", () => {
    expect(canIssueCredit(10_000, 0, 10_000).ok).toBe(true)
    expect(canIssueCredit(10_000, 3_000, 7_000).ok).toBe(true)
  })

  it("refuse un cumul dépassant le total d'origine", () => {
    const r = canIssueCredit(10_000, 3_000, 8_000)
    expect(r.ok).toBe(false)
  })

  it("refuse un second avoir sur une facture déjà intégralement créditée", () => {
    const r = canIssueCredit(10_000, 10_000, 100)
    expect(r.ok).toBe(false)
  })
})

describe("validateCreditReason", () => {
  it("refuse un motif vide ou blanc", () => {
    expect(validateCreditReason("").ok).toBe(false)
    expect(validateCreditReason("   ").ok).toBe(false)
    expect(validateCreditReason(null).ok).toBe(false)
    expect(validateCreditReason(undefined).ok).toBe(false)
  })

  it("accepte et nettoie un motif valide", () => {
    const r = validateCreditReason("  Erreur de facturation  ")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.reason).toBe("Erreur de facturation")
  })
})

describe("isCreditNote / statuts créditables", () => {
  it("distingue avoir et facture", () => {
    expect(isCreditNote("credit_note")).toBe(true)
    expect(isCreditNote("invoice")).toBe(false)
    expect(isCreditNote(null)).toBe(false)
  })

  it("seules les factures émises/payées sont créditables", () => {
    expect(CREDITABLE_INVOICE_STATUSES).toContain("issued")
    expect(CREDITABLE_INVOICE_STATUSES).toContain("paid")
    expect(CREDITABLE_INVOICE_STATUSES).not.toContain("draft")
    expect(CREDITABLE_INVOICE_STATUSES).not.toContain("cancelled")
  })
})

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("garde-fous d'intégration des avoirs", () => {
  it("interdit l'émission classique et les paiements sur un avoir", () => {
    const actions = source("lib/invoice/actions.ts")
    expect(actions).toContain('if (isCreditNote(inv.documentType))')
    expect(actions).toContain("Utilisez l'émission d'avoir pour ce document")
    expect(actions).toContain("Un paiement ne peut pas être enregistré sur un avoir")
  })

  it("rattache les lignes d'avoir aux lignes d'origine dans le schéma et la migration", () => {
    expect(source("lib/db/schema.ts")).toContain('originalInvoiceItemId: integer("originalInvoiceItemId")')
    expect(source("scripts/invoice-credit-notes-migration.sql")).toContain('ADD COLUMN IF NOT EXISTS "originalInvoiceItemId" integer')
  })

  it("adapte le PDF et l'email sans présenter l'avoir comme une somme à payer", () => {
    const pdf = source("lib/invoice/pdf.tsx")
    const email = source("lib/email/templates.ts")
    expect(pdf).toContain("Total crédité")
    expect(pdf).toContain("invoice.creditReason")
    expect(email).toContain("Total crédité")
    expect(email).toContain("isCreditNote")
  })

  it("calcule le CA net avec une facture d'origine payée et la date d'émission de l'avoir", () => {
    const queries = source("lib/admin/queries.ts")
    expect(queries).toContain("original.status = 'paid'")
    expect(queries).toContain("revenueDateExpr")
    expect(queries).toContain("invoices.issueDate")
  })
})
