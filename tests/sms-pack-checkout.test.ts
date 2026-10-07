import { describe, expect, it, vi } from "vitest"
import {
  buildSmsPackCheckoutParams,
  handleSmsPackWebhookEvent,
  isSmsPackSession,
  smsCheckoutIdempotencyKey,
  type SmsPackWebhookDeps,
  type StoredSmsRecharge,
} from "@/lib/sms/checkout-core"
import { amountForQuantity, SMS_MONTHLY_INCLUDED_BY_PLAN, SMS_PACKS } from "@/lib/sms/config"
import { planFeature } from "@/lib/licensing/registry"

const recharge: StoredSmsRecharge = {
  id: 7,
  companyId: 42,
  quantity: 100,
  amountCents: 1200,
  status: "pending",
  paymentProvider: "stripe",
  stripeCheckoutSessionId: "cs_1",
}

function paidSession(over: Record<string, unknown> = {}) {
  const p = buildSmsPackCheckoutParams({ ...recharge, reference: "SMS-X" }, { successUrl: "s", cancelUrl: "c" })
  return { id: "cs_1", mode: "payment", payment_status: "paid", currency: "eur", amount_total: 1200, metadata: p.metadata, ...over }
}

function deps(over: Partial<SmsPackWebhookDeps> = {}) {
  let paid = false
  const d = {
    getRecharge: vi.fn(async () => ({ ...recharge, status: paid ? "paid" : "pending" })),
    credit: vi.fn(async () => {
      const already = paid
      paid = true
      return { ok: true as const, already, quantity: 100, newBalance: 100 }
    }),
    cancel: vi.fn(async () => true),
    allocate: vi.fn(async () => ({ ok: true })),
    notifyCredited: vi.fn(async () => {}),
    ...over,
  }
  return d
}

describe("SMS — politique FREE / PRO et prix des packs", () => {
  it("feature sms ouverte FREE/PRO, quotas mensuels 0 / 20", () => {
    expect(planFeature("FREE", "sms")).toBe(true)
    expect(planFeature("PRO", "sms")).toBe(true)
    expect(SMS_MONTHLY_INCLUDED_BY_PLAN.FREE).toBe(0)
    expect(SMS_MONTHLY_INCLUDED_BY_PLAN.PRO).toBe(20)
  })
  it("packs inchangés et montant recalculé serveur", () => {
    expect(SMS_PACKS.map((p) => [p.quantity, amountForQuantity(p.quantity)])).toEqual([
      [20, 300],
      [50, 700],
      [100, 1200],
      [200, 2000],
    ])
    expect(amountForQuantity(30)).toBe(360)
  })
})

describe("SMS — Checkout plateforme", () => {
  it("mode payment, EUR, montant DB, metadata centralisées, idempotence déterministe", () => {
    const p = buildSmsPackCheckoutParams({ ...recharge, reference: "SMS-X" }, { successUrl: "s", cancelUrl: "c" })
    expect(p.mode).toBe("payment")
    expect(p.line_items[0].price_data.unit_amount).toBe(1200)
    expect(p.line_items[0].quantity).toBe(1)
    expect(p.metadata).toMatchObject({ detailflow_kind: "sms_pack", company_id: "42", sms_recharge_request_id: "7", sms_quantity: "100" })
    expect(isSmsPackSession(p)).toBe(true)
    expect(smsCheckoutIdempotencyKey(7)).toBe(smsCheckoutIdempotencyKey(7))
  })
})

describe("SMS — webhook Billing", () => {
  it("payé → 1 crédit + 1 email ; rejeu → 0 crédit supplémentaire, pas d'email", async () => {
    const d = deps()
    const r1 = await handleSmsPackWebhookEvent("checkout.session.completed", paidSession(), d)
    const r2 = await handleSmsPackWebhookEvent("checkout.session.completed", paidSession(), d)
    expect(r1.body.credited).toBe(true)
    expect(r2.body.credited).toBe(false)
    expect(d.notifyCredited).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["montant incohérent", { amount_total: 100 }, "amount_mismatch"],
    ["mauvais sessionId", { id: "cs_other" }, "session_mismatch"],
    ["mauvaise devise", { currency: "usd" }, "currency"],
  ])("%s → refus sans crédit", async (_l, over, reason) => {
    const d = deps()
    const r = await handleSmsPackWebhookEvent("checkout.session.completed", paidSession(over), d)
    expect(r.body.rejected).toBe(reason)
    expect(d.credit).not.toHaveBeenCalled()
  })

  it("mauvais tenant → refus", async () => {
    const s = paidSession()
    s.metadata = { ...s.metadata, company_id: "99" }
    const d = deps()
    const r = await handleSmsPackWebhookEvent("checkout.session.completed", s, d)
    expect(r.body.rejected).toBe("company_mismatch")
    expect(d.credit).not.toHaveBeenCalled()
  })

  it.each(["checkout.session.expired", "checkout.session.async_payment_failed"])("%s → annulation, aucun crédit", async (evt) => {
    const d = deps()
    await handleSmsPackWebhookEvent(evt, paidSession({ payment_status: "unpaid" }), d)
    expect(d.cancel).toHaveBeenCalledWith(7, 42, "cs_1")
    expect(d.credit).not.toHaveBeenCalled()
  })

  it("AllMySMS échoue après crédit → 500 (retry), crédit conservé, rejeu sans double crédit", async () => {
    const d = deps({ allocate: vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true }) })
    const r1 = await handleSmsPackWebhookEvent("checkout.session.completed", paidSession(), d)
    expect(r1.status).toBe(500)
    expect(r1.body.credited).toBe(true)
    const r2 = await handleSmsPackWebhookEvent("checkout.session.completed", paidSession(), d)
    expect(r2.status).toBe(200)
    expect(r2.body.credited).toBe(false)
    expect(d.notifyCredited).toHaveBeenCalledTimes(1)
  })
})
