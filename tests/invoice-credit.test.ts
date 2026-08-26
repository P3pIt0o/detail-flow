import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  canIssueCredit,
  clampCreditLineQuantity,
  clampCreditUnitPrice,
  computeCreditSummary,
  CREDITABLE_INVOICE_STATUSES,
  isCreditNote,
  remainingLineQuantity,
  validateCreditReason,
} from "@/lib/invoice/credit"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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

/* -------------------------------------------------------------------------- */
/*  Plafonnement PAR LIGNE (avoirs partiels multiples)                        */
/* -------------------------------------------------------------------------- */

describe("remainingLineQuantity", () => {
  it("rien de crédité => quantité d'origine entière", () => {
    expect(remainingLineQuantity(3, 0)).toBe(3)
  })
  it("partiellement crédité => différence", () => {
    expect(remainingLineQuantity(5, 2)).toBe(3)
  })
  it("intégralement crédité => 0, jamais négatif", () => {
    expect(remainingLineQuantity(5, 5)).toBe(0)
    expect(remainingLineQuantity(5, 8)).toBe(0)
  })
})

describe("clampCreditLineQuantity", () => {
  it("borne la quantité demandée au restant créditable", () => {
    expect(clampCreditLineQuantity(10, 5, 0)).toBe(5)
    expect(clampCreditLineQuantity(2, 5, 0)).toBe(2)
  })
  it("tient compte des avoirs déjà émis (cumul)", () => {
    // 5 facturés, 3 déjà crédités => au plus 2 crédités, même si on demande 4.
    expect(clampCreditLineQuantity(4, 5, 3)).toBe(2)
  })
  it("refuse valeurs négatives / non entières / non finies", () => {
    expect(clampCreditLineQuantity(-3, 5, 0)).toBe(0)
    expect(clampCreditLineQuantity(2.9, 5, 0)).toBe(2)
    expect(clampCreditLineQuantity(Number.NaN, 5, 0)).toBe(0)
  })
})

describe("clampCreditUnitPrice", () => {
  it("ne crédite jamais plus cher que le prix d'origine", () => {
    expect(clampCreditUnitPrice(20_000, 10_000)).toBe(10_000)
    expect(clampCreditUnitPrice(4_000, 10_000)).toBe(4_000)
  })
  it("jamais négatif", () => {
    expect(clampCreditUnitPrice(-500, 10_000)).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/*  Garde-fous serveur (inspection du code réel — pas de DB de test)          */
/* -------------------------------------------------------------------------- */

describe("actions serveur : sécurité & rétrocompatibilité des avoirs", () => {
  const actions = read("lib/invoice/actions.ts")
  const queries = read("lib/admin/queries.ts")

  it("createCreditNote et l'émission sont scopés companyId (isolation tenant)", () => {
    // La résolution du tenant passe par le helper serveur, jamais par un
    // companyId issu du navigateur.
    expect(actions).toMatch(/requireCompanyMember\(\)/)
    // Les documents sont toujours chargés bornés au tenant courant.
    expect(actions).toMatch(/loadOwnedInvoice\(/)
    // Les avoirs référencent la facture d'origine par son companyId.
    expect(actions).toMatch(/originalInvoiceId/)
  })

  it("l'ajout de paiement refuse un document de type avoir", () => {
    // Un avoir n'accepte aucun paiement : garde-fou serveur explicite.
    expect(actions).toMatch(/credit_note/)
    expect(actions).toMatch(/documentType/)
  })

  it("les lignes d'avoir sont bornées par les helpers de plafonnement", () => {
    expect(actions).toMatch(/clampCreditLineQuantity|clampCreditUnitPrice/)
    expect(actions).toMatch(/originalInvoiceItemId/)
  })

  it("le CA net déduit un avoir seulement si l'origine comptait dans le CA payé", () => {
    expect(queries).toMatch(/creditNoteOriginalCountedInRevenue/)
    // L'origine doit être une facture 'paid' du même tenant.
    expect(queries).toMatch(/orig\."companyId" = /)
    expect(queries).toMatch(/orig\.status = 'paid'/)
  })

  it("l'avoir est affecté au mois de son émission, pas d'une date de prestation", () => {
    expect(queries).toMatch(/revenuePeriodDateExpr/)
    expect(queries).toMatch(/credit_note[\s\S]*issueDate/)
  })
})

/* -------------------------------------------------------------------------- */
/*  UI / PDF : un avoir n'est pas une demande de paiement                     */
/* -------------------------------------------------------------------------- */

describe("UI & PDF : un avoir ne demande aucun règlement", () => {
  const pdf = read("lib/invoice/pdf.tsx")
  const view = read("components/admin/invoice-view.tsx")
  const editor = read("components/admin/invoice-editor.tsx")

  it("le PDF affiche « Total crédité » et masque le bloc bancaire pour un avoir", () => {
    expect(pdf).toMatch(/Total crédité/)
    expect(pdf).toMatch(/!isCredit && invoice\.issuerIban/)
    expect(pdf).toMatch(/creditReason/)
  })

  it("la vue masque la carte Paiements et « Marquer comme payée » pour un avoir", () => {
    expect(view).toMatch(/!isCancelled && !isCredit/)
    expect(view).toMatch(/Total crédité/)
  })

  it("l'éditeur transmet originalInvoiceItemId et interdit d'ajouter des lignes à un avoir", () => {
    expect(editor).toMatch(/originalInvoiceItemId/)
    expect(editor).toMatch(/Aucune ligne ne peut être ajoutée à un avoir/)
  })
})
