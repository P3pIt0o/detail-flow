import { and, eq, sql } from "drizzle-orm"
import { maintenanceSubscriptionEmailOutbox as outbox } from "@/lib/db/schema"
import type { Executor } from "./engine"

/**
 * INVARIANT OUTBOX : dedupeKey UNIQUE → un email logique est envoyé au plus une
 * fois. Enqueue = INSERT ... ON CONFLICT DO NOTHING (rejouable). Claim atomique
 * FOR UPDATE SKIP LOCKED : deux workers concurrents ne réclament jamais la même
 * ligne. Aucune adresse ni token dans la table : le destinataire est résolu au
 * moment de l'envoi depuis la ressource (companyId + id).
 */
export const OUTBOX_MAX_ATTEMPTS = 5
export const OUTBOX_STALE_SENDING_MS = 10 * 60 * 1000

export const CUSTOMER_SUBSCRIPTION_EMAIL_TYPES = [
  "request_received",
  "request_received_pro",
  "request_accepted",
  "request_rejected",
  "initial_cleaning_paid",
  "initial_cleaning_to_do_pro",
  "initial_cleaning_done",
  "subscription_activated",
  "subscription_activated_pro",
  "payment_succeeded",
  "payment_failed",
  "payment_failed_pro",
  "payment_action_required",
  "billing_notice",
  "renewal_notice",
  "commitment_ending_notice",
  "term_ending_notice",
  "renewal_opt_out_confirmed",
  "renewal_opt_out_pro",
  "renewal_opt_out_revoked",
  "cancellation_scheduled",
  "subscription_ended",
  "early_cancellation_requested_pro",
  "early_cancellation_decided",
  "refund_succeeded",
] as const
export type CustomerSubscriptionEmailType = (typeof CUSTOMER_SUBSCRIPTION_EMAIL_TYPES)[number]

export type EnqueueInput = {
  companyId: number
  subscriptionId?: number | null
  requestId?: number | null
  cancellationRequestId?: number | null
  type: CustomerSubscriptionEmailType
  recipientRole: "client" | "professional"
  dedupeKey: string
  sendAt?: Date
  /** Données NON sensibles (montants, dates, ids Stripe internes exclus). */
  payload?: Record<string, unknown>
}

/** Clés de déduplication canoniques. */
export const dedupeKeys = {
  requestReceived: (requestId: number, role: "client" | "professional") => `request_received:${requestId}:${role}`,
  requestDecided: (requestId: number, decision: "accepted" | "rejected") => `request_${decision}:${requestId}`,
  initialCleaningPaid: (subscriptionId: number, role: "client" | "professional") => `initial_cleaning_paid:${subscriptionId}:${role}`,
  initialCleaningDone: (subscriptionId: number) => `initial_cleaning_done:${subscriptionId}`,
  activated: (subscriptionId: number, role: "client" | "professional") => `activated:${subscriptionId}:${role}`,
  paymentSucceeded: (paymentId: number) => `payment_succeeded:${paymentId}`,
  paymentFailed: (invoiceId: string, role: "client" | "professional") => `payment_failed:${invoiceId}:${role}`,
  paymentActionRequired: (invoiceId: string) => `payment_action_required:${invoiceId}`,
  billingNotice: (subscriptionId: number, boundary: Date) => `billing_notice:${subscriptionId}:${boundary.toISOString()}`,
  renewalNotice: (subscriptionId: number, termEndsAt: Date) => `renewal_notice:${subscriptionId}:${termEndsAt.toISOString()}`,
  renewalOptOut: (subscriptionId: number, optOutAt: Date, role: "client" | "professional") =>
    `renewal_opt_out:${subscriptionId}:${optOutAt.toISOString()}:${role}`,
  renewalOptOutRevoked: (subscriptionId: number, revokedAt: Date) => `renewal_opt_out_revoked:${subscriptionId}:${revokedAt.toISOString()}`,
  cancellationScheduled: (subscriptionId: number, cancelAt: Date) => `cancellation_scheduled:${subscriptionId}:${cancelAt.toISOString()}`,
  ended: (subscriptionId: number) => `ended:${subscriptionId}`,
  earlyCancellationRequested: (cancellationRequestId: number) => `early_cancellation_requested:${cancellationRequestId}`,
  earlyCancellationDecided: (cancellationRequestId: number) => `early_cancellation_decided:${cancellationRequestId}`,
  refundSucceeded: (refundId: number) => `refund_succeeded:${refundId}`,
}

export async function enqueueCustomerSubscriptionEmail(db: Executor, input: EnqueueInput, now: Date = new Date()): Promise<{ enqueued: boolean }> {
  const rows = await db
    .insert(outbox)
    .values({
      companyId: input.companyId,
      subscriptionId: input.subscriptionId ?? null,
      requestId: input.requestId ?? null,
      cancellationRequestId: input.cancellationRequestId ?? null,
      type: input.type,
      recipientRole: input.recipientRole,
      dedupeKey: input.dedupeKey,
      payload: input.payload ?? {},
      sendAt: input.sendAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: outbox.dedupeKey })
    .returning({ id: outbox.id })
  return { enqueued: rows.length > 0 }
}

export type OutboxRow = typeof outbox.$inferSelect

/** Réclame atomiquement jusqu'à `limit` emails dus (pending, failed retentable, sending périmé). */
export async function claimDueEmails(db: Executor, now: Date, limit = 50): Promise<OutboxRow[]> {
  const stale = new Date(now.getTime() - OUTBOX_STALE_SENDING_MS)
  const result = await db.execute(sql`
    UPDATE "maintenance_subscription_email_outbox" o
       SET "status" = 'sending', "attempts" = o."attempts" + 1, "claimedAt" = ${now}, "updatedAt" = ${now}
     WHERE o."id" IN (
       SELECT "id" FROM "maintenance_subscription_email_outbox"
        WHERE "sendAt" <= ${now}
          AND (
            "status" = 'pending'
            OR ("status" = 'failed' AND "attempts" < ${OUTBOX_MAX_ATTEMPTS})
            OR ("status" = 'sending' AND "claimedAt" < ${stale} AND "attempts" < ${OUTBOX_MAX_ATTEMPTS})
          )
        ORDER BY "sendAt" ASC, "id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING o."id"`)
  const ids = ((result as unknown as { rows?: Array<{ id: number }> }).rows ?? (result as unknown as Array<{ id: number }>)).map((r) => Number(r.id))
  if (ids.length === 0) return []
  const rows = await db.select().from(outbox).where(sql`${outbox.id} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
  return rows.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.id - b.id)
}

/** Ne passe à `sent` que si la ligne est encore réclamée (status = sending). Jamais renvoyé ensuite. */
export async function markEmailSent(db: Executor, row: Pick<OutboxRow, "id" | "companyId">, providerMessageId: string | null, now: Date) {
  await db
    .update(outbox)
    .set({ status: "sent", sentAt: now, providerMessageId, lastErrorCode: null, updatedAt: now })
    .where(and(eq(outbox.id, row.id), eq(outbox.companyId, row.companyId), eq(outbox.status, "sending")))
}

export async function markEmailFailed(db: Executor, row: Pick<OutboxRow, "id" | "companyId">, code: string, now: Date) {
  await db
    .update(outbox)
    .set({ status: "failed", lastErrorCode: code.slice(0, 64), updatedAt: now })
    .where(and(eq(outbox.id, row.id), eq(outbox.companyId, row.companyId), eq(outbox.status, "sending")))
}

export async function markEmailSkipped(db: Executor, row: Pick<OutboxRow, "id" | "companyId">, code: string, now: Date) {
  await db
    .update(outbox)
    .set({ status: "skipped", lastErrorCode: code.slice(0, 64), updatedAt: now })
    .where(and(eq(outbox.id, row.id), eq(outbox.companyId, row.companyId), eq(outbox.status, "sending")))
}

/** « Renvoyer » admin : remet en file le MÊME email (même dedupeKey) s'il a échoué. */
export async function requeueFailedEmail(db: Executor, companyId: number, outboxId: number, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(outbox)
    .set({ status: "pending", attempts: 0, sendAt: now, updatedAt: now })
    .where(and(eq(outbox.id, outboxId), eq(outbox.companyId, companyId), eq(outbox.status, "failed")))
    .returning({ id: outbox.id })
  return rows.length > 0
}
