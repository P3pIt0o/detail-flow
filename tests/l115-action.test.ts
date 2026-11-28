import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * L115 (revue métier) — comportement de l'action serveur `refundPaymentAction`,
 * avec le remboursement et l'e-mail simulés (plus de lecture du code source).
 */
vi.mock("server-only", () => ({}))

const m = vi.hoisted(() => ({
  requestRefund: vi.fn(),
  sendEmail: vi.fn(),
  requireCompanyRole: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/db/schema", () => ({ bookings: {}, bookingItems: {}, bookingItemOptions: {} }))
vi.mock("@/lib/admin", () => ({ requireCompanyMember: vi.fn(), requireCompanyRole: m.requireCompanyRole }))
vi.mock("@/lib/payments/refunds", () => ({ requestRefund: m.requestRefund }))
vi.mock("@/lib/email/notifications", () => ({
  sendBookingUpdatedEmail: vi.fn(),
  sendRefundConfirmationEmail: m.sendEmail,
}))
vi.mock("@/lib/booking/queries", () => ({ getSettings: vi.fn(), getActiveBookingsForDate: vi.fn(), countVehiclesForDate: vi.fn() }))
vi.mock("@/lib/booking/pricing", () => ({ buildQuote: vi.fn() }))
vi.mock("@/lib/booking/travel", () => ({ computeTravel: vi.fn() }))
vi.mock("@/lib/booking/availability", () => ({ timeToMinutes: vi.fn(), minutesToTime: vi.fn() }))

import { refundPaymentAction } from "@/app/admin/(dashboard)/reservations/[id]/actions"

const input = { bookingId: 10, paymentId: 20, amountCents: 1000, reason: "", idempotencyKey: "k-l115-action-xxxxxxxx" }

beforeEach(() => {
  m.requestRefund.mockReset()
  m.sendEmail.mockReset()
  m.requireCompanyRole.mockReset()
  m.requireCompanyRole.mockResolvedValue({ tenant: { id: 7 }, user: { id: "u-owner" } })
})

describe("L115 — refundPaymentAction", () => {
  it("solde insuffisant : phrase exacte de la fiche, nouvelle clé, aucun e-mail", async () => {
    m.requestRefund.mockResolvedValue({ ok: false, error: "insufficient_funds" })
    const r = await refundPaymentAction(input)
    expect(r).toEqual({
      ok: false,
      error:
        "Remboursement impossible pour l'instant : le solde de votre compte de paiement est insuffisant. Réessayez après votre prochain encaissement.",
      sameKey: false,
    })
    expect(m.sendEmail).not.toHaveBeenCalled()
  })

  it("le tenant vient du contexte serveur, jamais de l'entrée", async () => {
    m.requestRefund.mockResolvedValue({ ok: false, error: "payment_not_found" })
    await refundPaymentAction({ ...input, companyId: 999 } as typeof input)
    expect(m.requestRefund).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, initiatedByUserId: "u-owner" }))
  })

  it("Stripe confirme tout de suite : e-mail envoyé une fois ; doublon : pas de second envoi", async () => {
    m.requestRefund.mockResolvedValueOnce({ ok: true, refundId: 55, status: "succeeded" })
    expect(await refundPaymentAction(input)).toMatchObject({ ok: true, status: "succeeded" })
    expect(m.sendEmail).toHaveBeenCalledTimes(1)
    expect(m.sendEmail).toHaveBeenCalledWith(55, 7)

    m.requestRefund.mockResolvedValueOnce({ ok: true, refundId: 55, status: "succeeded", duplicate: true })
    await refundPaymentAction(input)
    expect(m.sendEmail).toHaveBeenCalledTimes(1)
  })

  it("remboursement en attente : aucun e-mail (le webhook l'enverra)", async () => {
    m.requestRefund.mockResolvedValue({ ok: true, refundId: 56, status: "pending" })
    await refundPaymentAction(input)
    expect(m.sendEmail).not.toHaveBeenCalled()
  })

  it("e-mail en échec : le remboursement reste un succès", async () => {
    m.requestRefund.mockResolvedValue({ ok: true, refundId: 57, status: "succeeded" })
    m.sendEmail.mockRejectedValue(new Error("Resend down"))
    expect(await refundPaymentAction(input)).toMatchObject({ ok: true, status: "succeeded" })
  })

  it("erreur temporaire : même clé conservée ; montant changé : message court", async () => {
    m.requestRefund.mockResolvedValueOnce({ ok: false, error: "temporary" })
    expect(await refundPaymentAction(input)).toMatchObject({ ok: false, sameKey: true })
    m.requestRefund.mockResolvedValueOnce({ ok: false, error: "retry_amount_mismatch" })
    expect(await refundPaymentAction(input)).toEqual({
      ok: false,
      error: "Le montant a changé, veuillez valider à nouveau.",
      sameKey: false,
    })
  })
})
