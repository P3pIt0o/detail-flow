/**
 * MOTEUR STRIPE CONNECT (Direct Charges) des abonnements clients.
 *
 * - Tous les appels Stripe se font avec `stripeAccount = providerAccountId`
 *   du CONTRAT (snapshot), jamais une valeur venant du navigateur.
 * - Prix / périodicité : snapshots du contrat uniquement.
 * - Commission : plan DetailFlow EFFECTIF au moment de la facturation
 *   (resolveCurrentCustomerSubscriptionFee → plan-policy.ts). Les
 *   maintenance_payments déjà écrits ne sont jamais recalculés.
 * - Webhooks : event.account OBLIGATOIRE et égal à providerAccountId. Les
 *   metadata ne sont que des indices de recherche, toujours re-vérifiés en DB.
 * - Ordre des événements non supposé : chaque handler est idempotent et peut
 *   lier les IDs externes manquants (invoice.paid avant checkout.completed…).
 * - Annulation ≠ remboursement : rien ici ne rembourse.
 *
 * Le port Stripe est injecté (adapter réel : stripe.ts) pour tester sans réseau.
 */
import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { companies, maintenancePayments, maintenanceRefunds, maintenanceSubscriptions } from "@/lib/db/schema"
import {
  computeStripeFinancials,
  extractChargeAndBalanceTransaction,
  isSettledPaymentStatus,
  planFinancialsUpdate,
} from "@/lib/payments/financials-logic"
import { CustomerSubscriptionError } from "./errors"
import { computePlatformFeeAmountCents } from "./contract"
import { computeNextRenewalTerm, type BillingInterval, type Commitment, type RenewalMode } from "./dates"
import {
  appendMaintenanceAudit,
  activateSubscription,
  assertCanMutate,
  createCycleIfMissing,
  forceEndSubscription,
  requestRenewalOptOut,
  resolveCurrentCustomerSubscriptionFee,
  revokeRenewalOptOut,
  scheduleCancellation,
  type Actor,
  type Executor,
} from "./engine"
import { isTerminalStatus } from "./statuses"
import {
  CUSTOMER_SUBSCRIPTION_MODULE,
  bpsFromFeePercent,
  buildCheckoutSessionParams,
  checkoutIdempotencyKey,
  decideProviderDeletion,
  desiredProviderCancelAt,
  nextRefundStatus,
  normalizeRefundStatus,
  paymentStatusAfterRefunds,
  planTermRenewal,
  providerAccessDecision,
  statusAfterPaymentActionRequired,
  feeBpsForCharged,
  invoiceChargedFeeCents,
  feePercentFromBps,
  invoiceMetadata,
  invoicePaymentIntentId,
  invoicePeriod,
  invoiceSubscriptionId,
  parseFeeBpsMetadata,
  parseModuleMetadata,
  periodProbe,
  resolveCheckoutKind,
  statusAfterPaymentFailed,
  statusAfterRecovery,
  type CheckoutKind,
  type CheckoutSessionParams,
  type InvoiceLike,
} from "./stripe-mapping"
import { buildCustomerSubscriptionReturnUrl, type ReturnUrlContext } from "./return-url"

/* --------------------------------- Port ---------------------------------- */

type Ref = string | { id: string } | null | undefined
const idOf = (v: Ref): string | null => (typeof v === "string" ? v : v?.id ?? null)

export type StripeCallOptions = { stripeAccount: string; idempotencyKey?: string }

export type CheckoutSessionLike = {
  id: string
  status?: string | null
  payment_status?: string | null
  mode?: string | null
  client_secret?: string | null
  url?: string | null
  customer?: Ref
  subscription?: Ref
  payment_intent?: Ref
  amount_total?: number | null
  currency?: string | null
  metadata?: Record<string, string> | null
}

export type SubscriptionLike = {
  id: string
  status?: string | null
  metadata?: Record<string, string> | null
  customer?: Ref
  application_fee_percent?: number | null
  cancel_at?: number | null
  cancel_at_period_end?: boolean | null
  ended_at?: number | null
  canceled_at?: number | null
}

export type RefundLike = {
  id: string
  amount?: number | null
  currency?: string | null
  status?: string | null
  reason?: string | null
  payment_intent?: Ref
  charge?: Ref
}

export type ChargeLike = {
  id: string
  payment_intent?: Ref
  refunds?: { data?: RefundLike[] | null } | null
}

export type PaymentIntentLike = { id: string; application_fee_amount?: number | null; amount_received?: number | null }

export interface CustomerSubscriptionStripePort {
  createCheckoutSession(params: CheckoutSessionParams, opts: StripeCallOptions): Promise<CheckoutSessionLike>
  retrieveCheckoutSession(id: string, opts: StripeCallOptions): Promise<CheckoutSessionLike>
  retrieveSubscription(id: string, opts: StripeCallOptions): Promise<SubscriptionLike>
  updateSubscription(id: string, params: Record<string, unknown>, opts: StripeCallOptions): Promise<SubscriptionLike>
  cancelSubscription(id: string, opts: StripeCallOptions): Promise<SubscriptionLike>
  retrievePaymentIntent(id: string, opts: StripeCallOptions): Promise<PaymentIntentLike>
  updateInvoice(id: string, params: Record<string, unknown>, opts: StripeCallOptions): Promise<{ id: string }>
  retrieveInvoice(id: string, opts: StripeCallOptions): Promise<InvoiceLike>
  /** PaymentIntent avec `latest_charge.balance_transaction` expandé (frais/net réels). */
  retrievePaymentIntentWithBalance(id: string, opts: StripeCallOptions): Promise<unknown>
}

/** Erreurs transitoires : l'event doit être rejoué (500, non marqué traité). */
const RETRYABLE_CODES = new Set(["PROVIDER_ERROR", "PROVIDER_DATA_UNAVAILABLE", "INTERNAL_ERROR", "CONFLICT"])
export function isRetryableWebhookError(e: unknown): boolean {
  return !(e instanceof CustomerSubscriptionError) || RETRYABLE_CODES.has(e.code)
}

async function providerCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof CustomerSubscriptionError) throw e
    // Message Stripe seulement (jamais la clé ni le payload).
    console.log("[v0] customer-subscriptions: provider error:", e instanceof Error ? e.message : "unknown")
    throw new CustomerSubscriptionError("PROVIDER_ERROR")
  }
}

/* ------------------------------- Lectures -------------------------------- */

async function lockTenantSubscription(tx: Executor, companyId: number, subscriptionId: number) {
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_FOUND")
  const [row] = await tx
    .select()
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.id, subscriptionId), eq(maintenanceSubscriptions.companyId, companyId)))
    .for("update")
  if (!row) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_FOUND")
  return row
}

type SubRow = Awaited<ReturnType<typeof lockTenantSubscription>>

const whereSub = (row: { id: number; companyId: number }) =>
  and(eq(maintenanceSubscriptions.id, row.id), eq(maintenanceSubscriptions.companyId, row.companyId))

/** Recherche scopée (provider + compte) : jamais sur externalSubscriptionId seul. */
async function findByExternalSubscription(db: Executor, account: string, externalSubscriptionId: string) {
  const [row] = await db
    .select({ id: maintenanceSubscriptions.id, companyId: maintenanceSubscriptions.companyId })
    .from(maintenanceSubscriptions)
    .where(
      and(
        eq(maintenanceSubscriptions.provider, "stripe"),
        eq(maintenanceSubscriptions.providerAccountId, account),
        eq(maintenanceSubscriptions.externalSubscriptionId, externalSubscriptionId),
      ),
    )
    .limit(1)
  return row ?? null
}

async function findPaymentBy(tx: Executor, row: SubRow, field: "externalInvoiceId" | "externalPaymentId", value: string) {
  const [p] = await tx
    .select()
    .from(maintenancePayments)
    .where(
      and(
        eq(maintenancePayments.companyId, row.companyId),
        eq(maintenancePayments.subscriptionId, row.id),
        eq(maintenancePayments.provider, "stripe"),
        eq(maintenancePayments.providerAccountId, row.providerAccountId!),
        eq(maintenancePayments[field], value),
      ),
    )
    .limit(1)
  return p ?? null
}

/* ------------------------------- Checkout -------------------------------- */

export type StartCheckoutResult = {
  checkoutSessionId: string
  clientSecret: string
  status: "open"
  paymentMode: "recurring" | "prepaid"
  kind: CheckoutKind
  reused: boolean
}

/**
 * Démarre (ou reprend) le paiement attendu par le contrat.
 *
 * Aucun appel Stripe sous verrou DB :
 *  A. transaction courte : tenant, verrou contrat, état, paramètres ;
 *  B. appels Stripe HORS transaction (clé d'idempotence déterministe : un double
 *     clic / deux requêtes concurrentes obtiennent la MÊME session) ;
 *  C. transaction courte : revalidation + écriture de la session, sans jamais
 *     écraser un identifiant conflictuel.
 */
export async function startSubscriptionCheckout(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  input: { returnUrlContext?: ReturnUrlContext } = {},
): Promise<StartCheckoutResult> {
  assertCanMutate(actor)

  const plan = await db.transaction(async (tx) => {
    const sub = await lockTenantSubscription(tx, companyId, subscriptionId)
    const kind = resolveCheckoutKind(sub)
    if (!kind) throw new CustomerSubscriptionError("CHECKOUT_NOT_ALLOWED")
    if (sub.provider !== "stripe" || !sub.providerAccountId) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")
    const [company] = await tx
      .select({ stripeAccountId: companies.stripeAccountId, chargesEnabled: companies.stripeChargesEnabled, slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, companyId))
    // Le contrat garde son compte : il doit être celui, opérationnel, du tenant.
    if (!company?.chargesEnabled || company.stripeAccountId !== sub.providerAccountId) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")

    if (kind === "initial_cleaning") {
      const [paid] = await tx
        .select({ id: maintenancePayments.id })
        .from(maintenancePayments)
        .where(
          and(
            eq(maintenancePayments.companyId, companyId),
            eq(maintenancePayments.subscriptionId, sub.id),
            eq(maintenancePayments.type, "initial_cleaning"),
            eq(maintenancePayments.status, "paid"),
          ),
        )
        .limit(1)
      if (paid) throw new CustomerSubscriptionError("CHECKOUT_ALREADY_COMPLETED")
    }
    const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(tx, companyId)
    // URL de retour construite SERVEUR depuis le slug du tenant (jamais fournie par le navigateur).
    const returnUrl = buildCustomerSubscriptionReturnUrl(company.slug, input.returnUrlContext)
    const built = buildCheckoutSessionParams(sub, kind, platformFeeBps, returnUrl)
    return {
      kind,
      built,
      platformFeeBps,
      providerAccountId: sub.providerAccountId,
      existingSessionId: sub.externalCheckoutSessionId,
      paymentMode: sub.paymentMode as "recurring" | "prepaid",
    }
  })

  const { kind, built, platformFeeBps, providerAccountId, existingSessionId, paymentMode } = plan
  const opts = { stripeAccount: providerAccountId }
  let previousSessionId: string | null = null
  if (existingSessionId) {
    const existing = await providerCall(() => port.retrieveCheckoutSession(existingSessionId, opts))
    const sameKind = existing.metadata?.paymentType === kind
    if (sameKind && existing.status === "open" && existing.client_secret) {
      return { checkoutSessionId: existing.id, clientSecret: existing.client_secret, status: "open", paymentMode, kind, reused: true }
    }
    // Payée mais webhook pas encore reçu : ne jamais recréer.
    if (sameKind && existing.status === "complete") throw new CustomerSubscriptionError("CHECKOUT_ALREADY_COMPLETED")
    previousSessionId = existing.id
  }
  const session = await providerCall(() =>
    port.createCheckoutSession(built.params, {
      ...opts,
      idempotencyKey: checkoutIdempotencyKey({ companyId, subscriptionId, kind, previousSessionId, platformFeeBps }),
    }),
  )
  if (!session.client_secret) throw new CustomerSubscriptionError("PROVIDER_ERROR")
  const clientSecret = session.client_secret

  return db.transaction(async (tx) => {
    const sub = await lockTenantSubscription(tx, companyId, subscriptionId)
    if (sub.providerAccountId !== providerAccountId || resolveCheckoutKind(sub) !== kind) throw new CustomerSubscriptionError("CHECKOUT_CONFLICT")
    // Requête jumelle (même clé Stripe) déjà enregistrée : même session.
    if (sub.externalCheckoutSessionId === session.id) {
      return { checkoutSessionId: session.id, clientSecret, status: "open" as const, paymentMode, kind, reused: true }
    }
    // Une autre tentative a écrit une session différente entre-temps : jamais écrasée.
    if (sub.externalCheckoutSessionId !== existingSessionId) throw new CustomerSubscriptionError("CHECKOUT_CONFLICT")
    await tx.update(maintenanceSubscriptions).set({ externalCheckoutSessionId: session.id, updatedAt: new Date() }).where(whereSub(sub))
    await appendMaintenanceAudit(tx, {
      companyId,
      subscriptionId: sub.id,
      action: "checkout_started",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { kind, platformFeeBps: built.platformFeeBps, grossAmountCents: built.grossAmountCents, retryOf: previousSessionId },
    })
    return { checkoutSessionId: session.id, clientSecret, status: "open" as const, paymentMode, kind, reused: false }
  })
}

/* ------------------------------ Annulation ------------------------------- */

const readTenantSubscription = (db: Executor, companyId: number, subscriptionId: number) =>
  db.transaction((tx) => lockTenantSubscription(tx, companyId, subscriptionId))

type SyncActor = { actorType: "user" | "system"; actorUserId?: string | null }
const userSyncActor = (actor: Actor): SyncActor => ({ actorType: "user", actorUserId: actor.userId })
const SYSTEM_SYNC: SyncActor = { actorType: "system", actorUserId: null }

type CancelAtSync = { applied: boolean; cancelAt?: number | null; reason?: string }

/**
 * Cœur idempotent : aligne le `cancel_at` Stripe sur la règle DetailFlow
 * (annulation programmée > non-renouvellement / mode none ; null = retrait).
 * Lecture DB courte, appel Stripe hors transaction. `scheduleOnly` : n'efface
 * jamais un cancel_at (utilisé après invoice.paid).
 */
async function syncProviderCancelAtInternal(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  subscriptionId: number,
  now: Date,
  who: SyncActor,
  scheduleOnly = false,
): Promise<CancelAtSync> {
  const sub = await readTenantSubscription(db, companyId, subscriptionId)
  if (!sub.externalSubscriptionId || !sub.providerAccountId) return { applied: false, reason: "no_provider_subscription" }
  if (isTerminalStatus(sub.status)) return { applied: false, reason: "terminal" }
  const ext = sub.externalSubscriptionId
  const opts = { stripeAccount: sub.providerAccountId }
  const desired = desiredProviderCancelAt(sub)
  if (desired == null && scheduleOnly) return { applied: false, cancelAt: null, reason: "nothing_to_schedule" }
  if (desired != null && desired * 1000 <= now.getTime()) return { applied: false, reason: "date_passed" }
  const current = await providerCall(() => port.retrieveSubscription(ext, opts))
  if (current.status === "canceled") return { applied: false, reason: "provider_canceled" }
  if ((current.cancel_at ?? null) === desired) return { applied: false, cancelAt: desired, reason: "in_sync" }
  // updatedAt du contrat en nonce : une clé par décision locale ; un retry après panne réutilise la même clé.
  const key = `df-cancel-at:${ext}:${desired ?? "clear"}:${sub.updatedAt.getTime()}`
  await providerCall(() => port.updateSubscription(ext, { cancel_at: desired ?? "", proration_behavior: "none" }, { ...opts, idempotencyKey: key }))
  await appendMaintenanceAudit(db, {
    companyId,
    subscriptionId: sub.id,
    action: "provider_cancellation_applied",
    actorType: who.actorType,
    actorUserId: who.actorUserId ?? null,
    meta: { mode: desired == null ? "cleared" : "scheduled", cancelAt: desired == null ? null : new Date(desired * 1000).toISOString(), refund: "none" },
  })
  return { applied: true, cancelAt: desired }
}

export type ProviderSyncResult = { applied: boolean; mode?: "scheduled" | "cleared" | "immediate"; reason?: string }

/**
 * Reporte sur Stripe l'état DÉJÀ décidé en DB (source de vérité) :
 * contrat terminé → annulation immédiate ; sinon cancel_at aligné.
 * Rejouable à volonté (idempotent, aucun remboursement).
 */
async function syncProviderStateInternal(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  subscriptionId: number,
  now: Date,
  who: SyncActor,
): Promise<ProviderSyncResult> {
  const sub = await readTenantSubscription(db, companyId, subscriptionId)
  if (!sub.externalSubscriptionId || !sub.providerAccountId) return { applied: false, reason: "no_provider_subscription" }
  if (isTerminalStatus(sub.status)) {
    const ext = sub.externalSubscriptionId
    const opts = { stripeAccount: sub.providerAccountId }
    const current = await providerCall(() => port.retrieveSubscription(ext, opts))
    if (current.status === "canceled") return { applied: true, mode: "immediate", reason: "already_canceled" }
    await providerCall(() => port.cancelSubscription(ext, { ...opts, idempotencyKey: `df-cancel:${ext}` }))
    await appendMaintenanceAudit(db, { companyId, subscriptionId: sub.id, action: "provider_cancellation_applied", actorType: who.actorType, actorUserId: who.actorUserId ?? null, meta: { mode: "immediate", refund: "none" } })
    return { applied: true, mode: "immediate" }
  }
  const r = await syncProviderCancelAtInternal(db, port, companyId, subscriptionId, now, who)
  if (r.applied || r.reason === "in_sync") return { applied: true, mode: r.cancelAt == null ? "cleared" : "scheduled", reason: r.reason }
  return { applied: false, reason: r.reason }
}

/** Synchronise le `cancel_at` Stripe (appel manuel / retry). */
export async function syncProviderCancelAt(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date = new Date(),
): Promise<CancelAtSync> {
  assertCanMutate(actor)
  return syncProviderCancelAtInternal(db, port, companyId, subscriptionId, now, userSyncActor(actor))
}

/** Rejoue la synchronisation Stripe de l'état DB courant (retry après panne provider). */
export async function syncProviderState(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date = new Date(),
): Promise<ProviderSyncResult> {
  assertCanMutate(actor)
  return syncProviderStateInternal(db, port, companyId, subscriptionId, now, userSyncActor(actor))
}

/** Compat : applique l'annulation déjà décidée par le moteur métier. */
export async function applyCancellationToProvider(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date = new Date(),
): Promise<{ applied: boolean; mode?: "scheduled" | "immediate"; reason?: string }> {
  const r = await syncProviderState(db, port, companyId, actor, subscriptionId, now)
  if (r.applied && r.mode === "immediate") return { applied: true, mode: "immediate" }
  if (r.applied && r.mode === "scheduled") return { applied: true, mode: "scheduled" }
  return { applied: false, reason: r.reason ?? "nothing_to_apply" }
}

/* ---------------- Orchestration décision DB → sync Stripe ---------------- */

export type ProviderSyncOutcome =
  | { status: "synced" | "noop"; mode?: ProviderSyncResult["mode"]; reason?: string }
  | { status: "pending_retry"; code: string }

/**
 * La DB a déjà commité la décision : une panne Stripe ne l'annule pas et ne
 * bloque pas le retry. L'échec est journalisé, renvoyé `pending_retry`, et un
 * nouvel appel (même action ou syncProviderState) resynchronise.
 */
async function syncAfterDecision(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date,
): Promise<ProviderSyncOutcome> {
  try {
    const r = await syncProviderStateInternal(db, port, companyId, subscriptionId, now, userSyncActor(actor))
    return r.applied ? { status: "synced", mode: r.mode, reason: r.reason } : { status: "noop", reason: r.reason }
  } catch (e) {
    const code = e instanceof CustomerSubscriptionError ? e.code : "PROVIDER_ERROR"
    await appendMaintenanceAudit(db, { companyId, subscriptionId, action: "provider_sync_failed", actorType: "user", actorUserId: actor.userId, meta: { code } })
    return { status: "pending_retry", code }
  }
}

/**
 * Exécute la décision locale puis synchronise Stripe hors transaction.
 * `retryWhenTerminal` : décision déjà appliquée (ALREADY_CANCELLED) → on
 * retente uniquement la synchronisation provider, sans toucher la DB.
 */
async function decideThenSync<T extends object>(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date,
  decide: () => Promise<T>,
  retryWhenTerminal = false,
): Promise<T & { alreadyApplied?: boolean; provider: ProviderSyncOutcome }> {
  assertCanMutate(actor)
  let local: T & { alreadyApplied?: boolean }
  try {
    local = await decide()
  } catch (e) {
    if (!(retryWhenTerminal && e instanceof CustomerSubscriptionError && e.code === "ALREADY_CANCELLED")) throw e
    const sub = await readTenantSubscription(db, companyId, subscriptionId)
    local = { status: sub.status, alreadyApplied: true } as unknown as T & { alreadyApplied?: boolean }
  }
  const provider = await syncAfterDecision(db, port, companyId, actor, subscriptionId, now)
  return { ...local, provider }
}

export const requestRenewalOptOutAndSync = (db: Executor, port: CustomerSubscriptionStripePort, companyId: number, actor: Actor, subscriptionId: number, now: Date = new Date()) =>
  decideThenSync(db, port, companyId, actor, subscriptionId, now, () => requestRenewalOptOut(db, companyId, actor, subscriptionId, now))

export const revokeRenewalOptOutAndSync = (db: Executor, port: CustomerSubscriptionStripePort, companyId: number, actor: Actor, subscriptionId: number, now: Date = new Date()) =>
  decideThenSync(db, port, companyId, actor, subscriptionId, now, () => revokeRenewalOptOut(db, companyId, actor, subscriptionId, now))

export const scheduleCancellationAndSync = (
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  options: { requestedCancelAt?: Date | null } = {},
  now: Date = new Date(),
) => decideThenSync(db, port, companyId, actor, subscriptionId, now, () => scheduleCancellation(db, companyId, actor, subscriptionId, options, now), true)

export const forceEndSubscriptionAndSync = (db: Executor, port: CustomerSubscriptionStripePort, companyId: number, actor: Actor, subscriptionId: number, reason: unknown, now: Date = new Date()) =>
  decideThenSync(db, port, companyId, actor, subscriptionId, now, () => forceEndSubscription(db, companyId, actor, subscriptionId, reason, now), true)

/* -------------------------------- Webhook -------------------------------- */

export type WebhookEventLike = { id: string; type: string; account?: string | null; created: number; data: { object: unknown } }
export type WebhookOutcome = { handled: false } | { handled: true; outcome: string }

const CS_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

type Classified = { family: "checkout" | "invoice" | "subscription"; externalSubscriptionId: string | null; meta: Record<string, string> | null }

function classify(event: WebhookEventLike): Classified | null {
  const obj = event.data.object as Record<string, unknown>
  if (event.type.startsWith("checkout.session.")) {
    const s = obj as CheckoutSessionLike
    return { family: "checkout", externalSubscriptionId: idOf(s.subscription), meta: s.metadata ?? null }
  }
  if (event.type.startsWith("invoice.")) {
    const inv = obj as InvoiceLike
    return { family: "invoice", externalSubscriptionId: invoiceSubscriptionId(inv), meta: invoiceMetadata(inv) }
  }
  const s = obj as SubscriptionLike
  return { family: "subscription", externalSubscriptionId: s.id ?? null, meta: s.metadata ?? null }
}

const isModuleMeta = (m: Record<string, string> | null) => m?.detailflowModule === CUSTOMER_SUBSCRIPTION_MODULE

/**
 * Point d'entrée appelé par app/api/payments/webhook/route.ts (signature déjà
 * vérifiée, doublon d'event.id déjà filtré). `handled: false` = pas un
 * événement customer_subscription → le flux booking existant s'applique.
 */
export async function handleCustomerSubscriptionWebhook(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  event: WebhookEventLike,
): Promise<WebhookOutcome> {
  if (MONEY_EVENTS.has(event.type)) return handleMoneyEvent(db, port, event)
  if (!CS_EVENTS.has(event.type)) return { handled: false }
  const cls = classify(event)
  if (!cls) return { handled: false }
  const account = typeof event.account === "string" && event.account ? event.account : null

  let meta = cls.meta
  let byExternal = account && cls.externalSubscriptionId ? await findByExternalSubscription(db, account, cls.externalSubscriptionId) : null
  if (!isModuleMeta(meta) && !byExternal) {
    // Facture sans snapshot metadata : la Stripe Subscription (contexte event.account) fait office d'indice.
    if (cls.family === "invoice" && account && cls.externalSubscriptionId) {
      const s = await providerCall(() => port.retrieveSubscription(cls.externalSubscriptionId!, { stripeAccount: account }))
      meta = s.metadata ?? null
    }
    if (!isModuleMeta(meta)) return { handled: false }
  }

  if (!account) {
    console.log("[v0] customer-subscriptions webhook: event.account manquant", { type: event.type })
    return { handled: true, outcome: "ignored_missing_account" }
  }

  // Résolution : (compte + subscription externe) d'abord, sinon metadata re-vérifiées.
  if (!byExternal) {
    const ids = parseModuleMetadata(meta)
    if (!ids) return { handled: true, outcome: "ignored_unresolvable" }
    const [row] = await db
      .select({ id: maintenanceSubscriptions.id, companyId: maintenanceSubscriptions.companyId, providerAccountId: maintenanceSubscriptions.providerAccountId, externalSubscriptionId: maintenanceSubscriptions.externalSubscriptionId })
      .from(maintenanceSubscriptions)
      .where(and(eq(maintenanceSubscriptions.id, ids.subscriptionId), eq(maintenanceSubscriptions.companyId, ids.companyId)))
    if (!row) return { handled: true, outcome: "ignored_unknown_subscription" }
    const extConflict = cls.externalSubscriptionId && row.externalSubscriptionId && row.externalSubscriptionId !== cls.externalSubscriptionId
    if (row.providerAccountId !== account || extConflict) {
      console.log("[v0] customer-subscriptions webhook: compte provider incohérent", { type: event.type, subscriptionId: row.id })
      await appendMaintenanceAudit(db, { companyId: row.companyId, subscriptionId: row.id, action: "provider_account_mismatch", actorType: "provider", meta: { eventId: event.id, eventType: event.type } })
      return { handled: true, outcome: "rejected_account_mismatch" }
    }
    byExternal = { id: row.id, companyId: row.companyId }
  }

  const target = byExternal
  const ctx = { db, port, event, account, target, meta }
  switch (event.type) {
    case "invoice.created":
      return onInvoiceCreated(ctx)
    case "invoice.paid":
      return onInvoicePaid(ctx)
    case "invoice.payment_failed":
      return onInvoicePaymentFailed(ctx)
    case "invoice.payment_action_required":
      return onInvoicePaymentActionRequired(ctx)
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutPaid(ctx)
    case "checkout.session.expired":
      // Rien encaissé ; startSubscriptionCheckout créera une nouvelle tentative dérivée.
      return { handled: true, outcome: "checkout_expired" }
    case "customer.subscription.updated":
      return onSubscriptionUpdated(ctx)
    case "customer.subscription.deleted":
      return onSubscriptionDeleted(ctx)
    default:
      return { handled: true, outcome: "ignored" }
  }
}

type Ctx = {
  db: Executor
  port: CustomerSubscriptionStripePort
  event: WebhookEventLike
  account: string
  target: { id: number; companyId: number }
  meta: Record<string, string> | null
}

const eventDate = (e: WebhookEventLike) => new Date(e.created * 1000)

/** Lie les IDs externes manquants (jamais d'écrasement d'un ID différent). */
async function linkProviderIds(tx: Executor, row: SubRow, ids: { externalSubscriptionId?: string | null; externalCustomerId?: string | null }) {
  const patch: Record<string, string> = {}
  if (ids.externalSubscriptionId && !row.externalSubscriptionId) patch.externalSubscriptionId = ids.externalSubscriptionId
  if (ids.externalCustomerId && !row.externalCustomerId) patch.externalCustomerId = ids.externalCustomerId
  if (!Object.keys(patch).length) return
  await tx.update(maintenanceSubscriptions).set({ ...patch, updatedAt: new Date() }).where(whereSub(row))
  await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "provider_ids_linked", actorType: "provider", meta: { fields: Object.keys(patch) } })
}

/** Cycle idempotent ; un contrat terminé / hors période n'en reçoit simplement pas. */
async function ensureCycle(tx: Executor, row: { id: number; companyId: number }, at: Date): Promise<number | null> {
  try {
    const c = await createCycleIfMissing(tx, row.companyId, row.id, at)
    return c.cycleId
  } catch (e) {
    if (e instanceof CustomerSubscriptionError && (e.code === "SUBSCRIPTION_NOT_USABLE" || e.code === "ALREADY_CANCELLED")) return null
    throw e
  }
}

/**
 * Commission du plan DetailFlow EFFECTIF : appliquée à CETTE facture tant
 * qu'elle est draft, puis synchronisée sur la Subscription (futures factures).
 * Facture finalisée (ou finalisée pendant l'update) : jamais réécrite, on
 * relit ce que Stripe a réellement appliqué.
 */
/**
 * Commission réellement appliquée = `PaymentIntent.application_fee_amount`
 * lu dans le contexte du compte connecté (source de vérité Dahlia).
 * `null` = donnée indisponible (jamais estimée).
 */
async function realPaymentIntentFee(port: CustomerSubscriptionStripePort, account: string, paymentIntentId: string | null, grossCents: number): Promise<number | null> {
  if (!paymentIntentId) return null
  const pi = await providerCall(() => port.retrievePaymentIntent(paymentIntentId, { stripeAccount: account }))
  if (!pi || (pi.id && pi.id !== paymentIntentId)) throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")
  if (pi.application_fee_amount === undefined) return null
  return Math.min(grossCents, Math.max(0, pi.application_fee_amount ?? 0))
}

async function hasInvoicePayment(db: Executor, target: { id: number; companyId: number }, invoiceId: string) {
  const [p] = await db
    .select({ id: maintenancePayments.id })
    .from(maintenancePayments)
    .where(and(eq(maintenancePayments.companyId, target.companyId), eq(maintenancePayments.subscriptionId, target.id), eq(maintenancePayments.provider, "stripe"), eq(maintenancePayments.externalInvoiceId, invoiceId)))
  return Boolean(p)
}

async function onInvoiceCreated({ db, port, event, account, target }: Ctx): Promise<WebhookOutcome> {
  let inv = event.data.object as InvoiceLike
  const gross = Math.max(0, inv.amount_due ?? inv.total ?? 0)
  const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(db, target.companyId)
  const ext = invoiceSubscriptionId(inv)
  const opts = { stripeAccount: account }

  const [peek] = await db.select({ status: maintenanceSubscriptions.status }).from(maintenanceSubscriptions).where(whereSub(target))
  const terminal = isTerminalStatus(peek?.status ?? "ended")

  let synced = false
  if (inv.status === "draft") {
    const feeAmount = computePlatformFeeAmountCents(gross, platformFeeBps)
    try {
      await port.updateInvoice(
        inv.id,
        { application_fee_amount: feeAmount, metadata: { detailflowPlatformFeeBps: String(platformFeeBps), maintenanceSubscriptionId: String(target.id) } },
        { ...opts, idempotencyKey: `df-inv-fee:${inv.id}:${platformFeeBps}` },
      )
      synced = true
    } catch (e) {
      // Course : Stripe a finalisé entre-temps → relecture, jamais de boucle d'erreur.
      inv = await providerCall(() => port.retrieveInvoice(inv.id, opts))
      if (inv.status === "draft") throw new CustomerSubscriptionError("PROVIDER_ERROR")
      console.log("[v0] customer-subscriptions: facture finalisée avant mise à jour de la commission", { invoiceId: inv.id })
    }
  }
  // Facture déjà finalisée : montant réel (Invoice legacy ou PaymentIntent), jamais estimé.
  const feeAmount = synced
    ? computePlatformFeeAmountCents(gross, platformFeeBps)
    : (invoiceChargedFeeCents(inv, gross) ?? (await realPaymentIntentFee(port, account, invoicePaymentIntentId(inv), gross)))
  const feeBps = feeAmount == null ? null : synced ? platformFeeBps : feeBpsForCharged(gross, feeAmount, [parseFeeBpsMetadata(invoiceMetadata(inv))])
  if (ext && !terminal) {
    const percent = feePercentFromBps(platformFeeBps)
    // "" = suppression du pourcentage (taux 0). Clé par facture : rejouable.
    await providerCall(() => port.updateSubscription(ext, { application_fee_percent: percent ?? "" }, { ...opts, idempotencyKey: `df-sub-fee:${inv.id}:${platformFeeBps}` }))
  }

  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: ext })
    const existing = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    // Commission réelle pas encore lisible : aucun snapshot inventé ; invoice.paid / failed l'écriront.
    if (!existing && (feeAmount == null || feeBps == null)) return { handled: true as const, outcome: "invoice_created_fee_pending" }
    if (!existing && feeAmount != null && feeBps != null) {
      await tx.insert(maintenancePayments).values({
        companyId: row.companyId,
        subscriptionId: row.id,
        provider: "stripe",
        providerAccountId: row.providerAccountId,
        externalInvoiceId: inv.id,
        type: "recurring",
        status: "pending",
        currency: (inv.currency ?? row.currency).toUpperCase(),
        grossAmountCents: gross,
        platformFeeBps: feeBps,
        platformFeeAmountCents: feeAmount,
      })
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_pending", actorType: "provider", meta: { invoiceId: inv.id, platformFeeBps: feeBps } })
    }
    // Un paiement déjà enregistré ne change jamais de commission rétroactivement.
    if (synced) await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "platform_fee_synced", actorType: "system", meta: { invoiceId: inv.id, platformFeeBps, platformFeeAmountCents: feeAmount } })
    return { handled: true as const, outcome: existing ? "invoice_created_duplicate" : synced ? "invoice_created" : "invoice_created_finalized" }
  })
}

function renewalFor(row: SubRow) {
  return (end: Date) =>
    computeNextRenewalTerm({
      currentTermEndsAt: end,
      interval: { unit: row.billingIntervalUnitSnapshot, count: row.billingIntervalCountSnapshot } as BillingInterval,
      commitment: { unit: row.commitmentUnitSnapshot, count: row.commitmentCountSnapshot } as Commitment,
      renewalMode: row.renewalModeSnapshot as RenewalMode,
    })
}

/**
 * Facture recurring payée. invoice.paid seul ne crée JAMAIS de droit :
 * Stripe Subscription relue (contexte compte connecté), période réelle
 * exigée (relue si absente, jamais Date.now()), puis paiement / activation /
 * renouvellement de terme / cycle idempotents.
 */
async function onInvoicePaid({ db, port, event, account, target }: Ctx): Promise<WebhookOutcome> {
  let inv = event.data.object as InvoiceLike & { customer?: Ref }
  const opts = { stripeAccount: account }
  const ext = invoiceSubscriptionId(inv)
  if (!ext) return { handled: true, outcome: "ignored_no_provider_subscription" }

  const providerSub = await providerCall(() => port.retrieveSubscription(ext, opts))
  if (providerSub.id && providerSub.id !== ext) throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")
  const access = providerAccessDecision(providerSub.status)
  if (access === "retry") throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")

  let period = invoicePeriod(inv)
  if (!period || !invoicePaymentIntentId(inv)) {
    const fresh = await providerCall(() => port.retrieveInvoice(inv.id, opts))
    inv = { ...inv, ...fresh }
    period = invoicePeriod(inv)
  }
  if (!period) throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")

  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : eventDate(event)
  const gross = Math.max(0, inv.amount_paid ?? inv.amount_due ?? 0)
  const paymentIntentId = invoicePaymentIntentId(inv)
  const probe = periodProbe(period)
  const realPeriod = period

  // Pas de maintenance_payment (invoice.paid avant invoice.created) : commission RÉELLE
  // lue sur le PaymentIntent ; jamais le plan courant. Indisponible → retriable.
  const realFee = (await hasInvoicePayment(db, target, inv.id)) ? null : (invoiceChargedFeeCents(inv, gross) ?? (await realPaymentIntentFee(port, account, paymentIntentId, gross)))

  const result = await db.transaction(async (tx) => {
    let row = await lockTenantSubscription(tx, target.companyId, target.id)
    if (row.externalSubscriptionId && row.externalSubscriptionId !== ext) return { handled: true as const, outcome: "rejected_subscription_conflict" }
    await linkProviderIds(tx, row, { externalSubscriptionId: ext, externalCustomerId: idOf(inv.customer) })

    let payment = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    if (!payment) {
      if (realFee == null) throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")
      const fee = realFee
      ;[payment] = await tx
        .insert(maintenancePayments)
        .values({
          companyId: row.companyId,
          subscriptionId: row.id,
          provider: "stripe",
          providerAccountId: row.providerAccountId,
          externalInvoiceId: inv.id,
          externalPaymentId: paymentIntentId,
          type: "recurring",
          status: "paid",
          currency: (inv.currency ?? row.currency).toUpperCase(),
          grossAmountCents: gross,
          platformFeeBps: feeBpsForCharged(gross, fee, [parseFeeBpsMetadata(invoiceMetadata(inv))]),
          platformFeeAmountCents: fee,
          paidAt,
        })
        .returning()
    } else if (payment.status === "pending" || payment.status === "failed") {
      // Snapshots de commission conservés tels quels.
      ;[payment] = await tx
        .update(maintenancePayments)
        .set({ status: "paid", paidAt, externalPaymentId: payment.externalPaymentId ?? paymentIntentId })
        .where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
        .returning()
    }

    if (access === "deny") {
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_succeeded_without_access", actorType: "provider", meta: { invoiceId: inv.id, providerStatus: providerSub.status ?? null } })
      return { handled: true as const, outcome: "invoice_paid_no_access" }
    }

    if (row.status === "pending_payment") {
      // Ancre = période Stripe réelle de la 1re facture.
      await activateSubscription(tx, row.companyId, row.id, realPeriod.start, "provider")
      row = await lockTenantSubscription(tx, row.companyId, row.id)
    } else if (row.status === "past_due") {
      const next = statusAfterRecovery(row, paidAt)
      await tx.update(maintenanceSubscriptions).set({ status: next, updatedAt: paidAt }).where(whereSub(row))
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "subscription_recovered", actorType: "provider", meta: { status: next } })
      row = await lockTenantSubscription(tx, row.companyId, row.id)
    }
    // suspended (manuel) : jamais réactivé automatiquement.

    if (row.status === "active" || row.status === "cancel_scheduled") {
      const renewal = planTermRenewal(row, probe, renewalFor(row))
      if (renewal.kind === "beyond_final_term") {
        await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_beyond_final_term", actorType: "provider", meta: { invoiceId: inv.id } })
        return { handled: true as const, outcome: "invoice_paid_beyond_term" }
      }
      if (renewal.kind === "advance") {
        const last = renewal.terms[renewal.terms.length - 1]
        await tx
          .update(maintenanceSubscriptions)
          .set({ currentTermStartedAt: last.to.start, currentTermEndsAt: last.to.end, renewalNoticeSentAt: null, updatedAt: new Date() })
          .where(whereSub(row))
        for (const t of renewal.terms) {
          await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "term_renewed", actorType: "provider", meta: { invoiceId: inv.id, fromStart: t.from.start, fromEnd: t.from.end, toStart: t.to.start, toEnd: t.to.end } })
        }
        row = await lockTenantSubscription(tx, row.companyId, row.id)
      }
    }

    const cycleId = await ensureCycle(tx, row, probe)
    if (cycleId != null && payment.cycleId == null) {
      await tx.update(maintenancePayments).set({ cycleId }).where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
    }
    await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_succeeded", actorType: "provider", meta: { invoiceId: inv.id, cycleId } })
    return { handled: true as const, outcome: "invoice_paid" }
  })

  // Après commit, hors transaction : renewalMode none / opt-out déjà présent →
  // cancel_at = currentTermEndsAt. Idempotent ; échec → webhook rejoué.
  if (result.outcome === "invoice_paid") {
    await syncProviderCancelAtInternal(db, port, target.companyId, target.id, paidAt > new Date() ? paidAt : new Date(), SYSTEM_SYNC, true)
  }
  if (paymentIntentId) await syncFinancialsBestEffort(db, port, account, target, paymentIntentId)
  return result
}

async function recordInvoiceFailure({ db, port, event, account, target }: Ctx, kind: "failed" | "action_required"): Promise<WebhookOutcome> {
  const inv = event.data.object as InvoiceLike
  const failedAt = eventDate(event)
  const gross = Math.max(0, inv.amount_due ?? inv.total ?? 0)
  // Commission réelle uniquement ; inconnue → pas de ligne (invoice.paid l'écrira depuis le PaymentIntent).
  const fee = (await hasInvoicePayment(db, target, inv.id)) ? null : (invoiceChargedFeeCents(inv, gross) ?? (await realPaymentIntentFee(port, account, invoicePaymentIntentId(inv), gross)))
  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: invoiceSubscriptionId(inv) })
    const payment = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    if (!payment && fee != null) {
      await tx.insert(maintenancePayments).values({
        companyId: row.companyId,
        subscriptionId: row.id,
        provider: "stripe",
        providerAccountId: row.providerAccountId,
        externalInvoiceId: inv.id,
        type: "recurring",
        status: "failed",
        currency: (inv.currency ?? row.currency).toUpperCase(),
        grossAmountCents: gross,
        platformFeeBps: feeBpsForCharged(gross, fee, [parseFeeBpsMetadata(invoiceMetadata(inv))]),
        platformFeeAmountCents: fee,
        failedAt,
      })
    } else if (payment?.status === "pending") {
      await tx.update(maintenancePayments).set({ status: "failed", failedAt }).where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
    }

    // Aucun cycle créé ni supprimé. Cycle existant ≠ droit : canUseEntitlement() refuse past_due.
    // Les relances sont celles de Stripe (Smart Retries) ; aucun moteur local.
    const next = kind === "failed" ? statusAfterPaymentFailed(row.status) : statusAfterPaymentActionRequired(row.status)
    if (next !== row.status) {
      await tx.update(maintenanceSubscriptions).set({ status: next, updatedAt: failedAt }).where(whereSub(row))
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "subscription_past_due", actorType: "provider", meta: { previousStatus: row.status, reason: kind } })
    }
    await appendMaintenanceAudit(tx, {
      companyId: row.companyId,
      subscriptionId: row.id,
      action: kind === "failed" ? "payment_failed" : "payment_action_required",
      actorType: "provider",
      meta: { invoiceId: inv.id },
    })
    return { handled: true as const, outcome: kind === "failed" ? "invoice_payment_failed" : "invoice_payment_action_required" }
  })
}

const onInvoicePaymentFailed = (ctx: Ctx) => recordInvoiceFailure(ctx, "failed")
const onInvoicePaymentActionRequired = (ctx: Ctx) => recordInvoiceFailure(ctx, "action_required")

/* --------------------------- Comptabilité réelle -------------------------- */

type PaymentRow = typeof maintenancePayments.$inferSelect

/**
 * Frais Stripe RÉELS / net INITIAL réel : PaymentIntent → latest Charge →
 * BalanceTransaction, dans le contexte du compte connecté. Jamais estimés ;
 * jamais réécrits (un remboursement ne modifie pas le net initial).
 */
export async function syncMaintenancePaymentFinancials(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  account: string,
  payment: { id: number; companyId: number },
): Promise<"synced" | "already_synced" | "unavailable" | "skipped" | "conflict"> {
  const [row] = await db
    .select()
    .from(maintenancePayments)
    .where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, payment.companyId)))
  if (!row || row.provider !== "stripe" || row.providerAccountId !== account) return "skipped"
  const pi = row.externalPaymentId
  if (!pi || !pi.startsWith("pi_") || !isSettledPaymentStatus(row.status)) return "skipped"
  if (row.providerFeeAmountCents != null && row.netAmountCents != null) return "already_synced"

  const intent = await providerCall(() => port.retrievePaymentIntentWithBalance(pi, { stripeAccount: account }))
  const extracted = extractChargeAndBalanceTransaction(intent)
  if (!extracted) return "unavailable"
  const fin = computeStripeFinancials(extracted.balanceTransaction, { grossAmountCents: row.grossAmountCents, currency: row.currency })
  if (!fin.ok) {
    console.log("[v0] customer-subscriptions: financials incohérents", { paymentId: row.id, reason: fin.reason })
    return "conflict"
  }

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(maintenancePayments)
      .where(and(eq(maintenancePayments.id, row.id), eq(maintenancePayments.companyId, row.companyId)))
      .for("update")
    if (!locked) return "skipped" as const
    const plan = planFinancialsUpdate(locked, fin)
    if (plan === "noop") return "already_synced" as const
    if (plan === "conflict") return "conflict" as const
    const meta = { ...((locked.meta as Record<string, unknown> | null) ?? {}), stripeChargeId: extracted.chargeId, stripeBalanceTransactionId: extracted.balanceTransaction.id ?? null }
    await tx
      .update(maintenancePayments)
      .set({ providerFeeAmountCents: fin.providerFeeAmountCents, netAmountCents: fin.netAmountCents, meta })
      .where(and(eq(maintenancePayments.id, locked.id), eq(maintenancePayments.companyId, locked.companyId)))
    await appendMaintenanceAudit(tx, { companyId: locked.companyId, subscriptionId: locked.subscriptionId, action: "payment_financials_synced", actorType: "provider", meta: { paymentId: locked.id, providerFeeAmountCents: fin.providerFeeAmountCents, netAmountCents: fin.netAmountCents } })
    return "synced" as const
  })
}

/** Inline après activation : n'empêche JAMAIS l'activation (finalisé par charge.updated). */
async function syncFinancialsBestEffort(db: Executor, port: CustomerSubscriptionStripePort, account: string, target: { id: number; companyId: number }, paymentIntentId: string) {
  try {
    const [p] = await db
      .select({ id: maintenancePayments.id, companyId: maintenancePayments.companyId })
      .from(maintenancePayments)
      .where(and(eq(maintenancePayments.companyId, target.companyId), eq(maintenancePayments.subscriptionId, target.id), eq(maintenancePayments.externalPaymentId, paymentIntentId)))
      .limit(1)
    if (p) await syncMaintenancePaymentFinancials(db, port, account, p)
  } catch (e) {
    console.log("[v0] customer-subscriptions: financials différés", { reason: e instanceof Error ? e.name : "unknown" })
  }
}

/* ----------------------------- Remboursements ----------------------------- */

const MONEY_EVENTS = new Set(["charge.updated", "charge.refunded", "refund.created", "refund.updated", "refund.failed"])

/**
 * charge.* / refund.* : interceptés UNIQUEMENT si le PaymentIntent correspond
 * à un maintenance_payment du MÊME compte connecté. Sinon handled:false →
 * flux Booking strictement inchangé (et inversement, jamais de table croisée).
 */
async function handleMoneyEvent(db: Executor, port: CustomerSubscriptionStripePort, event: WebhookEventLike): Promise<WebhookOutcome> {
  const account = typeof event.account === "string" && event.account ? event.account : null
  if (!account) return { handled: false }
  const obj = event.data.object as ChargeLike & RefundLike
  const paymentIntentId = idOf(obj.payment_intent)
  if (!paymentIntentId) return { handled: false }
  const [payment] = await db
    .select()
    .from(maintenancePayments)
    .where(and(eq(maintenancePayments.provider, "stripe"), eq(maintenancePayments.providerAccountId, account), eq(maintenancePayments.externalPaymentId, paymentIntentId)))
    .limit(1)
  if (!payment) return { handled: false }
  const [sub] = await db
    .select({ providerAccountId: maintenanceSubscriptions.providerAccountId })
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.id, payment.subscriptionId), eq(maintenanceSubscriptions.companyId, payment.companyId)))
  if (!sub || sub.providerAccountId !== account) {
    await appendMaintenanceAudit(db, { companyId: payment.companyId, subscriptionId: payment.subscriptionId, action: "provider_account_mismatch", actorType: "provider", meta: { eventId: event.id, eventType: event.type } })
    return { handled: true, outcome: "rejected_account_mismatch" }
  }

  if (event.type === "charge.updated") {
    const r = await syncMaintenancePaymentFinancials(db, port, account, payment)
    return { handled: true, outcome: `charge_financials_${r}` }
  }
  const refunds = event.type === "charge.refunded" ? (obj.refunds?.data ?? []) : [obj as RefundLike]
  let last = "refund_noop"
  for (const refund of refunds) last = await recordMaintenanceRefund(db, payment, account, refund, eventDate(event))
  return { handled: true, outcome: refunds.length ? last : "charge_refunded_without_refund_list" }
}

/**
 * Remboursement maintenance idempotent (unique provider + compte + refund).
 * refundedAmountCents recalculé depuis les remboursements succeeded.
 * Aucun remboursement n'est jamais déclenché automatiquement par DetailFlow.
 */
export async function recordMaintenanceRefund(db: Executor, payment: PaymentRow, account: string, refund: RefundLike, at: Date): Promise<string> {
  if (!refund.id || !Number.isInteger(refund.amount) || (refund.amount as number) < 0) throw new CustomerSubscriptionError("PROVIDER_DATA_UNAVAILABLE")
  const currency = (refund.currency ?? payment.currency).toUpperCase()
  if (currency !== payment.currency.toUpperCase()) return "refund_currency_mismatch"
  const incoming = normalizeRefundStatus(refund.status)

  return db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(maintenancePayments)
      .where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, payment.companyId)))
      .for("update")
    if (!p) return "refund_payment_missing"
    const [existing] = await tx
      .select()
      .from(maintenanceRefunds)
      .where(and(eq(maintenanceRefunds.provider, "stripe"), eq(maintenanceRefunds.providerAccountId, account), eq(maintenanceRefunds.externalRefundId, refund.id)))
    if (existing && (existing.companyId !== p.companyId || existing.maintenancePaymentId !== p.id)) {
      await appendMaintenanceAudit(tx, { companyId: p.companyId, subscriptionId: p.subscriptionId, action: "refund_conflict", actorType: "provider", meta: { paymentId: p.id } })
      return "refund_conflict"
    }
    let changed = false
    if (!existing) {
      await tx.insert(maintenanceRefunds).values({
        companyId: p.companyId,
        subscriptionId: p.subscriptionId,
        maintenancePaymentId: p.id,
        provider: "stripe",
        providerAccountId: account,
        externalRefundId: refund.id,
        amountCents: refund.amount as number,
        currency,
        reason: refund.reason ?? null,
        status: incoming,
        succeededAt: incoming === "succeeded" ? at : null,
        failedAt: incoming === "failed" || incoming === "canceled" ? at : null,
        meta: { stripeChargeId: idOf(refund.charge) },
      })
      changed = true
    } else {
      const next = nextRefundStatus(existing.status as RefundStatusValue, incoming)
      if (next !== existing.status) {
        await tx
          .update(maintenanceRefunds)
          .set({
            status: next,
            succeededAt: next === "succeeded" ? (existing.succeededAt ?? at) : existing.succeededAt,
            failedAt: next === "failed" || next === "canceled" ? (existing.failedAt ?? at) : existing.failedAt,
            updatedAt: new Date(),
          })
          .where(and(eq(maintenanceRefunds.id, existing.id), eq(maintenanceRefunds.companyId, p.companyId)))
        changed = true
      }
    }

    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${maintenanceRefunds.amountCents}), 0)::int` })
      .from(maintenanceRefunds)
      .where(and(eq(maintenanceRefunds.companyId, p.companyId), eq(maintenanceRefunds.maintenancePaymentId, p.id), eq(maintenanceRefunds.status, "succeeded")))
    const refunded = Math.min(p.grossAmountCents, Number(total))
    const refundable = isSettledPaymentStatus(p.status)
    const nextStatus = refundable ? paymentStatusAfterRefunds(p.grossAmountCents, refunded) : p.status
    // refundedAt : premier passage > 0, jamais réécrit ensuite ; netAmountCents (snapshot initial) intouché.
    const refundedAt = refunded > 0 ? (p.refundedAt ?? at) : p.refundedAt
    if (refunded !== p.refundedAmountCents || nextStatus !== p.status || refundedAt !== p.refundedAt) {
      await tx
        .update(maintenancePayments)
        .set({ refundedAmountCents: refunded, status: nextStatus, refundedAt })
        .where(and(eq(maintenancePayments.id, p.id), eq(maintenancePayments.companyId, p.companyId)))
      changed = true
    }
    if (changed) {
      await appendMaintenanceAudit(tx, { companyId: p.companyId, subscriptionId: p.subscriptionId, action: "refund_recorded", actorType: "provider", meta: { paymentId: p.id, refundStatus: incoming, amountCents: refund.amount, refundedAmountCents: refunded, paymentStatus: nextStatus } })
    }
    return changed ? `refund_${incoming}` : "refund_duplicate"
  })
}

type RefundStatusValue = ReturnType<typeof normalizeRefundStatus>

async function onCheckoutPaid({ db, port, event, account, target, meta }: Ctx): Promise<WebhookOutcome> {
  const session = event.data.object as CheckoutSessionLike
  const kind = meta?.paymentType as CheckoutKind | undefined
  const paymentIntentId = idOf(session.payment_intent)
  const isPayment = kind === "prepaid" || kind === "initial_cleaning"
  // Montant réellement prélevé par la plateforme : lu sur le PaymentIntent du compte connecté.
  const pi = isPayment && session.payment_status === "paid" && paymentIntentId
    ? await providerCall(() => port.retrievePaymentIntent(paymentIntentId, { stripeAccount: account }))
    : null

  const result = await db.transaction(async (tx) => {
    let row = await lockTenantSubscription(tx, target.companyId, target.id)
    const modeOk =
      (kind === "recurring" && session.mode === "subscription" && row.paymentMode === "recurring") ||
      (kind === "prepaid" && session.mode === "payment" && row.paymentMode === "prepaid") ||
      (kind === "initial_cleaning" && session.mode === "payment" && row.initialCleaningRequiredSnapshot)
    if (!modeOk) return { handled: true as const, outcome: "ignored_kind_mismatch" }

    await linkProviderIds(tx, row, {
      externalCustomerId: idOf(session.customer),
      externalSubscriptionId: kind === "recurring" ? idOf(session.subscription) : null,
    })
    // Récurrent : l'encaissement et l'activation viennent d'invoice.paid.
    if (kind === "recurring") return { handled: true as const, outcome: "checkout_linked" }
    if (session.payment_status !== "paid") return { handled: true as const, outcome: "checkout_pending_async" }

    const externalPaymentId = paymentIntentId ?? session.id
    const paidAt = eventDate(event)
    const existing = await findPaymentBy(tx, row, "externalPaymentId", externalPaymentId)
    if (!existing) {
      const gross = Math.max(0, session.amount_total ?? 0)
      // initial_cleaning : 0 % par décision commerciale, quel que soit le PaymentIntent.
      const fee = kind === "initial_cleaning" ? 0 : Math.min(gross, Math.max(0, pi?.application_fee_amount ?? 0))
      const feeBps = kind === "initial_cleaning" ? 0 : feeBpsForCharged(gross, fee, [parseFeeBpsMetadata(meta)])
      await tx.insert(maintenancePayments).values({
        companyId: row.companyId,
        subscriptionId: row.id,
        provider: "stripe",
        providerAccountId: row.providerAccountId,
        externalPaymentId,
        type: kind!,
        status: "paid",
        currency: (session.currency ?? row.currency).toUpperCase(),
        grossAmountCents: gross,
        platformFeeBps: feeBps,
        platformFeeAmountCents: fee,
        paidAt,
        meta: { checkoutSessionId: session.id },
      })
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_succeeded", actorType: "provider", meta: { kind } })
    }

    // Nettoyage initial : paiement enregistré, contrat reste pending_initial_cleaning.
    if (kind === "prepaid" && row.status === "pending_payment") {
      await activateSubscription(tx, row.companyId, row.id, paidAt, "provider")
      row = await lockTenantSubscription(tx, row.companyId, row.id)
      await ensureCycle(tx, row, paidAt)
    }
    return { handled: true as const, outcome: existing ? "checkout_paid_duplicate" : "checkout_paid" }
  })
  if (isPayment && paymentIntentId && result.outcome.startsWith("checkout_paid")) {
    await syncFinancialsBestEffort(db, port, account, target, paymentIntentId)
  }
  return result
}

async function onSubscriptionUpdated({ db, event, target }: Ctx): Promise<WebhookOutcome> {
  const s = event.data.object as SubscriptionLike
  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: s.id, externalCustomerId: idOf(s.customer) })
    // Statut Stripe JAMAIS recopié ; currentTermEndsAt jamais écrasé. On trace
    // seulement une divergence de date de fin vis-à-vis de DetailFlow.
    const providerCancelAt = s.cancel_at ? s.cancel_at * 1000 : null
    const localCancelAt = row.cancelAt ? Math.floor(row.cancelAt.getTime() / 1000) * 1000 : null
    if (providerCancelAt !== localCancelAt || s.cancel_at_period_end) {
      await appendMaintenanceAudit(tx, {
        companyId: row.companyId,
        subscriptionId: row.id,
        action: "provider_subscription_updated",
        actorType: "provider",
        meta: { providerStatus: s.status ?? null, providerCancelAt: providerCancelAt ? new Date(providerCancelAt) : null, cancelAtPeriodEnd: Boolean(s.cancel_at_period_end), feePercent: s.application_fee_percent ?? null, divergent: providerCancelAt !== localCancelAt, feeBps: bpsFromFeePercent(s.application_fee_percent) },
      })
    }
    return { handled: true as const, outcome: "subscription_updated" }
  })
}

async function onSubscriptionDeleted({ db, event, target }: Ctx): Promise<WebhookOutcome> {
  const s = event.data.object as SubscriptionLike
  const endedAt = new Date((s.ended_at ?? s.canceled_at ?? event.created) * 1000)
  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    if (isTerminalStatus(row.status)) return { handled: true as const, outcome: "subscription_deleted_noop" }
    const outcome = decideProviderDeletion(row, endedAt)
    const patch =
      outcome === "cancelled"
        ? { status: "cancelled", cancelledAt: endedAt }
        : { status: outcome, endedAt, cancelAt: row.cancelAt ?? endedAt }
    await tx.update(maintenanceSubscriptions).set({ ...patch, updatedAt: endedAt }).where(whereSub(row))
    const action = outcome === "cancelled" ? "subscription_cancelled" : outcome === "expired" ? "subscription_expired" : "subscription_ended_by_provider"
    await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action, actorType: "provider", meta: { previousStatus: row.status, refund: "none" } })
    return { handled: true as const, outcome: `subscription_deleted_${outcome}` }
  })
}
