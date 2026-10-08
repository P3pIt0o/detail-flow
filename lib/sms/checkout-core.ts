/**
 * Packs SMS — Stripe Checkout sur le compte PLATEFORME DetailFlow (jamais Connect).
 * Module PUR (aucun accès DB / Stripe direct) : paramètres de session, validation
 * stricte d'une session payée et routage webhook via dépendances injectées.
 * Les montants viennent TOUJOURS de la ligne DB (calculée serveur par
 * amountForQuantity), jamais du navigateur.
 */

export const SMS_PACK_KIND = "sms_pack"

export const SMS_CHECKOUT_METADATA = {
  kind: "detailflow_kind",
  companyId: "company_id",
  requestId: "sms_recharge_request_id",
  reference: "sms_reference",
  quantity: "sms_quantity",
} as const

export type SmsCheckoutRecharge = {
  id: number
  companyId: number
  quantity: number
  amountCents: number
  reference: string
}

export function smsCheckoutIdempotencyKey(requestId: number): string {
  return `sms-pack-checkout-${requestId}`
}

/** Seules les recharges `manual` (Revolut / historique) sont pilotables par le super-admin. */
export function isManualRechargeProvider(provider: string | null | undefined): boolean {
  return provider === "manual"
}

export const SMS_CHECKOUT_COMPLETE_ERROR = "Votre paiement est en cours de confirmation."

export class SmsCheckoutError extends Error {}

export type SmsCheckoutSessionLike = { id: string; url: string | null; status?: string | null }

export interface SmsCheckoutStartDeps {
  /** Recharge Stripe pending la PLUS RÉCENTE pour ce tenant/quantité/montant. */
  findLatestPending(): Promise<{ id: number; sessionId: string | null } | null>
  retrieveSession(sessionId: string): Promise<SmsCheckoutSessionLike>
  /** Annule une recharge Stripe encore pending (scopée tenant). */
  cancelPending(requestId: number): Promise<void>
  insertRecharge(): Promise<{ id: number }>
  createSession(requestId: number): Promise<SmsCheckoutSessionLike>
  attachSession(requestId: number, sessionId: string): Promise<void>
  expireSession(sessionId: string): Promise<void>
}

/**
 * Cycle de vie anti double paiement :
 * open → réutilisée ; complete → refus métier ; expired / sans session → annulée
 * puis nouvelle tentative. Aucun échec Stripe/DB ne laisse une recharge pending
 * exploitable ni ne renvoie une URL non rattachée.
 */
export async function startSmsPackCheckoutCore(deps: SmsCheckoutStartDeps): Promise<{ url: string }> {
  const existing = await deps.findLatestPending()
  if (existing) {
    if (!existing.sessionId) {
      await deps.cancelPending(existing.id)
    } else {
      const s = await deps.retrieveSession(existing.sessionId)
      if (s.status === "open" && s.url) return { url: s.url }
      if (s.status === "complete") throw new SmsCheckoutError(SMS_CHECKOUT_COMPLETE_ERROR)
      await deps.cancelPending(existing.id)
    }
  }

  const recharge = await deps.insertRecharge()
  let session: SmsCheckoutSessionLike
  try {
    session = await deps.createSession(recharge.id)
  } catch (e) {
    await deps.cancelPending(recharge.id).catch(() => {})
    throw e
  }
  try {
    if (!session.url) throw new Error("Session Stripe sans URL.")
    await deps.attachSession(recharge.id, session.id)
  } catch (e) {
    await deps.expireSession(session.id).catch(() => {})
    await deps.cancelPending(recharge.id).catch(() => {})
    throw e
  }
  return { url: session.url }
}

export function buildSmsPackCheckoutParams(
  recharge: SmsCheckoutRecharge,
  urls: { successUrl: string; cancelUrl: string },
) {
  const M = SMS_CHECKOUT_METADATA
  const metadata = {
    [M.kind]: SMS_PACK_KIND,
    [M.companyId]: String(recharge.companyId),
    [M.requestId]: String(recharge.id),
    [M.reference]: recharge.reference,
    [M.quantity]: String(recharge.quantity),
  }
  return {
    mode: "payment" as const,
    currency: "eur",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: recharge.amountCents,
          product_data: { name: `Pack DetailFlow — ${recharge.quantity} SMS` },
        },
      },
    ],
    client_reference_id: String(recharge.companyId),
    metadata,
    payment_intent_data: { metadata },
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
  }
}

type SessionLike = {
  id: string
  mode?: string | null
  payment_status?: string | null
  currency?: string | null
  amount_total?: number | null
  payment_intent?: string | { id: string } | null
  metadata?: Record<string, string> | null
}

export function isSmsPackSession(session: { metadata?: Record<string, string> | null }): boolean {
  return session.metadata?.[SMS_CHECKOUT_METADATA.kind] === SMS_PACK_KIND
}

function posInt(v: string | undefined): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function parseSmsSessionRefs(session: SessionLike) {
  const m = session.metadata ?? {}
  const companyId = posInt(m[SMS_CHECKOUT_METADATA.companyId])
  const requestId = posInt(m[SMS_CHECKOUT_METADATA.requestId])
  const quantity = posInt(m[SMS_CHECKOUT_METADATA.quantity])
  if (!companyId || !requestId || !quantity) return null
  return { companyId, requestId, quantity }
}

export type StoredSmsRecharge = {
  id: number
  companyId: number
  quantity: number
  amountCents: number
  status: string
  paymentProvider: string
  stripeCheckoutSessionId: string | null
}

/** Vérifie qu'une session payée correspond EXACTEMENT à la recharge en base. */
export function validatePaidSmsSession(
  session: SessionLike,
  recharge: StoredSmsRecharge | null,
): { ok: true } | { ok: false; reason: string } {
  const refs = parseSmsSessionRefs(session)
  if (!refs) return { ok: false, reason: "invalid_metadata" }
  if (session.mode !== "payment") return { ok: false, reason: "mode" }
  if (session.payment_status !== "paid") return { ok: false, reason: "not_paid" }
  if ((session.currency ?? "").toLowerCase() !== "eur") return { ok: false, reason: "currency" }
  if (!recharge || recharge.id !== refs.requestId) return { ok: false, reason: "recharge_not_found" }
  if (recharge.paymentProvider !== "stripe") return { ok: false, reason: "provider" }
  if (recharge.status !== "pending" && recharge.status !== "paid") return { ok: false, reason: "status" }
  if (recharge.companyId !== refs.companyId) return { ok: false, reason: "company_mismatch" }
  if (recharge.quantity !== refs.quantity) return { ok: false, reason: "quantity_mismatch" }
  if (session.amount_total !== recharge.amountCents) return { ok: false, reason: "amount_mismatch" }
  if (recharge.stripeCheckoutSessionId !== session.id) return { ok: false, reason: "session_mismatch" }
  return { ok: true }
}

export interface SmsPackWebhookDeps {
  getRecharge(requestId: number): Promise<StoredSmsRecharge | null>
  /** creditFromRecharge : transition pending → paid idempotente. */
  credit(requestId: number): Promise<{ ok: true; already: boolean; quantity: number; newBalance: number } | { ok: false; error: string }>
  cancel(requestId: number, companyId: number, sessionId: string): Promise<boolean>
  allocate(companyId: number): Promise<{ ok: boolean; error?: string }>
  hasSubAccount?(companyId: number): Promise<boolean>
  recordPaymentIntent?(requestId: number, paymentIntentId: string | null): Promise<void>
  notifyCredited?(companyId: number, quantity: number, newBalance: number): Promise<void>
}

export interface SmsWebhookResult {
  status: number
  body: Record<string, unknown>
}

const ok = (body: Record<string, unknown>): SmsWebhookResult => ({ status: 200, body: { received: true, sms: true, ...body } })

export async function handleSmsPackWebhookEvent(
  eventType: string,
  session: SessionLike,
  deps: SmsPackWebhookDeps,
): Promise<SmsWebhookResult> {
  const refs = parseSmsSessionRefs(session)
  if (!refs) {
    console.error("[billing-webhook] sms_pack metadata invalides:", session.id)
    return ok({ rejected: "invalid_metadata" })
  }

  if (eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed") {
    const cancelled = await deps.cancel(refs.requestId, refs.companyId, session.id)
    return ok({ cancelled })
  }

  if (eventType !== "checkout.session.completed" && eventType !== "checkout.session.async_payment_succeeded") {
    return ok({ ignored: eventType })
  }
  // Paiement différé : completed avec payment_status "unpaid" → on attend async_payment_succeeded.
  if (session.payment_status !== "paid") return ok({ pending: true })

  const recharge = await deps.getRecharge(refs.requestId)
  const check = validatePaidSmsSession(session, recharge)
  if (!check.ok) {
    console.error("[billing-webhook] sms_pack rejeté:", session.id, check.reason)
    return ok({ rejected: check.reason })
  }

  const credited = await deps.credit(refs.requestId)
  if (!credited.ok) {
    console.error("[billing-webhook] sms_pack crédit impossible:", session.id)
    return { status: 500, body: { error: "Crédit impossible" } }
  }

  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null
  try {
    await deps.recordPaymentIntent?.(refs.requestId, pi)
  } catch {
    /* audit uniquement */
  }

  if (!credited.already && deps.notifyCredited) {
    try {
      await deps.notifyCredited(refs.companyId, credited.quantity, credited.newBalance)
    } catch {
      /* l'email ne conditionne jamais le crédit */
    }
  }

  // Pack acheté avant activation SMS : cas normal. Crédits conservés dans
  // DetailFlow, transférés à l'activation (ensureTenantSubAccount + delta).
  const hasSub = deps.hasSubAccount ? await deps.hasSubAccount(refs.companyId).catch(() => true) : true
  if (!hasSub) return ok({ credited: !credited.already, allocationPending: true })

  // Allocation AllMySMS basée sur le delta (idempotente). Un échec laisse le
  // crédit DB intact ; 500 → Stripe rejoue, credit() renvoie already=true (0 crédit).
  const allocation = await deps.allocate(refs.companyId).catch((e: unknown) => ({
    ok: false,
    error: e instanceof Error ? e.message : "allocation_failed",
  }))
  if (!allocation.ok) {
    console.error("[billing-webhook] sms_pack allocation AllMySMS échouée:", session.id)
    return { status: 500, body: { error: "Allocation SMS en attente", credited: true } }
  }
  return ok({ credited: !credited.already })
}
