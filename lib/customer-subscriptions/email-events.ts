import { computeNextBillingAt, type ContractSubscriptionInput } from "./contract-summary"
import { addBillingInterval, type BillingInterval } from "./dates"
import { dedupeKeys, enqueueCustomerSubscriptionEmail, type EnqueueInput } from "./email-outbox"
import type { Executor } from "./engine"

/**
 * Événements email métier. Appelés DANS la transaction qui persiste la
 * transition (webhook signé ou action admin), APRÈS l'écriture d'état.
 *
 * Isolation : chaque enqueue s'exécute dans un SAVEPOINT. Un échec d'insertion
 * outbox est annulé seul (ROLLBACK TO SAVEPOINT) et n'interrompt JAMAIS la
 * transaction métier (invoice.paid, refund, activation, état Stripe).
 * Aucun appel Resend ici : le worker outbox envoie ensuite.
 * Payload : montants/dates uniquement — ni email, ni nom, ni token, ni id Stripe.
 */
export async function enqueueEmailSafely(tx: Executor, input: EnqueueInput, now: Date = new Date()): Promise<{ enqueued: boolean }> {
  try {
    return await tx.transaction((sp) => enqueueCustomerSubscriptionEmail(sp as unknown as Executor, input, now))
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "unknown"
    console.log("[customer-subscriptions] email enqueue failed", { type: input.type, code })
    return { enqueued: false }
  }
}

type SubRef = { companyId: number; id: number }
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** Dernière échéance avant `endAt` si UNE SEULE reste à prélever (sinon null). */
export function lastPaymentBefore(sub: ContractSubscriptionInput, endAt: Date | null, now: Date): Date | null {
  if (!endAt) return null
  const next = computeNextBillingAt({ ...sub, renewalOptOutAt: null, cancelAt: null }, now)
  if (!next || next.getTime() >= endAt.getTime()) return null
  const interval: BillingInterval = { unit: sub.billingIntervalUnitSnapshot as BillingInterval["unit"], count: sub.billingIntervalCountSnapshot }
  return addBillingInterval(next, interval).getTime() >= endAt.getTime() ? next : null
}

export const emailEvents = {
  requestReceived: async (tx: Executor, r: { companyId: number; requestId: number }, now: Date) => {
    await enqueueEmailSafely(tx, { companyId: r.companyId, requestId: r.requestId, type: "request_received", recipientRole: "client", dedupeKey: dedupeKeys.requestReceived(r.requestId, "client") }, now)
    await enqueueEmailSafely(tx, { companyId: r.companyId, requestId: r.requestId, type: "request_received_pro", recipientRole: "professional", dedupeKey: dedupeKeys.requestReceived(r.requestId, "professional") }, now)
  },
  requestAccepted: (tx: Executor, r: { companyId: number; requestId: number; subscriptionId: number }, now: Date) =>
    enqueueEmailSafely(tx, { companyId: r.companyId, requestId: r.requestId, subscriptionId: r.subscriptionId, type: "request_accepted", recipientRole: "client", dedupeKey: dedupeKeys.requestDecided(r.requestId, "accepted") }, now),
  requestRejected: (tx: Executor, r: { companyId: number; requestId: number }, now: Date) =>
    enqueueEmailSafely(tx, { companyId: r.companyId, requestId: r.requestId, type: "request_rejected", recipientRole: "client", dedupeKey: dedupeKeys.requestDecided(r.requestId, "rejected") }, now),

  initialCleaningPaid: async (tx: Executor, sub: SubRef, p: { amountCents: number; paidAt: Date }, now: Date) => {
    const payload = { amountCents: p.amountCents, paidAt: iso(p.paidAt) }
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "initial_cleaning_paid", recipientRole: "client", dedupeKey: dedupeKeys.initialCleaningPaid(sub.id, "client"), payload }, now)
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "initial_cleaning_to_do_pro", recipientRole: "professional", dedupeKey: dedupeKeys.initialCleaningPaid(sub.id, "professional"), payload }, now)
  },
  initialCleaningDone: (tx: Executor, sub: SubRef, now: Date) =>
    enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "initial_cleaning_done", recipientRole: "client", dedupeKey: dedupeKeys.initialCleaningDone(sub.id) }, now),

  activated: async (tx: Executor, sub: SubRef, now: Date) => {
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "subscription_activated", recipientRole: "client", dedupeKey: dedupeKeys.activated(sub.id, "client") }, now)
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "subscription_activated_pro", recipientRole: "professional", dedupeKey: dedupeKeys.activated(sub.id, "professional") }, now)
  },

  paymentSucceeded: (tx: Executor, sub: SubRef, p: { paymentId: number; amountCents: number; paidAt: Date; periodStart?: Date | null; periodEnd?: Date | null }, now: Date) =>
    enqueueEmailSafely(
      tx,
      {
        companyId: sub.companyId,
        subscriptionId: sub.id,
        type: "payment_succeeded",
        recipientRole: "client",
        dedupeKey: dedupeKeys.paymentSucceeded(p.paymentId),
        payload: { amountCents: p.amountCents, paidAt: iso(p.paidAt), periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd) },
      },
      now,
    ),

  /** `attemptKey` = id facture interne + n° de tentative : une relance Stripe = un email, un rejeu = zéro. */
  paymentFailed: async (tx: Executor, sub: SubRef, p: { attemptKey: string; amountCents: number; failedAt: Date }, now: Date) => {
    const payload = { amountCents: p.amountCents, failedAt: iso(p.failedAt) }
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "payment_failed", recipientRole: "client", dedupeKey: dedupeKeys.paymentFailed(p.attemptKey, "client"), payload }, now)
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "payment_failed_pro", recipientRole: "professional", dedupeKey: dedupeKeys.paymentFailed(p.attemptKey, "professional"), payload }, now)
  },
  paymentActionRequired: (tx: Executor, sub: SubRef, p: { attemptKey: string; amountCents: number }, now: Date) =>
    enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "payment_action_required", recipientRole: "client", dedupeKey: dedupeKeys.paymentActionRequired(p.attemptKey), payload: { amountCents: p.amountCents } }, now),

  renewalOptOut: async (tx: Executor, sub: ContractSubscriptionInput & SubRef, optOutAt: Date, now: Date) => {
    const endsAt = sub.currentTermEndsAt
    const last = lastPaymentBefore(sub, endsAt, now)
    const payload = { endsAt: iso(endsAt), lastPaymentAt: iso(last), lastPaymentCents: last ? sub.priceCentsSnapshot : null }
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "renewal_opt_out_confirmed", recipientRole: "client", dedupeKey: dedupeKeys.renewalOptOut(sub.id, optOutAt, "client"), payload }, now)
    await enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "renewal_opt_out_pro", recipientRole: "professional", dedupeKey: dedupeKeys.renewalOptOut(sub.id, optOutAt, "professional"), payload }, now)
  },
  renewalOptOutRevoked: (tx: Executor, sub: SubRef & { currentTermEndsAt: Date | null }, revokedAt: Date, now: Date) =>
    enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "renewal_opt_out_revoked", recipientRole: "client", dedupeKey: dedupeKeys.renewalOptOutRevoked(sub.id, revokedAt), payload: { termEndsAt: iso(sub.currentTermEndsAt) } }, now),

  cancellationScheduled: (tx: Executor, sub: ContractSubscriptionInput & SubRef, cancelAt: Date, now: Date) => {
    const last = lastPaymentBefore(sub, cancelAt, now)
    return enqueueEmailSafely(
      tx,
      {
        companyId: sub.companyId,
        subscriptionId: sub.id,
        type: "cancellation_scheduled",
        recipientRole: "client",
        dedupeKey: dedupeKeys.cancellationScheduled(sub.id, cancelAt),
        payload: { cancelAt: iso(cancelAt), lastPaymentAt: iso(last), lastPaymentCents: last ? sub.priceCentsSnapshot : null },
      },
      now,
    )
  },
  ended: (tx: Executor, sub: SubRef, endedAt: Date, now: Date) =>
    enqueueEmailSafely(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: "subscription_ended", recipientRole: "client", dedupeKey: dedupeKeys.ended(sub.id), payload: { endedAt: iso(endedAt) } }, now),

  refundSucceeded: (tx: Executor, sub: SubRef, r: { refundId: number; amountCents: number; refundedAt: Date; full: boolean }, now: Date) =>
    enqueueEmailSafely(
      tx,
      {
        companyId: sub.companyId,
        subscriptionId: sub.id,
        type: "refund_succeeded",
        recipientRole: "client",
        dedupeKey: dedupeKeys.refundSucceeded(r.refundId),
        payload: { amountCents: r.amountCents, refundedAt: iso(r.refundedAt), full: r.full },
      },
      now,
    ),
}
