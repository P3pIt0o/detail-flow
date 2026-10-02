import "server-only"
import { db } from "@/lib/db"
import { companies, payments } from "@/lib/db/schema"
import { and, asc, eq, inArray, isNotNull, or, isNull, sql } from "drizzle-orm"
import { getStripe } from "./stripe-client"
import { getStripeAccountIdForCompany } from "./queries"
import {
  SETTLED_PAYMENT_STATUSES,
  computeStripeFinancials,
  extractChargeAndBalanceTransaction,
  isExpectedConnectedAccount,
  isSettledPaymentStatus,
  planFinancialsUpdate,
} from "./financials-logic"

/**
 * Synchronisation des frais Stripe réels + net initial d'un paiement réservation
 * (Direct Charge). Donnée comptable SECONDAIRE : ne lève jamais d'erreur, ne
 * touche ni au statut du paiement, ni à la réservation, ni au brut, ni à la
 * commission snapshot. Les remboursements ne sont pas concernés.
 */

/** Accès Stripe minimal, injectable pour les tests (aucun réseau). */
export type StripeFinancialsPort = {
  retrievePaymentIntentWithBalance(paymentIntentId: string, stripeAccount: string): Promise<unknown>
  retrieveCheckoutSessionPaymentIntentId(sessionId: string, stripeAccount: string): Promise<string | null>
}

function defaultPort(): StripeFinancialsPort {
  const stripe = getStripe()
  return {
    retrievePaymentIntentWithBalance: (id, stripeAccount) =>
      stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount }),
    retrieveCheckoutSessionPaymentIntentId: async (id, stripeAccount) => {
      const s = await stripe.checkout.sessions.retrieve(id, undefined, { stripeAccount })
      const pi = s.payment_intent
      return typeof pi === "string" ? pi : (pi?.id ?? null)
    },
  }
}

export type SyncFinancialsStatus =
  | "synced"
  | "already_synced"
  | "unavailable"
  | "skipped"
  | "conflict"
  | "error"

export type SyncFinancialsResult = { status: SyncFinancialsStatus; reason?: string }

export async function syncStripePaymentFinancials(input: {
  companyId: number
  bookingId: number
  externalPaymentId: string
  /** Compte connecté DÉJÀ vérifié par l'appelant (event.account / tenant). */
  connectedAccountId: string | null
  paymentIntentId?: string | null
  port?: StripeFinancialsPort
}): Promise<SyncFinancialsResult> {
  const { companyId, bookingId, externalPaymentId } = input
  try {
    const tenantAccountId = await getStripeAccountIdForCompany(companyId)
    if (!isExpectedConnectedAccount(tenantAccountId, input.connectedAccountId)) {
      return { status: "skipped", reason: "account_mismatch" }
    }
    const stripeAccount = tenantAccountId as string

    const [pay] = await db
      .select({
        id: payments.id,
        status: payments.status,
        currency: payments.currency,
        grossAmountCents: payments.grossAmountCents,
        providerFeeAmountCents: payments.providerFeeAmountCents,
        netAmountCents: payments.netAmountCents,
        meta: payments.meta,
      })
      .from(payments)
      .where(
        and(
          eq(payments.provider, "stripe"),
          eq(payments.externalPaymentId, externalPaymentId),
          eq(payments.companyId, companyId),
          eq(payments.bookingId, bookingId),
        ),
      )
      .limit(1)
    if (!pay) return { status: "skipped", reason: "payment_not_found" }
    if (!isSettledPaymentStatus(pay.status)) return { status: "skipped", reason: "not_settled" }
    // Snapshot déjà complet : aucun appel Stripe, aucune écriture (rejeu webhook).
    if (pay.providerFeeAmountCents != null && pay.netAmountCents != null) return { status: "already_synced" }

    const port = input.port ?? defaultPort()
    const metaPi = (pay.meta as { paymentIntentId?: unknown } | null)?.paymentIntentId
    const paymentIntentId =
      input.paymentIntentId ??
      (typeof metaPi === "string" ? metaPi : null) ??
      (await port.retrieveCheckoutSessionPaymentIntentId(externalPaymentId, stripeAccount))
    if (!paymentIntentId) return logUnavailable(pay.id, "payment_intent_missing")

    const pi = await port.retrievePaymentIntentWithBalance(paymentIntentId, stripeAccount)
    const found = extractChargeAndBalanceTransaction(pi)
    if (!found) return logUnavailable(pay.id, "balance_transaction_unavailable")

    const fin = computeStripeFinancials(found.balanceTransaction, {
      grossAmountCents: pay.grossAmountCents,
      currency: pay.currency,
    })
    if (!fin.ok) return logUnavailable(pay.id, fin.reason)

    const plan = planFinancialsUpdate(pay, fin)
    if (plan === "noop") return { status: "already_synced" }
    if (plan === "conflict") {
      console.log("[v0] payments financials: snapshot existant différent, non écrasé", { paymentId: pay.id })
      return { status: "conflict" }
    }

    // Écriture atomique : seulement si les champs sont encore NULL ou identiques.
    const updated = await db
      .update(payments)
      .set({
        providerFeeAmountCents: fin.providerFeeAmountCents,
        netAmountCents: fin.netAmountCents,
        meta: sql`coalesce(${payments.meta}, '{}'::jsonb) || ${JSON.stringify({
          paymentIntentId,
          stripeChargeId: found.chargeId,
          stripeBalanceTransactionId: fin.balanceTransactionId,
        })}::jsonb`,
      })
      .where(
        and(
          eq(payments.id, pay.id),
          eq(payments.companyId, companyId),
          sql`coalesce(${payments.providerFeeAmountCents}, ${fin.providerFeeAmountCents}) = ${fin.providerFeeAmountCents}`,
          sql`coalesce(${payments.netAmountCents}, ${fin.netAmountCents}) = ${fin.netAmountCents}`,
        ),
      )
      .returning({ id: payments.id })
    return updated.length > 0 ? { status: "synced" } : { status: "already_synced" }
  } catch (e) {
    // Jamais bloquant : le paiement reste paid, la réservation confirmed.
    console.log("[v0] payments financials: synchronisation différée", {
      companyId,
      bookingId,
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    })
    return { status: "error" }
  }
}

/**
 * Retry automatique via `charge.updated` (capture asynchrone : la
 * balance_transaction n'existe pas encore à checkout.session.completed).
 * Le paiement est retrouvé par le PaymentIntent déjà persisté dans
 * payments.meta, borné au tenant dont le compte connecté = event.account,
 * puis délégué à syncStripePaymentFinancials (mêmes garanties d'idempotence,
 * de non-écrasement et de vérification de compte).
 */
export async function syncStripePaymentFinancialsByPaymentIntent(input: {
  paymentIntentId: string
  /** event.account du webhook Connect. */
  connectedAccountId: string | null
  port?: StripeFinancialsPort
}): Promise<SyncFinancialsResult> {
  const { paymentIntentId, connectedAccountId } = input
  if (!paymentIntentId || !connectedAccountId) return { status: "skipped", reason: "missing_identifiers" }
  try {
    const rows = await db
      .select({
        companyId: payments.companyId,
        bookingId: payments.bookingId,
        externalPaymentId: payments.externalPaymentId,
      })
      .from(payments)
      .where(
        and(
          eq(payments.provider, "stripe"),
          sql`${payments.meta}->>'paymentIntentId' = ${paymentIntentId}`,
          inArray(payments.status, [...SETTLED_PAYMENT_STATUSES]),
          sql`${payments.companyId} IN (SELECT ${companies.id} FROM ${companies} WHERE ${companies.stripeAccountId} = ${connectedAccountId})`,
        ),
      )
      .limit(2)
    if (rows.length === 0) return { status: "skipped", reason: "payment_not_found" }
    if (rows.length > 1) {
      console.log("[v0] payments financials: PaymentIntent ambigu, aucune écriture")
      return { status: "skipped", reason: "ambiguous" }
    }
    const row = rows[0]
    if (!row.externalPaymentId) return { status: "skipped", reason: "payment_not_found" }
    return await syncStripePaymentFinancials({
      companyId: row.companyId,
      bookingId: row.bookingId,
      externalPaymentId: row.externalPaymentId,
      connectedAccountId,
      paymentIntentId,
      port: input.port,
    })
  } catch (e) {
    console.log("[v0] payments financials: synchro charge.updated différée", {
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    })
    return { status: "error" }
  }
}

function logUnavailable(paymentId: number, reason: string): SyncFinancialsResult {
  console.log("[v0] payments financials: réconciliation nécessaire", { paymentId, reason })
  return { status: "unavailable", reason }
}

export type ReconcileFinancialsReport = {
  companyId: number
  dryRun: boolean
  candidates: number
  results: Record<SyncFinancialsStatus, number>
}

/**
 * Réconciliation VOLONTAIRE, tenant par tenant, des paiements encaissés dont
 * providerFee/net sont NULL. Stripe reste la seule source de vérité ; les
 * paiements introuvables dans le compte connecté (anciens flux) sont ignorés.
 * `dryRun` (défaut) : liste les candidats sans appel Stripe ni écriture.
 * Jamais exécutée automatiquement.
 */
export async function reconcileStripePaymentFinancials(input: {
  companyId: number
  dryRun?: boolean
  limit?: number
  port?: StripeFinancialsPort
}): Promise<ReconcileFinancialsReport> {
  const dryRun = input.dryRun !== false
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200)
  const results: Record<SyncFinancialsStatus, number> = {
    synced: 0,
    already_synced: 0,
    unavailable: 0,
    skipped: 0,
    conflict: 0,
    error: 0,
  }

  const rows = await db
    .select({ bookingId: payments.bookingId, externalPaymentId: payments.externalPaymentId })
    .from(payments)
    .where(
      and(
        eq(payments.companyId, input.companyId),
        eq(payments.provider, "stripe"),
        inArray(payments.status, [...SETTLED_PAYMENT_STATUSES]),
        isNotNull(payments.externalPaymentId),
        or(isNull(payments.providerFeeAmountCents), isNull(payments.netAmountCents)),
      ),
    )
    .orderBy(asc(payments.id))
    .limit(limit)

  if (dryRun) return { companyId: input.companyId, dryRun, candidates: rows.length, results }

  const connectedAccountId = await getStripeAccountIdForCompany(input.companyId)
  for (const r of rows) {
    const res = await syncStripePaymentFinancials({
      companyId: input.companyId,
      bookingId: r.bookingId,
      externalPaymentId: r.externalPaymentId as string,
      connectedAccountId,
      port: input.port,
    })
    results[res.status] += 1
  }
  return { companyId: input.companyId, dryRun, candidates: rows.length, results }
}
