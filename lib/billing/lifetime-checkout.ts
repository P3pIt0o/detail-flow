import "server-only"

/**
 * DetailFlow — Création du Checkout Lifetime comptant 1 290 € HT (LOT S3A).
 *
 * Ordre IMPÉRATIF : autorisation → Price (env) → réservation DB du slot →
 * Checkout Stripe → rattachement de la session. Le navigateur ne fournit
 * AUCUNE donnée : companyId/rôle viennent de la session serveur, le Price de
 * l'env, le montant de lib/billing/lifetime.ts.
 *
 * Ce service n'active JAMAIS de licence : seule la réception d'un webhook
 * signé confirmant le paiement le peut (lib/billing/lifetime-webhook.ts).
 */

import type Stripe from "stripe"
import {
  LIFETIME_UNATTACHED_RESERVATION_STALE_SECONDS,
  LifetimeCheckoutError,
  assertLifetimePurchaseRole,
  buildLifetimeSingleCheckoutParams,
  resolveLifetimeSinglePriceId,
  validateLifetimeSinglePrice,
} from "./lifetime-checkout-core"
import { LifetimeError, assertValidCompanyId } from "./lifetime"
import {
  attachLifetimeCheckoutSession,
  findOpenLifetimeReservation,
  releaseLifetimeReservation,
  reserveLifetimeSlot,
  type LifetimeAllocation,
  type LifetimeDeps,
} from "./lifetime-server"

/** Sous-ensemble du SDK Stripe utilisé (injectable en test, jamais de réseau). */
export interface LifetimeStripeSessions {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    options?: { idempotencyKey?: string },
  ): Promise<Stripe.Checkout.Session>
  retrieve(id: string): Promise<Stripe.Checkout.Session>
  expire(id: string): Promise<Stripe.Checkout.Session>
  listLineItems(id: string, params?: { limit?: number }): Promise<{ data: Stripe.LineItem[] }>
}

export interface LifetimeStripeClient {
  checkout: { sessions: LifetimeStripeSessions }
}

/** Client requis par la création du Checkout : ajoute la lecture du Price. */
export type LifetimeCheckoutStripeClient = LifetimeStripeClient & {
  prices: { retrieve(id: string, params?: { expand?: string[] }): Promise<Stripe.Price> }
}

export interface LifetimeCheckoutDeps extends LifetimeDeps {
  stripe: LifetimeCheckoutStripeClient
  env?: Record<string, string | undefined>
  now?: () => Date
}

export interface LifetimeCheckoutInput {
  companyId: number
  role: string
  isSuperAdmin: boolean
  successUrl: string
  cancelUrl: string
}

export interface LifetimeCheckoutResult {
  url: string
  allocationId: number
  checkoutSessionId: string
  reused: boolean
}

async function releaseQuietly(allocation: LifetimeAllocation, deps: LifetimeCheckoutDeps): Promise<void> {
  if (allocation.companyId == null) return
  await releaseLifetimeReservation({ companyId: allocation.companyId, allocationId: allocation.id }, deps).catch(
    (error) => console.error("[lifetime-checkout] libération impossible:", allocation.id, error),
  )
}

const PRICE_INVALID_MESSAGE = "Le paiement Lifetime est momentanément indisponible."

async function assertLifetimeSinglePriceUsable(
  priceId: string,
  env: Record<string, string | undefined>,
  deps: LifetimeCheckoutDeps,
): Promise<void> {
  let price: Stripe.Price
  try {
    price = await deps.stripe.prices.retrieve(priceId, { expand: ["product"] })
  } catch (error) {
    const e = error as { type?: string; code?: string }
    console.error("[lifetime-checkout] Price Stripe irrécupérable:", e?.type ?? "unknown", e?.code ?? "")
    throw new LifetimeCheckoutError("PRICE_INVALID", PRICE_INVALID_MESSAGE)
  }
  try {
    validateLifetimeSinglePrice(price, priceId, env.STRIPE_SECRET_KEY)
  } catch (error) {
    console.error("[lifetime-checkout] Price Stripe refusé:", error instanceof Error ? error.message : "invalide")
    throw new LifetimeCheckoutError("PRICE_INVALID", PRICE_INVALID_MESSAGE)
  }
}

/**
 * Double clic / reprise : une réservation valide déjà liée à une session
 * ouverte est réutilisée ; une session terminée bloque toute nouvelle
 * création ; une session expirée (ou une réservation orpheline) est libérée.
 * Renvoie un résultat réutilisable, ou null pour poursuivre une création.
 */
async function reuseOrCleanExisting(
  companyId: number,
  deps: LifetimeCheckoutDeps,
  now: Date,
): Promise<LifetimeCheckoutResult | null> {
  const existing = await findOpenLifetimeReservation(companyId, deps)
  if (!existing) return null

  if (existing.paymentPlan !== "single") {
    throw new LifetimeError("ALREADY_ALLOCATED", "Cette entreprise a déjà une réservation Lifetime en cours.")
  }

  if (!existing.stripeCheckoutSessionId) {
    const ageSeconds = (now.getTime() - new Date(existing.reservedAt).getTime()) / 1000
    if (ageSeconds < LIFETIME_UNATTACHED_RESERVATION_STALE_SECONDS) {
      throw new LifetimeCheckoutError("CHECKOUT_IN_PROGRESS", "Un paiement Lifetime est déjà en cours de préparation.")
    }
    await releaseLifetimeReservation({ companyId, allocationId: existing.id }, deps)
    return null
  }

  const session = await deps.stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId)
  if (session.status === "complete") {
    throw new LifetimeCheckoutError(
      "CHECKOUT_ALREADY_COMPLETED",
      "Le paiement Lifetime est en cours de confirmation.",
    )
  }
  if (session.status === "open" && session.url && session.metadata?.allocation_id === String(existing.id)) {
    return { url: session.url, allocationId: existing.id, checkoutSessionId: session.id, reused: true }
  }
  if (session.status === "open") {
    await deps.stripe.checkout.sessions.expire(session.id).catch(() => undefined)
  }
  await releaseLifetimeReservation({ companyId, allocationId: existing.id }, deps)
  return null
}

export async function createLifetimeSingleCheckout(
  input: LifetimeCheckoutInput,
  deps: LifetimeCheckoutDeps,
): Promise<LifetimeCheckoutResult> {
  assertLifetimePurchaseRole(input.role, input.isSuperAdmin)
  assertValidCompanyId(input.companyId)
  // Fail closed AVANT toute réservation : aucun slot bloqué par une config absente.
  const env = deps.env ?? process.env
  const priceId = resolveLifetimeSinglePriceId(env)
  // Price réellement vérifié chez Stripe AVANT toute lecture/écriture d'allocation.
  await assertLifetimeSinglePriceUsable(priceId, env, deps)
  const now = deps.now?.() ?? new Date()
  const { companyId } = input

  const reused = await reuseOrCleanExisting(companyId, deps, now)
  if (reused) return reused

  let allocation: LifetimeAllocation
  try {
    allocation = await reserveLifetimeSlot({ companyId, paymentPlan: "single" }, deps)
  } catch (error) {
    // Clic concurrent : l'autre requête détient la réservation → pas de 2e Checkout.
    if (error instanceof LifetimeError && error.code === "ALREADY_ALLOCATED") {
      const open = await findOpenLifetimeReservation(companyId, deps)
      if (open) {
        throw new LifetimeCheckoutError("CHECKOUT_IN_PROGRESS", "Un paiement Lifetime est déjà en cours de préparation.")
      }
    }
    throw error
  }

  let session: Stripe.Checkout.Session
  try {
    const params = buildLifetimeSingleCheckoutParams({
      companyId,
      allocationId: allocation.id,
      priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      reservationExpiresAt: allocation.reservationExpiresAt ? new Date(allocation.reservationExpiresAt) : null,
      now,
    })
    // Clé d'idempotence liée à l'allocation : un retry réseau ne crée jamais 2 sessions.
    session = await deps.stripe.checkout.sessions.create(params, {
      idempotencyKey: `detailflow-lifetime-checkout-${allocation.id}`,
    })
    if (!session.url) throw new Error("Checkout Session sans URL")
  } catch (error) {
    await releaseQuietly(allocation, deps)
    if (error instanceof LifetimeCheckoutError) throw error
    console.error("[lifetime-checkout] création Stripe échouée:", error instanceof Error ? error.message : error)
    throw new LifetimeCheckoutError("CHECKOUT_CREATE_FAILED", "La création du paiement Stripe a échoué.")
  }

  try {
    await attachLifetimeCheckoutSession(
      { companyId, allocationId: allocation.id, checkoutSessionId: session.id },
      deps,
    )
  } catch (error) {
    await deps.stripe.checkout.sessions.expire(session.id).catch(() => undefined)
    await releaseQuietly(allocation, deps)
    throw error
  }

  return { url: session.url, allocationId: allocation.id, checkoutSessionId: session.id, reused: false }
}
