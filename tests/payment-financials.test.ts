import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  computeStripeFinancials,
  extractChargeAndBalanceTransaction,
  isExpectedConnectedAccount,
  planFinancialsUpdate,
} from "@/lib/payments/financials-logic"
import { computePaymentRefundAggregate } from "@/lib/payments/refund-logic"

const state = vi.hoisted(() => ({
  tenantAccount: "acct_A" as string | null,
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (state.row ? [state.row] : []) }) }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.updates.push(v)
            if (state.row) Object.assign(state.row, v)
            return [{ id: 1 }]
          },
        }),
      }),
    }),
  },
}))
vi.mock("@/lib/payments/queries", () => ({
  getStripeAccountIdForCompany: async () => state.tenantAccount,
}))

import { syncStripePaymentFinancials, type StripeFinancialsPort } from "@/lib/payments/financials"

const bt = (over: Record<string, unknown> = {}) => ({
  id: "txn_1",
  amount: 2204,
  currency: "eur",
  fee: 57,
  net: 2147,
  fee_details: [{ amount: 57, type: "stripe_fee" }],
  ...over,
})
const piWith = (balance: unknown) => ({ id: "pi_1", latest_charge: { id: "ch_1", balance_transaction: balance } })

function port(pi: unknown) {
  const calls: { method: string; account: string }[] = []
  const p: StripeFinancialsPort = {
    retrievePaymentIntentWithBalance: async (_id, account) => {
      calls.push({ method: "pi", account })
      return pi
    },
    retrieveCheckoutSessionPaymentIntentId: async (_id, account) => {
      calls.push({ method: "session", account })
      return "pi_1"
    },
  }
  return { p, calls }
}

const baseRow = () => ({
  id: 1,
  status: "paid",
  currency: "EUR",
  grossAmountCents: 2204,
  providerFeeAmountCents: null,
  netAmountCents: null,
  meta: { paymentIntentId: "pi_1" },
})
const input = { companyId: 58, bookingId: 120, externalPaymentId: "cs_1", connectedAccountId: "acct_A" }

beforeEach(() => {
  state.tenantAccount = "acct_A"
  state.row = baseRow()
  state.updates = []
})

describe("A — paiement sans commission plateforme", () => {
  it("providerFee = frais Stripe réels, net = balance_transaction.net", () => {
    const r = computeStripeFinancials(bt(), { grossAmountCents: 2204, currency: "EUR" })
    expect(r).toEqual({ ok: true, providerFeeAmountCents: 57, netAmountCents: 2147, applicationFeeAmountCents: 0, balanceTransactionId: "txn_1" })
  })
})

describe("B — paiement avec commission plateforme", () => {
  it("application fee séparée, aucune double déduction, net Stripe tel quel", () => {
    const r = computeStripeFinancials(
      bt({
        amount: 10000,
        fee: 1000 + 165 + 33,
        net: 10000 - 1198,
        fee_details: [
          { amount: 1000, type: "application_fee" },
          { amount: 165, type: "stripe_fee" },
          { amount: 33, type: "tax" },
        ],
      }),
      { grossAmountCents: 10000, currency: "EUR" },
    )
    expect(r).toMatchObject({ ok: true, providerFeeAmountCents: 198, applicationFeeAmountCents: 1000, netAmountCents: 8802 })
  })

  it("aucune estimation : frais sans détail ou incohérents refusés", () => {
    expect(computeStripeFinancials(bt({ fee_details: [] }), { grossAmountCents: 2204, currency: "EUR" })).toEqual({ ok: false, reason: "fee_details_missing" })
    expect(computeStripeFinancials(bt({ fee: 60 }), { grossAmountCents: 2204, currency: "EUR" })).toEqual({ ok: false, reason: "invalid" })
    expect(computeStripeFinancials(bt({ amount: 2000 }), { grossAmountCents: 2204, currency: "EUR" })).toEqual({ ok: false, reason: "amount_mismatch" })
    expect(computeStripeFinancials(bt({ currency: "usd" }), { grossAmountCents: 2204, currency: "EUR" })).toEqual({ ok: false, reason: "currency_mismatch" })
  })

  it("synchronisation écrit providerFee + net, jamais brut ni commission", async () => {
    const { p, calls } = port(piWith(bt()))
    expect(await syncStripePaymentFinancials({ ...input, port: p })).toEqual({ status: "synced" })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ providerFeeAmountCents: 57, netAmountCents: 2147 })
    expect(state.updates[0]).not.toHaveProperty("grossAmountCents")
    expect(state.updates[0]).not.toHaveProperty("platformFeeAmountCents")
    expect(state.updates[0]).not.toHaveProperty("status")
    expect(calls.every((c) => c.account === "acct_A")).toBe(true)
  })
})

describe("C — webhook rejoué", () => {
  it("second passage : aucun appel Stripe, aucune écriture, valeurs identiques", async () => {
    const { p, calls } = port(piWith(bt()))
    await syncStripePaymentFinancials({ ...input, port: p })
    const before = { ...state.row }
    calls.length = 0
    expect(await syncStripePaymentFinancials({ ...input, port: p })).toEqual({ status: "already_synced" })
    expect(calls).toHaveLength(0)
    expect(state.updates).toHaveLength(1)
    expect(state.row).toEqual(before)
  })

  it("snapshot existant différent jamais écrasé", () => {
    expect(planFinancialsUpdate({ providerFeeAmountCents: 50, netAmountCents: 2154 }, { providerFeeAmountCents: 57, netAmountCents: 2147 })).toBe("conflict")
    expect(planFinancialsUpdate({ providerFeeAmountCents: 57, netAmountCents: null }, { providerFeeAmountCents: 57, netAmountCents: 2147 })).toBe("update")
  })
})

describe("D — BalanceTransaction indisponible", () => {
  it("non bloquant : aucune écriture, statut payé intact, rejouable", async () => {
    const { p } = port(piWith("txn_not_expanded"))
    expect(await syncStripePaymentFinancials({ ...input, port: p })).toMatchObject({ status: "unavailable" })
    expect(state.updates).toHaveLength(0)
    expect(state.row?.status).toBe("paid")
    expect(state.row?.netAmountCents).toBeNull()
    expect(extractChargeAndBalanceTransaction({ latest_charge: null })).toBeNull()
  })

  it("erreur Stripe réseau : jamais levée", async () => {
    const p: StripeFinancialsPort = {
      retrievePaymentIntentWithBalance: async () => {
        throw new Error("network")
      },
      retrieveCheckoutSessionPaymentIntentId: async () => null,
    }
    await expect(syncStripePaymentFinancials({ ...input, port: p })).resolves.toEqual({ status: "error" })
    expect(state.updates).toHaveLength(0)
  })

  it("le webhook appelle la synchro APRÈS settlePaymentPaid (confirmation inchangée)", () => {
    const src = readFileSync(join(process.cwd(), "app/api/payments/webhook/route.ts"), "utf8")
    const settle = src.indexOf("await settlePaymentPaid(")
    const sync = src.indexOf("await syncStripePaymentFinancials(")
    expect(settle).toBeGreaterThan(0)
    expect(sync).toBeGreaterThan(settle)
    expect(src).toContain("connectedAccountId: tenantAccountId")
  })

  it("D — synchro unavailable/error : event NON marqué traité (rejeu possible), ACK 200", () => {
    const src = readFileSync(join(process.cwd(), "app/api/payments/webhook/route.ts"), "utf8")
    expect(src).toMatch(/financials\.status === "unavailable" \|\| financials\.status === "error"/)
    const pending = src.indexOf("if (financialsPendingRetry)")
    const mark = src.indexOf("await markEventProcessed(")
    expect(pending).toBeGreaterThan(0)
    expect(mark).toBeGreaterThan(pending)
    const pendingBlock = src.slice(pending, mark)
    expect(pendingBlock).toContain("return NextResponse.json({ received: true, financialsPending: true })")
    expect(pendingBlock).not.toContain("status: 500")
    // Emails toujours dispatchés (idempotence durable), paiement non remis en cause.
    const sync = src.indexOf("await syncStripePaymentFinancials(")
    expect(src.indexOf("await sendPaymentReceivedEmails(", sync)).toBeGreaterThan(sync)
  })
})

describe("E/F/G — remboursements : snapshot initial conservé", () => {
  const gross = 2204
  it("E — partiel : brut + net inchangés, refunded augmente", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: gross, succeededRefundCents: 200 })).toEqual({
      refundedAmountCents: 200,
      status: "partially_refunded",
      fullyRefunded: false,
    })
  })
  it("F — plusieurs remboursements agrégés sans double comptage", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: gross, succeededRefundCents: 200 + 500 }).refundedAmountCents).toBe(700)
  })
  it("G — total : refunded = brut, statut refunded", () => {
    expect(computePaymentRefundAggregate({ grossAmountCents: gross, succeededRefundCents: gross })).toMatchObject({ refundedAmountCents: gross, status: "refunded" })
  })
  it("la logique de remboursement ne touche jamais net/providerFee", () => {
    const src = readFileSync(join(process.cwd(), "lib/payments/refunds.ts"), "utf8")
    expect(src).not.toMatch(/netAmountCents|providerFeeAmountCents/)
  })
  it("une synchro après remboursement n'altère pas le net initial", async () => {
    state.row = { ...baseRow(), status: "partially_refunded" }
    const { p } = port(piWith(bt()))
    await syncStripePaymentFinancials({ ...input, port: p })
    expect(state.row).toMatchObject({ grossAmountCents: 2204, netAmountCents: 2147 })
  })
})

describe("H — isolation multi-tenant", () => {
  it("compte connecté différent : aucun appel Stripe, aucune écriture", async () => {
    const { p, calls } = port(piWith(bt()))
    expect(await syncStripePaymentFinancials({ ...input, connectedAccountId: "acct_B", port: p })).toEqual({ status: "skipped", reason: "account_mismatch" })
    expect(calls).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })
  it("compte absent : refusé", async () => {
    const { p, calls } = port(piWith(bt()))
    expect(await syncStripePaymentFinancials({ ...input, connectedAccountId: null, port: p })).toMatchObject({ status: "skipped" })
    state.tenantAccount = null
    expect(await syncStripePaymentFinancials({ ...input, port: p })).toMatchObject({ status: "skipped" })
    expect(calls).toHaveLength(0)
    expect(isExpectedConnectedAccount("", "")).toBe(false)
  })
  it("paiement non encaissé : ignoré", async () => {
    state.row = { ...baseRow(), status: "pending" }
    const { p, calls } = port(piWith(bt()))
    expect(await syncStripePaymentFinancials({ ...input, port: p })).toEqual({ status: "skipped", reason: "not_settled" })
    expect(calls).toHaveLength(0)
  })
})
