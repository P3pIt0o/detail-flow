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
import { and, eq } from "drizzle-orm"
import { companies, maintenancePayments, maintenanceSubscriptions } from "@/lib/db/schema"
import { CustomerSubscriptionError } from "./errors"
import { computePlatformFeeAmountCents } from "./contract"
import {
  appendMaintenanceAudit,
  activateSubscription,
  assertCanMutate,
  createCycleIfMissing,
  resolveCurrentCustomerSubscriptionFee,
  type Actor,
  type Executor,
} from "./engine"
import { isTerminalStatus } from "./statuses"
import {
  CUSTOMER_SUBSCRIPTION_MODULE,
  assertReturnUrl,
  bpsFromFeePercent,
  buildCheckoutSessionParams,
  checkoutIdempotencyKey,
  decideProviderDeletion,
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

export type PaymentIntentLike = { id: string; application_fee_amount?: number | null; amount_received?: number | null }

export interface CustomerSubscriptionStripePort {
  createCheckoutSession(params: CheckoutSessionParams, opts: StripeCallOptions): Promise<CheckoutSessionLike>
  retrieveCheckoutSession(id: string, opts: StripeCallOptions): Promise<CheckoutSessionLike>
  retrieveSubscription(id: string, opts: StripeCallOptions): Promise<SubscriptionLike>
  updateSubscription(id: string, params: Record<string, unknown>, opts: StripeCallOptions): Promise<SubscriptionLike>
  cancelSubscription(id: string, opts: StripeCallOptions): Promise<SubscriptionLike>
  retrievePaymentIntent(id: string, opts: StripeCallOptions): Promise<PaymentIntentLike>
  updateInvoice(id: string, params: Record<string, unknown>, opts: StripeCallOptions): Promise<{ id: string }>
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
 * Démarre (ou reprend) le paiement attendu par le contrat. Verrou DB sur le
 * contrat : un double clic attend la première tentative puis la réutilise.
 * Clé Stripe déterministe par tentative ; externalCheckoutSessionId n'est
 * écrit qu'après succès Stripe.
 */
export async function startSubscriptionCheckout(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  input: { returnUrl: string },
): Promise<StartCheckoutResult> {
  assertCanMutate(actor)
  const returnUrl = assertReturnUrl(input.returnUrl)
  return db.transaction(async (tx) => {
    const sub = await lockTenantSubscription(tx, companyId, subscriptionId)
    const kind = resolveCheckoutKind(sub)
    if (!kind) throw new CustomerSubscriptionError("CHECKOUT_NOT_ALLOWED")
    if (sub.provider !== "stripe" || !sub.providerAccountId) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")
    const [company] = await tx
      .select({ stripeAccountId: companies.stripeAccountId, chargesEnabled: companies.stripeChargesEnabled })
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

    const opts = { stripeAccount: sub.providerAccountId }
    const paymentMode = sub.paymentMode as "recurring" | "prepaid"
    let previousSessionId: string | null = null
    if (sub.externalCheckoutSessionId) {
      const existing = await providerCall(() => port.retrieveCheckoutSession(sub.externalCheckoutSessionId!, opts))
      const sameKind = existing.metadata?.paymentType === kind
      if (sameKind && existing.status === "open" && existing.client_secret) {
        return { checkoutSessionId: existing.id, clientSecret: existing.client_secret, status: "open" as const, paymentMode, kind, reused: true }
      }
      // Payée mais webhook pas encore reçu : ne jamais recréer.
      if (sameKind && existing.status === "complete") throw new CustomerSubscriptionError("CHECKOUT_ALREADY_COMPLETED")
      previousSessionId = existing.id
    }

    const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(tx, companyId)
    const built = buildCheckoutSessionParams(sub, kind, platformFeeBps, returnUrl)
    const session = await providerCall(() =>
      port.createCheckoutSession(built.params, {
        ...opts,
        idempotencyKey: checkoutIdempotencyKey({ companyId, subscriptionId: sub.id, kind, previousSessionId }),
      }),
    )
    if (!session.client_secret) throw new CustomerSubscriptionError("PROVIDER_ERROR")

    await tx.update(maintenanceSubscriptions).set({ externalCheckoutSessionId: session.id, updatedAt: new Date() }).where(whereSub(sub))
    await appendMaintenanceAudit(tx, {
      companyId,
      subscriptionId: sub.id,
      action: "checkout_started",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { kind, platformFeeBps: built.platformFeeBps, grossAmountCents: built.grossAmountCents, retryOf: previousSessionId },
    })
    return { checkoutSessionId: session.id, clientSecret: session.client_secret, status: "open" as const, paymentMode, kind, reused: false }
  })
}

/* ------------------------------ Annulation ------------------------------- */

/**
 * Applique à Stripe une annulation DÉJÀ calculée par le moteur métier
 * (scheduleCancellation / forceEndSubscription). Stripe ne décide jamais de
 * la date d'engagement. Aucun remboursement.
 */
export async function applyCancellationToProvider(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date = new Date(),
): Promise<{ applied: boolean; mode?: "scheduled" | "immediate"; reason?: string }> {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockTenantSubscription(tx, companyId, subscriptionId)
    if (!sub.externalSubscriptionId || !sub.providerAccountId) return { applied: false, reason: "no_provider_subscription" }
    const ext = sub.externalSubscriptionId
    const opts = { stripeAccount: sub.providerAccountId }
    const immediate = (sub.status === "cancelled" || sub.status === "ended") && (!sub.cancelAt || sub.cancelAt <= now)

    if (immediate) {
      const current = await providerCall(() => port.retrieveSubscription(ext, opts))
      if (current.status !== "canceled") await providerCall(() => port.cancelSubscription(ext, { ...opts, idempotencyKey: `df-cancel:${ext}` }))
      await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "provider_cancellation_applied", actorType: "user", actorUserId: actor.userId, meta: { mode: "immediate", refund: "none" } })
      return { applied: true, mode: "immediate" as const }
    }
    if (sub.cancelAt && sub.cancelAt > now) {
      const cancelAtSeconds = Math.floor(sub.cancelAt.getTime() / 1000)
      await providerCall(() =>
        port.updateSubscription(ext, { cancel_at: cancelAtSeconds, proration_behavior: "none" }, { ...opts, idempotencyKey: `df-cancel-at:${ext}:${cancelAtSeconds}` }),
      )
      await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "provider_cancellation_applied", actorType: "user", actorUserId: actor.userId, meta: { mode: "scheduled", cancelAt: sub.cancelAt, refund: "none" } })
      return { applied: true, mode: "scheduled" as const }
    }
    return { applied: false, reason: "nothing_to_apply" }
  })
}

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

async function onInvoiceCreated({ db, port, event, account, target }: Ctx): Promise<WebhookOutcome> {
  const inv = event.data.object as InvoiceLike
  const gross = Math.max(0, inv.amount_due ?? inv.total ?? 0)
  const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(db, target.companyId)
  const ext = invoiceSubscriptionId(inv)
  const opts = { stripeAccount: account }

  const [peek] = await db.select({ status: maintenanceSubscriptions.status }).from(maintenanceSubscriptions).where(whereSub(target))
  const terminal = isTerminalStatus(peek?.status ?? "ended")

  let feeBps: number
  let feeAmount: number
  let synced = false
  if (inv.status === "draft") {
    // Plan EFFECTIF au moment de la facture : montant exact recalculé.
    feeBps = platformFeeBps
    feeAmount = computePlatformFeeAmountCents(gross, platformFeeBps)
    await providerCall(() =>
      port.updateInvoice(
        inv.id,
        { application_fee_amount: feeAmount, metadata: { detailflowPlatformFeeBps: String(platformFeeBps), maintenanceSubscriptionId: String(target.id) } },
        { ...opts, idempotencyKey: `df-inv-fee:${inv.id}:${platformFeeBps}` },
      ),
    )
    synced = true
  } else {
    // Facture déjà finalisée : jamais modifiée, on fige ce que Stripe prélève réellement.
    feeAmount = invoiceChargedFeeCents(inv, gross, platformFeeBps)
    feeBps = feeBpsForCharged(gross, feeAmount, [parseFeeBpsMetadata(invoiceMetadata(inv)), platformFeeBps])
  }
  if (ext && !terminal) {
    const percent = feePercentFromBps(platformFeeBps)
    // "" = suppression du pourcentage (taux 0). Clé par facture : rejouable sans état périmé.
    await providerCall(() => port.updateSubscription(ext, { application_fee_percent: percent ?? "" }, { ...opts, idempotencyKey: `df-sub-fee:${inv.id}:${platformFeeBps}` }))
  }

  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: ext })
    const existing = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    if (!existing) {
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
    if (synced) await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "platform_fee_synced", actorType: "system", meta: { invoiceId: inv.id, platformFeeBps, platformFeeAmountCents: feeAmount } })
    return { handled: true as const, outcome: existing ? "invoice_created_duplicate" : "invoice_created" }
  })
}

async function onInvoicePaid({ db, event, target }: Ctx): Promise<WebhookOutcome> {
  const inv = event.data.object as InvoiceLike & { customer?: Ref }
  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : eventDate(event)
  const gross = Math.max(0, inv.amount_paid ?? inv.amount_due ?? 0)
  const paymentIntentId = invoicePaymentIntentId(inv)
  const period = invoicePeriod(inv)
  const anchor = period?.start ?? paidAt
  const probe = period ? periodProbe(period) : paidAt

  return db.transaction(async (tx) => {
    let row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: invoiceSubscriptionId(inv), externalCustomerId: idOf(inv.customer) })

    let payment = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    if (!payment) {
      const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(tx, row.companyId)
      const fee = invoiceChargedFeeCents(inv, gross, platformFeeBps)
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
          platformFeeBps: feeBpsForCharged(gross, fee, [parseFeeBpsMetadata(invoiceMetadata(inv)), platformFeeBps]),
          platformFeeAmountCents: fee,
          paidAt,
        })
        .returning()
    } else if (payment.status !== "paid") {
      // Snapshots de commission conservés tels quels.
      ;[payment] = await tx
        .update(maintenancePayments)
        .set({ status: "paid", paidAt, externalPaymentId: payment.externalPaymentId ?? paymentIntentId })
        .where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
        .returning()
    }

    if (row.status === "pending_payment") {
      // Ancre = période Stripe réelle de la 1re facture, pas Date.now().
      await activateSubscription(tx, row.companyId, row.id, anchor, "provider")
      row = await lockTenantSubscription(tx, row.companyId, row.id)
    } else if (row.status === "past_due") {
      const next = statusAfterRecovery(row, paidAt)
      await tx.update(maintenanceSubscriptions).set({ status: next, updatedAt: paidAt }).where(whereSub(row))
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "subscription_recovered", actorType: "provider", meta: { status: next } })
    }
    // suspended (manuel) : jamais réactivé automatiquement.

    const cycleId = await ensureCycle(tx, row, probe)
    if (cycleId != null && payment.cycleId == null) {
      await tx.update(maintenancePayments).set({ cycleId }).where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
    }
    await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_succeeded", actorType: "provider", meta: { invoiceId: inv.id, cycleId } })
    return { handled: true as const, outcome: "invoice_paid" }
  })
}

async function onInvoicePaymentFailed({ db, event, target }: Ctx): Promise<WebhookOutcome> {
  const inv = event.data.object as InvoiceLike
  const failedAt = eventDate(event)
  const gross = Math.max(0, inv.amount_due ?? inv.total ?? 0)
  return db.transaction(async (tx) => {
    const row = await lockTenantSubscription(tx, target.companyId, target.id)
    await linkProviderIds(tx, row, { externalSubscriptionId: invoiceSubscriptionId(inv) })
    const payment = await findPaymentBy(tx, row, "externalInvoiceId", inv.id)
    if (!payment) {
      const { platformFeeBps } = await resolveCurrentCustomerSubscriptionFee(tx, row.companyId)
      const fee = invoiceChargedFeeCents(inv, gross, platformFeeBps)
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
        platformFeeBps: feeBpsForCharged(gross, fee, [parseFeeBpsMetadata(invoiceMetadata(inv)), platformFeeBps]),
        platformFeeAmountCents: fee,
        failedAt,
      })
    } else if (payment.status !== "paid") {
      await tx.update(maintenancePayments).set({ status: "failed", failedAt }).where(and(eq(maintenancePayments.id, payment.id), eq(maintenancePayments.companyId, row.companyId)))
    }

    // Aucun cycle supprimé. RAPPEL : cycle existant ≠ droit utilisable ; le
    // booking devra TOUJOURS passer par canUseEntitlement() (past_due → refus).
    const next = statusAfterPaymentFailed(row.status)
    if (next !== row.status) {
      await tx.update(maintenanceSubscriptions).set({ status: next, updatedAt: failedAt }).where(whereSub(row))
      await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "subscription_past_due", actorType: "provider", meta: { previousStatus: row.status } })
    }
    await appendMaintenanceAudit(tx, { companyId: row.companyId, subscriptionId: row.id, action: "payment_failed", actorType: "provider", meta: { invoiceId: inv.id } })
    return { handled: true as const, outcome: "invoice_payment_failed" }
  })
}

async function onCheckoutPaid({ db, port, event, account, target, meta }: Ctx): Promise<WebhookOutcome> {
  const session = event.data.object as CheckoutSessionLike
  const kind = meta?.paymentType as CheckoutKind | undefined
  const paymentIntentId = idOf(session.payment_intent)
  const isPayment = kind === "prepaid" || kind === "initial_cleaning"
  // Montant réellement prélevé par la plateforme : lu sur le PaymentIntent du compte connecté.
  const pi = isPayment && session.payment_status === "paid" && paymentIntentId
    ? await providerCall(() => port.retrievePaymentIntent(paymentIntentId, { stripeAccount: account }))
    : null

  return db.transaction(async (tx) => {
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
