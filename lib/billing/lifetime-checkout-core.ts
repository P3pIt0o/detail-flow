/**
 * DetailFlow — Règles PURES du Checkout Lifetime comptant (LOT S3A).
 *
 * Aucun import serveur, aucune DB, aucun appel Stripe : uniquement la
 * construction des paramètres Checkout et la validation stricte d'une
 * Checkout Session avant activation. Testable sans réseau.
 *
 * Périmètre : paiement comptant `single` uniquement. Le 2 × 690 € (S3B)
 * n'est pas implémenté : STRIPE_PRICE_LIFETIME_INSTALLMENT n'est jamais lu.
 */

import type Stripe from "stripe"
import { isValidStripePriceId } from "./config"
import {
  LIFETIME_CHECKOUT_TTL_MINUTES,
  LIFETIME_CURRENCY,
  LIFETIME_PAYMENT_PLANS,
  LIFETIME_RESERVATION_TTL_MINUTES,
  type LifetimeAllocationStatus,
} from "./lifetime"
import { LIFETIME_STRIPE_PRICES } from "./lifetime-stripe-setup"

export const LIFETIME_SINGLE_PRICE_ENV = LIFETIME_STRIPE_PRICES.single.envName
export const LIFETIME_SINGLE_AMOUNT_CENTS = LIFETIME_PAYMENT_PLANS.single.totalCents

/**
 * Stripe impose expires_at >= création + 30 min : une marge de 60 s absorbe
 * la latence réseau/horloge sans dépasser la réservation DB (60 min).
 */
export const LIFETIME_CHECKOUT_EXPIRY_SAFETY_SECONDS = 60

/** Réservation sans session attachée considérée comme abandonnée (crash). */
export const LIFETIME_UNATTACHED_RESERVATION_STALE_SECONDS = 120

export const LIFETIME_BILLING_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
] as const

export type LifetimeCheckoutErrorCode =
  | "FORBIDDEN_ROLE"
  | "PRICE_NOT_CONFIGURED"
  | "CHECKOUT_IN_PROGRESS"
  | "CHECKOUT_ALREADY_COMPLETED"
  | "CHECKOUT_CREATE_FAILED"
  | "SESSION_VALIDATION_FAILED"

export class LifetimeCheckoutError extends Error {
  constructor(
    readonly code: LifetimeCheckoutErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "LifetimeCheckoutError"
  }
}

/* -------------------------------- Autorisation ---------------------------- */

/** Seul un OWNER (ou un super-admin en assistance) engage l'entreprise. */
export function assertLifetimePurchaseRole(role: string, isSuperAdmin: boolean): void {
  if (isSuperAdmin) return
  if (role !== "OWNER") {
    throw new LifetimeCheckoutError(
      "FORBIDDEN_ROLE",
      "Seul le propriétaire de l'entreprise peut acheter la licence Lifetime.",
    )
  }
}

/* ------------------------------------ Price ------------------------------- */

type EnvLike = Record<string, string | undefined>

/** Fail closed : absent, vide ou hors format `price_` => refus. */
export function resolveLifetimeSinglePriceId(env: EnvLike): string {
  const value = env[LIFETIME_SINGLE_PRICE_ENV]?.trim()
  if (!value || !isValidStripePriceId(value)) {
    throw new LifetimeCheckoutError(
      "PRICE_NOT_CONFIGURED",
      `${LIFETIME_SINGLE_PRICE_ENV} absent ou invalide (doit commencer par price_).`,
    )
  }
  return value
}

/* ---------------------------------- Metadata ------------------------------ */

export function buildLifetimeSingleMetadata(companyId: number, allocationId: number): Record<string, string> {
  return {
    app: "detailflow",
    billing_type: "lifetime",
    payment_plan: "single",
    company_id: String(companyId),
    allocation_id: String(allocationId),
  }
}

/** Vrai si la session relève de la facturation Lifetime DetailFlow. */
export function isLifetimeCheckoutSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  return session.metadata?.app === "detailflow" && session.metadata?.billing_type === "lifetime"
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

export interface LifetimeSessionRefs {
  companyId: number
  allocationId: number
}

/** Identifiants d'une session Lifetime `single`, ou null si incohérents. */
export function parseLifetimeSessionRefs(session: Pick<Stripe.Checkout.Session, "metadata">): LifetimeSessionRefs | null {
  const meta = session.metadata ?? {}
  if (meta.app !== "detailflow" || meta.billing_type !== "lifetime" || meta.payment_plan !== "single") return null
  const companyId = parsePositiveInt(meta.company_id)
  const allocationId = parsePositiveInt(meta.allocation_id)
  if (companyId == null || allocationId == null) return null
  return { companyId, allocationId }
}

/* ------------------------------ Checkout params --------------------------- */

export interface LifetimeCheckoutParamsInput {
  companyId: number
  allocationId: number
  priceId: string
  successUrl: string
  cancelUrl: string
  reservationExpiresAt: Date | null
  now: Date
}

export function computeCheckoutExpiresAt(now: Date): number {
  return Math.floor(now.getTime() / 1000) + LIFETIME_CHECKOUT_TTL_MINUTES * 60 + LIFETIME_CHECKOUT_EXPIRY_SAFETY_SECONDS
}

/**
 * Paramètres de la Checkout Session (compte PLATEFORME, jamais Connect) :
 * pas de Stripe Tax, pas de code promo, pas de remise, pas d'application fee.
 */
export function buildLifetimeSingleCheckoutParams(input: LifetimeCheckoutParamsInput): Stripe.Checkout.SessionCreateParams {
  const expiresAt = computeCheckoutExpiresAt(input.now)
  if (
    !input.reservationExpiresAt ||
    Math.floor(input.reservationExpiresAt.getTime() / 1000) <= expiresAt
  ) {
    // La réservation DB doit survivre au Checkout (marge webhook).
    throw new LifetimeCheckoutError(
      "CHECKOUT_CREATE_FAILED",
      "La réservation Lifetime expire avant le Checkout : création refusée.",
    )
  }
  const metadata = buildLifetimeSingleMetadata(input.companyId, input.allocationId)
  return {
    mode: "payment",
    line_items: [{ price: input.priceId, quantity: 1 }],
    payment_method_types: ["card"],
    allow_promotion_codes: false,
    automatic_tax: { enabled: false },
    client_reference_id: String(input.companyId),
    metadata,
    payment_intent_data: { metadata },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: expiresAt,
  }
}

/** Invariant documenté : Checkout (30 min) < réservation DB (60 min). */
export function checkoutExpiresBeforeReservation(): boolean {
  return (
    LIFETIME_CHECKOUT_TTL_MINUTES * 60 + LIFETIME_CHECKOUT_EXPIRY_SAFETY_SECONDS <
    LIFETIME_RESERVATION_TTL_MINUTES * 60
  )
}

/* --------------------------- Validation avant activation ------------------ */

export interface AllocationSnapshot {
  id: number
  companyId: number | null
  status: LifetimeAllocationStatus
  paymentPlan: string
  stripeCheckoutSessionId: string | null
}

export interface ValidatedLifetimePayment {
  companyId: number
  allocationId: number
  checkoutSessionId: string
  paymentIntentId: string | null
  paidAmountCents: number
}

function reject(reason: string): never {
  throw new LifetimeCheckoutError("SESSION_VALIDATION_FAILED", `Session Lifetime rejetée : ${reason}.`)
}

/**
 * Validation STRICTE d'une Checkout Session payée. Toute incohérence => rejet,
 * aucune activation. Le montant seul ne suffit jamais : le Price et la
 * quantité des line items sont vérifiés.
 */
export function validatePaidLifetimeSession(input: {
  session: Stripe.Checkout.Session
  lineItems: readonly Stripe.LineItem[]
  allocation: AllocationSnapshot | null
  expectedPriceId: string
}): ValidatedLifetimePayment {
  const { session, lineItems, allocation, expectedPriceId } = input

  if (session.mode !== "payment") reject("mode différent de payment")
  if (session.payment_status !== "paid") reject("paiement non confirmé")
  if (session.currency !== LIFETIME_CURRENCY) reject("devise inattendue")
  if (session.amount_total !== LIFETIME_SINGLE_AMOUNT_CENTS) reject("montant inattendu")

  const refs = parseLifetimeSessionRefs(session)
  if (!refs) reject("metadata invalides")
  if (session.client_reference_id != null && session.client_reference_id !== String(refs.companyId)) {
    reject("client_reference_id incohérent")
  }

  if (!allocation) reject("allocation introuvable")
  if (allocation.id !== refs.allocationId) reject("allocation_id incohérent")
  if (allocation.companyId !== refs.companyId) reject("company_id incohérent")
  if (allocation.paymentPlan !== "single") reject("plan de paiement de l'allocation incohérent")
  if (allocation.stripeCheckoutSessionId !== session.id) reject("session non rattachée à l'allocation")

  if (lineItems.length !== 1) reject("nombre de line items inattendu")
  const item = lineItems[0]
  if (item.price?.id !== expectedPriceId) reject("Price inattendu")
  if (item.quantity !== 1) reject("quantité inattendue")

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)

  return {
    companyId: refs.companyId,
    allocationId: refs.allocationId,
    checkoutSessionId: session.id,
    paymentIntentId,
    paidAmountCents: LIFETIME_SINGLE_AMOUNT_CENTS,
  }
}

/* ------------------------------- Page de retour --------------------------- */

export type LifetimeReturnState = "active" | "pending" | "failed" | "cancelled" | "unknown"

/** Affichage uniquement : ne déclenche jamais d'activation. */
export function describeLifetimeReturnState(
  allocation: Pick<AllocationSnapshot, "status"> | null,
  cancelled: boolean,
): LifetimeReturnState {
  if (allocation?.status === "ACTIVE") return "active"
  if (cancelled) return "cancelled"
  if (!allocation) return "unknown"
  if (allocation.status === "RESERVED") return "pending"
  return "failed"
}
