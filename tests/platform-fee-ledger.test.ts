import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildCheckoutAttemptKey,
  buildCheckoutIdempotencyKey,
  computeRefundReleaseDeltaCents,
  CHECKOUT_ATTEMPT_WINDOW_MS,
} from "@/lib/payments/platform-fee-ledger-logic"
import { COMMISSION_RULES, resolveCommercialCommission } from "@/lib/billing/commercial-rules"
import { PLAN_MATRIX } from "@/lib/licensing/registry"

const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8")

describe("platform fee ledger — logique pure", () => {
  const base = { companyId: 7, bookingId: 42, type: "deposit", grossAmountCents: 3000 }

  it("même tentative logique dans la fenêtre → même clé (double clic)", () => {
    const t = new Date("2026-10-10T10:00:00Z")
    const a = buildCheckoutAttemptKey({ ...base, now: t })
    const b = buildCheckoutAttemptKey({ ...base, now: new Date(t.getTime() + 1000) })
    expect(a).toBe(b)
  })

  it("clé différente par tenant, réservation, type, montant et fenêtre", () => {
    const now = new Date("2026-10-10T10:00:00Z")
    const k = buildCheckoutAttemptKey({ ...base, now })
    expect(buildCheckoutAttemptKey({ ...base, companyId: 8, now })).not.toBe(k)
    expect(buildCheckoutAttemptKey({ ...base, bookingId: 43, now })).not.toBe(k)
    expect(buildCheckoutAttemptKey({ ...base, type: "full", now })).not.toBe(k)
    expect(buildCheckoutAttemptKey({ ...base, grossAmountCents: 3001, now })).not.toBe(k)
    expect(
      buildCheckoutAttemptKey({ ...base, now: new Date(now.getTime() + CHECKOUT_ATTEMPT_WINDOW_MS) }),
    ).not.toBe(k)
  })

  it("clé d'idempotence Stripe dérivée de la réservation", () => {
    expect(buildCheckoutIdempotencyKey(12)).toBe("df-booking-checkout-res-12")
    expect(buildCheckoutIdempotencyKey(12)).not.toBe(buildCheckoutIdempotencyKey(13))
  })

  it("remboursement : libère le delta réel, jamais deux fois, jamais au-delà", () => {
    expect(computeRefundReleaseDeltaCents({ reservedCents: 30, alreadyReleasedCents: 0, refundedTotalCents: 10 })).toBe(10)
    expect(computeRefundReleaseDeltaCents({ reservedCents: 30, alreadyReleasedCents: 10, refundedTotalCents: 10 })).toBe(0)
    expect(computeRefundReleaseDeltaCents({ reservedCents: 30, alreadyReleasedCents: 10, refundedTotalCents: 30 })).toBe(20)
    expect(computeRefundReleaseDeltaCents({ reservedCents: 30, alreadyReleasedCents: 0, refundedTotalCents: 999 })).toBe(30)
    expect(computeRefundReleaseDeltaCents({ reservedCents: 30, alreadyReleasedCents: 30, refundedTotalCents: 5 })).toBe(0)
    expect(computeRefundReleaseDeltaCents({ reservedCents: 0, alreadyReleasedCents: 0, refundedTotalCents: 10 })).toBe(0)
  })
})

describe("ESSENTIEL / FREE — règle commerciale sans ouverture des droits", () => {
  it("la règle FREE existe (2 % / 19,90 €)", () => {
    expect(COMMISSION_RULES.FREE).toMatchObject({ feeBps: 200, monthlyFeeCapCents: 1990 })
    expect(resolveCommercialCommission({ billingMode: "free", licensePlan: "FREE", platformFeeBps: null }, 300)).toMatchObject({
      feeBps: 200,
      monthlyFeeCapCents: 1990,
      source: "plan",
    })
  })

  it("PLAN_MATRIX.FREE n'accorde TOUJOURS PAS online_payments (décision séparée avant commercialisation)", () => {
    expect(PLAN_MATRIX.FREE.features.online_payments).toBe(false)
  })
})

describe("câblage — contrôles structurels", () => {
  const queries = read("lib/payments/queries.ts")
  const webhook = read("app/api/payments/webhook/route.ts")

  it("createBookingCheckout réserve AVANT Stripe et envoie le montant réservé tel quel", () => {
    const reserveAt = queries.indexOf("await reservePlatformFee(")
    const createAt = queries.indexOf("provider.createPayment(")
    expect(reserveAt).toBeGreaterThan(0)
    expect(createAt).toBeGreaterThan(reserveAt)
    expect(queries).toContain("applicationFeeCents: reservation.feeCents")
    expect(queries).toContain("platformFeeAmountCents: reservation.feeCents")
    expect(queries).not.toContain("computePlatformFeeCents(")
    expect(queries).not.toContain("resolvePlatformFeeBps(")
  })

  it("échec Stripe → libération uniquement par le créateur de la réservation", () => {
    expect(queries).toMatch(/if \(reservation\.created\)\s*\{\s*await releasePlatformFeeReservation\(/)
    expect(queries).toContain('reason: "stripe_create_failed"')
  })

  it("webhook Connect : consommation au paiement, libération à l'expiration", () => {
    expect(webhook).toContain("consumePlatformFeeReservation({ externalPaymentId: session.id, companyId })")
    expect(webhook).toContain('reason: "checkout_expired"')
  })

  it("aucun taux/plafond chiffré dupliqué hors commercial-rules", () => {
    for (const f of ["lib/payments/queries.ts", "lib/payments/platform-fee-ledger.ts", "lib/payments/config.ts"]) {
      const src = read(f)
      expect(src).not.toMatch(/\b(1990|feeBps:\s*(200|100|50|25))\b/)
    }
  })
})
