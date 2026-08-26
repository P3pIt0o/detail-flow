import { describe, it, expect } from "vitest"
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
