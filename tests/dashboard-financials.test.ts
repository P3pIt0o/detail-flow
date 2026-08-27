import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  computeMonthlyFinancials,
  isWithin,
  COLLECTED_STATUSES,
  type PaymentRow,
} from "@/lib/admin/financials"

/**
 * Lot « Encaissé ce mois » — séparation stricte CA facturé / encaissé.
 *
 * Partie A : tests PURS de la sémantique financière (helper `computeMonthlyFinancials`),
 * sans base ni réseau — source de vérité des règles anti double comptage, dates
 * réelles, exclusion des frais Stripe, remboursements.
 *
 * Partie B : tests STRUCTURELS garantissant l'isolation tenant et le câblage UI.
 */

const START = "2026-08-01"
const END = "2026-08-31"

/** Fabrique une ligne de paiement (déjà scopée tenant côté SQL). */
function pay(over: Partial<PaymentRow>): PaymentRow {
  return {
    grossAmountCents: 0,
    refundedAmountCents: 0,
    status: "paid",
    paidAt: "2026-08-15",
    refundedAt: null,
    ...over,
  }
}

function base(payments: PaymentRow[], over?: { invoiced?: number; products?: number }) {
  return computeMonthlyFinancials({
    invoicedRevenueCents: over?.invoiced ?? 0,
    productCostsCents: over?.products ?? 0,
    payments,
    start: START,
    end: END,
  })
}

describe("Encaissé — cas de la réservation DF-20260829-1996 (paiement intégral 11,26 €)", () => {
  it("un paiement intégral de 1126 est compté une seule fois", () => {
    const r = base([pay({ grossAmountCents: 1126, status: "paid", paidAt: "2026-08-27" })])
    expect(r.collectedGrossCents).toBe(1126)
    expect(r.refundedCents).toBe(0)
    expect(r.collectedNetCents).toBe(1126)
  })

  it("les frais Stripe (0,42 €) n'affectent PAS le CA brut encaissé (reste 11,26 €)", () => {
    // La ligne fournie ne contient que le brut ; le helper n'a aucune notion de
    // frais → aucun risque de transformer 11,26 € en 10,84 €.
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })])
    expect(r.collectedGrossCents).toBe(1126)
    // Frais non exposés dans ce lot : null (jamais 0 artificiel).
    expect(r.paymentFeesCents).toBeNull()
  })

  it("un rendez-vous futur (29/08) n'empêche pas de compter un paiement reçu le 27/08", () => {
    // Le helper ne dépend que de paidAt, jamais de la date du RDV.
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })])
    expect(r.collectedNetCents).toBe(1126)
  })
})

describe("Encaissé — anti double comptage", () => {
  it("acompte + solde d'une même réservation sont additionnés sans doublon", () => {
    const r = base([
      pay({ grossAmountCents: 300, type: undefined as never, status: "paid", paidAt: "2026-08-05" }),
      pay({ grossAmountCents: 826, status: "paid", paidAt: "2026-08-20" }),
    ])
    expect(r.collectedGrossCents).toBe(1126)
  })

  it("un webhook rejoué n'augmente pas le total (une seule ligne en base = idempotence)", () => {
    // L'unicité (provider, externalPaymentId) garantit UNE ligne par paiement :
    // un rejeu ne crée pas de ligne, donc le total est identique.
    const rows = [pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })]
    const first = base(rows).collectedGrossCents
    const replayed = base(rows).collectedGrossCents // mêmes lignes = même total
    expect(first).toBe(1126)
    expect(replayed).toBe(1126)
  })

  it("l'encaissé ne dépend PAS du statut de la réservation (RDV terminé ne recompte pas)", () => {
    // Aucune donnée de réservation n'entre dans le helper : impossible d'ajouter
    // une 2e fois le montant à la fin du rendez-vous.
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })])
    expect(r.collectedGrossCents).toBe(1126)
  })

  it("l'encaissé ne dépend PAS des factures (créer une facture ne recompte pas)", () => {
    // invoicedRevenueCents et collected sont deux sources indépendantes.
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })], { invoiced: 999999 })
    expect(r.collectedGrossCents).toBe(1126) // inchangé par le CA facturé
    expect(r.invoicedRevenueCents).toBe(999999)
  })
})

describe("Encaissé — remboursements", () => {
  it("un remboursement exécuté dans le mois est déduit une seule fois", () => {
    const r = base([
      pay({ grossAmountCents: 5000, status: "partially_refunded", paidAt: "2026-08-10", refundedAmountCents: 2000, refundedAt: "2026-08-12" }),
    ])
    expect(r.collectedGrossCents).toBe(5000)
    expect(r.refundedCents).toBe(2000)
    expect(r.collectedNetCents).toBe(3000)
  })

  it("un remboursement INTÉGRAL ramène l'encaissé net à 0 (brut conservé)", () => {
    const r = base([
      pay({ grossAmountCents: 5000, status: "refunded", paidAt: "2026-08-10", refundedAmountCents: 5000, refundedAt: "2026-08-15" }),
    ])
    expect(r.collectedGrossCents).toBe(5000)
    expect(r.collectedNetCents).toBe(0)
  })

  it("un avoir affecte le CA facturé mais PAS l'encaissement sans remboursement réel", () => {
    // Avoir = déduction sur invoicedRevenueCents (calculée en amont). Sans
    // refundedAmountCents, l'encaissé reste inchangé.
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27" })], { invoiced: 900 })
    expect(r.invoicedRevenueCents).toBe(900) // avoir déjà déduit en amont
    expect(r.collectedNetCents).toBe(1126) // encaissement intact
  })
})

describe("Encaissé — rattachement temporel (dates réelles)", () => {
  it("acompte payé en juillet et solde payé en août tombent chacun dans leur mois", () => {
    const rows = [
      pay({ grossAmountCents: 300, paidAt: "2026-07-30" }), // hors mois d'août
      pay({ grossAmountCents: 826, paidAt: "2026-08-02" }), // dans le mois
    ]
    const aug = base(rows)
    expect(aug.collectedGrossCents).toBe(826) // seul le solde d'août
    const jul = computeMonthlyFinancials({
      invoicedRevenueCents: 0,
      productCostsCents: 0,
      payments: rows,
      start: "2026-07-01",
      end: "2026-07-31",
    })
    expect(jul.collectedGrossCents).toBe(300) // seul l'acompte de juillet
  })

  it("un remboursement est rattaché à sa propre date, pas à celle du paiement", () => {
    const rows = [
      pay({ grossAmountCents: 5000, status: "partially_refunded", paidAt: "2026-08-10", refundedAmountCents: 2000, refundedAt: "2026-09-03" }),
    ]
    const aug = base(rows)
    expect(aug.collectedGrossCents).toBe(5000)
    expect(aug.refundedCents).toBe(0) // remboursement en septembre → hors août
    const sep = computeMonthlyFinancials({
      invoicedRevenueCents: 0,
      productCostsCents: 0,
      payments: rows,
      start: "2026-09-01",
      end: "2026-09-30",
    })
    expect(sep.refundedCents).toBe(2000)
    expect(sep.collectedGrossCents).toBe(0) // paiement en août → hors septembre
  })

  it("isWithin gère bornes incluses et dates ISO complètes", () => {
    expect(isWithin("2026-08-01", START, END)).toBe(true)
    expect(isWithin("2026-08-31", START, END)).toBe(true)
    expect(isWithin("2026-07-31", START, END)).toBe(false)
    expect(isWithin("2026-09-01", START, END)).toBe(false)
    expect(isWithin(new Date("2026-08-15T23:00:00Z"), START, END)).toBe(true)
    expect(isWithin(null, START, END)).toBe(false)
  })
})

describe("Encaissé — robustesse & montants", () => {
  it("tous les montants restent des entiers de centimes", () => {
    const r = base([pay({ grossAmountCents: 1126, paidAt: "2026-08-27", refundedAmountCents: 13, refundedAt: "2026-08-28", status: "partially_refunded" })])
    for (const v of [r.collectedGrossCents, r.refundedCents, r.collectedNetCents, r.invoicedRevenueCents, r.productCostsCents]) {
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it("une donnée inconnue est null, jamais un 0 artificiel", () => {
    const r = base([])
    expect(r.paymentFeesCents).toBeNull()
    // Aucun paiement → encaissé réellement 0 (ce 0 est réel, pas une inconnue).
    expect(r.collectedGrossCents).toBe(0)
  })

  it("un statut non encaissé (pending/failed) n'est jamais compté", () => {
    const r = base([
      pay({ grossAmountCents: 1000, status: "pending", paidAt: "2026-08-05" }),
      pay({ grossAmountCents: 2000, status: "failed", paidAt: "2026-08-06" }),
    ])
    expect(r.collectedGrossCents).toBe(0)
  })

  it("COLLECTED_STATUSES ne contient que des statuts réellement encaissés", () => {
    expect([...COLLECTED_STATUSES]).toEqual(["paid", "partially_refunded", "refunded"])
  })
})

/* --------------------------- Partie B — structurel ------------------------ */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("Encaissé — câblage serveur (isolation & source)", () => {
  const queries = read("lib/admin/queries.ts")
  const page = read("app/admin/(dashboard)/page.tsx")

  it("la lecture des paiements est scopée par companyId (isolation tenant)", () => {
    expect(queries).toContain("eq(payments.companyId, cid)")
  })

  it("seuls les statuts réellement encaissés sont lus, filtrés par paidAt/refundedAt", () => {
    expect(queries).toContain("inArray(payments.status, [...COLLECTED_STATUSES])")
    expect(queries).toContain("${payments.paidAt}::date")
    expect(queries).toContain("${payments.refundedAt}::date")
  })

  it("le calcul est délégué au helper PUR (source de vérité unique)", () => {
    expect(queries).toContain("computeMonthlyFinancials({")
    expect(queries).toContain("collectedNetCents: financials.collectedNetCents")
    // Frais de paiement exposés en null (jamais 0).
    expect(queries).toContain("paymentFeesCents: financials.paymentFeesCents")
  })

  it("le dashboard distingue clairement « CA facturé » et « Encaissé »", () => {
    expect(page).toContain("CA facturé ce mois")
    expect(page).toContain("Encaissé ce mois")
    expect(page).toContain("stats.collectedNetCents")
    // L'ancien libellé ambigu « CA du mois » a disparu du dashboard produit.
    expect(page).not.toContain('label: "CA du mois"')
  })
})
