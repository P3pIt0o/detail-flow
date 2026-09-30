/**
 * DetailFlow — Règles PURES des abonnements Stripe BILLING (mensuels).
 *
 * Aucun I/O : éligibilité, validation du Price, paramètres Checkout, mapping
 * Subscription Stripe → état licence, décisions de synchronisation, palier et
 * décision de remise fidélité sur facture, états UX du retour Checkout.
 *
 * Stripe BILLING uniquement : aucune référence à Stripe Connect (lib/payments).
 * Règle générale : FAIL-CLOSED — toute ambiguïté lève une SubscriptionError.
 */

import type Stripe from "stripe"
import type { LicensePlan } from "@/lib/licensing/types"
import { getLoyaltyDiscountBps } from "./commercial-rules"
import { BILLING_PLANS, BillingConfigError, resolvePlanForStripePriceId } from "./config"
import { StripeSetupError, assertPriceMatchesConfig, selectProductForPlan } from "./stripe-setup"
import { ACTIVE_SUBSCRIPTION_STATUSES, isSubscriptionStatus, type BillingMode, type SubscriptionStatus } from "./types"

type EnvLike = Record<string, string | undefined>

/* ---------------------------------- Plans --------------------------------- */

export type SubscriptionPlan = Extract<LicensePlan, "PRO" | "BUSINESS" | "ENTERPRISE">

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = ["PRO", "BUSINESS", "ENTERPRISE"] as const

/**
 * Formules réellement achetables depuis l'outil de test Preview. ÉQUIPE
 * (ENTERPRISE) est supportée par le backend mais PAS encore commercialisable :
 * multi-employés / agendas / permissions pas encore livrés.
 */
export const PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = ["PRO", "BUSINESS"] as const

/** Premier mois offert : trial Stripe réel, moyen de paiement collecté. */
export const SUBSCRIPTION_TRIAL_DAYS = 30

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return value === "PRO" || value === "BUSINESS" || value === "ENTERPRISE"
}

export function isPreviewPurchasableSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return isSubscriptionPlan(value) && PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS.includes(value)
}

/* --------------------------------- Erreurs -------------------------------- */

export type SubscriptionErrorCode =
  | "COMPANY_ID_INVALID"
  | "NOT_OWNER"
  | "PLAN_NOT_SUBSCRIBABLE"
  | "TENANT_NOT_FOUND"
  | "LIFETIME_TENANT"
  | "FOUNDER_TENANT"
  | "ALREADY_SUBSCRIBED"
  | "CONFIG"
  | "PRICE_INVALID"
  | "NO_CUSTOMER"
  | "CUSTOMER_MISMATCH"
  | "INCOHERENT"
  | "UNKNOWN_PRICE"
  | "APPLY_CONFLICT"
  | "COUPON_MISSING"
  | "COUPON_INVALID"
  | "UNKNOWN_DISCOUNT"
  | "INVOICE_NOT_DRAFT"
  | "DISCOUNT_NOT_VISIBLE"
  | "HOLD_NOT_RELEASED"
  | "CHECKOUT_URL_MISSING"

/**
 * `retryable` pilote la réponse du webhook : true => HTTP 500 (Stripe
 * réessaie ; pour invoice.created, Stripe retarde aussi la finalisation de la
 * facture tant que le webhook échoue), false => 200 + journalisation.
 */
export class SubscriptionError extends Error {
  constructor(
    public readonly code: SubscriptionErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = "SubscriptionError"
  }
}

/* ---------------------------- État tenant (DB) ---------------------------- */

export interface CompanyBillingState {
  id: number
  billingMode: string
  licensePlan: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  subscriptionPriceId: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  continuousSubscriptionStartedAt: Date | null
  subscriptionCanceledAt: Date | null
}

/** Patch appliqué aux colonnes Billing du tenant (jamais aux colonnes Connect). */
export interface SubscriptionStatePatch {
  terminal: boolean
  billingMode: BillingMode
  licensePlan: LicensePlan
  stripeSubscriptionId: string | null
  subscriptionStatus: SubscriptionStatus
  subscriptionPriceId: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Renseigné uniquement pour un état terminal (fin effective). */
  endedAt: Date | null
}

/** Persistance injectable (implémentation PostgreSQL : subscription-server.ts). */
export interface SubscriptionStore {
  getCompany(companyId: number): Promise<CompanyBillingState | null>
  findCompanyBySubscriptionId(subscriptionId: string): Promise<CompanyBillingState | null>
  hasLifetimeLicense(companyId: number): Promise<boolean>
  /** Écrit le Customer si aucun n'est encore stocké ; renvoie l'ID finalement stocké. */
  setStripeCustomerIdIfNull(companyId: number, customerId: string): Promise<string | null>
  /** Applique le patch sous verrou ; false si le garde (lien abonnement/Lifetime) échoue. */
  applySubscriptionState(companyId: number, subscriptionId: string, patch: SubscriptionStatePatch): Promise<boolean>
  /** Démarre l'ancienneté si NULL et si l'abonnement est bien celui du tenant. */
  startContinuousSubscriptionIfNull(companyId: number, subscriptionId: string, paidAt: Date): Promise<boolean>
  isEventProcessed(eventId: string): Promise<boolean>
  markEventProcessed(eventId: string, eventType: string): Promise<void>
}

/* ------------------------------- Éligibilité ------------------------------ */

export function assertValidSubscriptionCompanyId(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SubscriptionError("COMPANY_ID_INVALID", "Entreprise invalide.")
  }
}

export function assertSubscriptionOwner(role: string): void {
  if (role !== "OWNER") {
    throw new SubscriptionError("NOT_OWNER", "Seul le propriétaire de l'entreprise peut gérer l'abonnement.")
  }
}

/** Refuse tout second abonnement, toute licence Lifetime et le plan FOUNDER. */
export function assertCompanyEligibleForSubscription(
  company: CompanyBillingState,
  options: { hasLifetimeLicense: boolean },
): void {
  if (company.billingMode === "lifetime" || options.hasLifetimeLicense) {
    throw new SubscriptionError("LIFETIME_TENANT", "Votre entreprise dispose déjà d'une licence Lifetime.")
  }
  if (company.licensePlan === "FOUNDER") {
    throw new SubscriptionError("FOUNDER_TENANT", "Le plan Fondateur n'est pas compatible avec un abonnement.")
  }
  const status = company.subscriptionStatus
  const hasOpenStatus =
    status !== null && (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  if (company.stripeSubscriptionId || hasOpenStatus) {
    throw new SubscriptionError(
      "ALREADY_SUBSCRIBED",
      "Un abonnement DetailFlow existe déjà pour votre entreprise. Gérez-le depuis l'espace de facturation.",
    )
  }
}

/* ------------------------------ Price Stripe ------------------------------ */

/**
 * Réutilise les validateurs du setup Stripe (stripe-setup.ts) : Product actif
 * aux métadonnées DetailFlow du plan + Price conforme (actif, EUR, mensuel,
 * montant, lookup_key, métadonnées). Le Price doit être récupéré avec
 * `expand: ["product"]`.
 */
export function validateSubscriptionPrice(price: Stripe.Price, plan: SubscriptionPlan, expectedPriceId: string): void {
  try {
    if (price.id !== expectedPriceId) throw new StripeSetupError("Price ID inattendu.")
    if (price.type !== "recurring" || price.recurring?.interval_count !== 1) {
      throw new StripeSetupError("Le Price doit être récurrent tous les 1 mois.")
    }
    const product = price.product
    if (!product || typeof product === "string" || ("deleted" in product && product.deleted)) {
      throw new StripeSetupError("Product Stripe non chargé ou supprimé.")
    }
    const selected = selectProductForPlan([product as Stripe.Product], plan)
    if (!selected) throw new StripeSetupError("Product Stripe inactif ou métadonnées DetailFlow incohérentes.")
    assertPriceMatchesConfig(price, plan, selected.id)
  } catch (error) {
    if (error instanceof StripeSetupError) {
      throw new SubscriptionError("PRICE_INVALID", `Price Stripe refusé pour ${plan} : ${error.message}`)
    }
    throw error
  }
}

/* ------------------------- Métadonnées / Checkout ------------------------- */

export function buildSubscriptionMetadata(companyId: number, plan: SubscriptionPlan): Record<string, string> {
  return {
    app: "detailflow",
    billing_type: "subscription",
    company_id: String(companyId),
    license_plan: plan,
  }
}

export interface SubscriptionCheckoutParamsInput {
  companyId: number
  plan: SubscriptionPlan
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
}

export function buildSubscriptionCheckoutParams(input: SubscriptionCheckoutParamsInput): Stripe.Checkout.SessionCreateParams {
  const metadata = buildSubscriptionMetadata(input.companyId, input.plan)
  return {
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: String(input.companyId),
    line_items: [{ price: input.priceId, quantity: 1 }],
    // Essai sans carte : Stripe ne demande un moyen de paiement que si un montant
    // est dû immédiatement (jamais le cas pendant le trial).
    payment_method_collection: "if_required",
    allow_promotion_codes: false,
    locale: "fr",
    metadata,
    subscription_data: {
      trial_period_days: SUBSCRIPTION_TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
      metadata,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }
}

export interface DetailflowSubscriptionRefs {
  companyId: number
  plan: SubscriptionPlan
}

export function parseDetailflowSubscriptionRefs(
  metadata: Stripe.Metadata | null | undefined,
): DetailflowSubscriptionRefs | null {
  if (metadata?.app !== "detailflow" || metadata?.billing_type !== "subscription") return null
  const raw = metadata.company_id ?? ""
  if (!/^[1-9]\d*$/.test(raw)) return null
  const companyId = Number(raw)
  if (!Number.isSafeInteger(companyId)) return null
  const plan = metadata.license_plan
  if (!isSubscriptionPlan(plan)) return null
  return { companyId, plan }
}

export function isSubscriptionCheckoutSession(session: Pick<Stripe.Checkout.Session, "mode" | "metadata">): boolean {
  return session.mode === "subscription" && parseDetailflowSubscriptionRefs(session.metadata) !== null
}

/* --------------------- Subscription Stripe → licence ---------------------- */

const TERMINAL_STATUSES: readonly string[] = ["canceled", "incomplete_expired"]
/** Accès premium : essai, actif, et past_due (grâce pendant les Smart Retries). */
const PREMIUM_STATUSES: readonly string[] = ["trialing", "active", "past_due"]

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function stripeRefId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === "string" ? ref : ref.id
}

function unixToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value * 1000) : null
}

function singleItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem {
  const items = subscription.items?.data ?? []
  if (items.length !== 1) {
    throw new SubscriptionError("INCOHERENT", `Abonnement ${subscription.id} : ${items.length} lignes (1 attendue).`)
  }
  return items[0]
}

/**
 * Mapping unique statut Stripe → colonnes licence/billing :
 * - trialing / active / past_due : droits du plan du Price ;
 * - unpaid / paused / incomplete : droits premium retirés (FREE), lien et
 *   ancienneté CONSERVÉS (récupération / diagnostic) ;
 * - canceled / incomplete_expired : fin effective => FREE + remise à zéro.
 * Upgrade/downgrade = simple changement de Price : ancienneté jamais touchée.
 */
export function buildSubscriptionStatePatch(
  subscription: Stripe.Subscription,
  env: EnvLike,
  now: Date = new Date(),
): SubscriptionStatePatch {
  const status = subscription.status
  if (!isSubscriptionStatus(status)) {
    throw new SubscriptionError("INCOHERENT", `Statut d'abonnement inconnu : ${String(status)}.`)
  }

  if (isTerminalSubscriptionStatus(status)) {
    return {
      terminal: true,
      billingMode: "free",
      licensePlan: "FREE",
      stripeSubscriptionId: null,
      subscriptionStatus: status,
      subscriptionPriceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      endedAt: unixToDate(subscription.ended_at) ?? unixToDate(subscription.canceled_at) ?? now,
    }
  }

  const item = singleItem(subscription)
  const priceId = item.price?.id ?? ""
  let plan: LicensePlan
  try {
    plan = resolvePlanForStripePriceId(priceId, env)
  } catch (error) {
    if (error instanceof BillingConfigError) {
      throw new SubscriptionError("UNKNOWN_PRICE", `Price ${priceId || "absent"} inconnu pour ${subscription.id}.`)
    }
    throw error
  }
  if (!isSubscriptionPlan(plan)) {
    throw new SubscriptionError("UNKNOWN_PRICE", `Price ${priceId} ne correspond à aucune formule payante.`)
  }

  return {
    terminal: false,
    billingMode: "subscription",
    licensePlan: PREMIUM_STATUSES.includes(status) ? plan : "FREE",
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionPriceId: priceId,
    currentPeriodEnd: unixToDate(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    endedAt: null,
  }
}

export type SubscriptionSyncDecision =
  | { kind: "apply" }
  | { kind: "ignore"; reason: "stale_subscription" | "already_ended" }
  | { kind: "cancel_duplicate" }
  | { kind: "reject"; code: SubscriptionErrorCode; message: string }

/**
 * Décide quoi faire d'un abonnement Stripe (état FRAIS relu chez Stripe)
 * vis-à-vis du tenant. Protège contre : écrasement d'une licence Lifetime,
 * Customer étranger, événement tardif d'un ancien abonnement, doublon.
 */
export function decideSubscriptionSync(
  company: CompanyBillingState,
  subscription: Pick<Stripe.Subscription, "id" | "status" | "customer">,
): SubscriptionSyncDecision {
  if (company.billingMode === "lifetime") {
    return { kind: "reject", code: "LIFETIME_TENANT", message: `Tenant ${company.id} Lifetime : abonnement ${subscription.id} non appliqué.` }
  }
  const customerId = stripeRefId(subscription.customer as string | { id: string } | null)
  if (!company.stripeCustomerId || customerId !== company.stripeCustomerId) {
    return { kind: "reject", code: "CUSTOMER_MISMATCH", message: `Customer de ${subscription.id} ≠ Customer du tenant ${company.id}.` }
  }
  const terminal = isTerminalSubscriptionStatus(subscription.status)
  const linked = company.stripeSubscriptionId
  if (linked && linked !== subscription.id) {
    return terminal ? { kind: "ignore", reason: "stale_subscription" } : { kind: "cancel_duplicate" }
  }
  if (!linked && terminal) return { kind: "ignore", reason: "already_ended" }
  return { kind: "apply" }
}

/* ------------------------------ Factures ---------------------------------- */

export function getInvoiceSubscriptionId(invoice: Pick<Stripe.Invoice, "parent">): string | null {
  const ref = invoice.parent?.subscription_details?.subscription
  return stripeRefId(ref as string | { id: string } | null | undefined)
}

export function getInvoiceSubscriptionMetadata(invoice: Pick<Stripe.Invoice, "parent">): Stripe.Metadata | null {
  return invoice.parent?.subscription_details?.metadata ?? null
}

/** Date de paiement réelle : `status_transitions.paid_at`, sinon date de l'événement. */
export function resolveInvoicePaidAt(
  invoice: Pick<Stripe.Invoice, "status_transitions">,
  eventCreatedUnix: number,
): Date {
  return unixToDate(invoice.status_transitions?.paid_at) ?? new Date(eventCreatedUnix * 1000)
}

/**
 * Tolérance ajoutée à la date de référence du palier : Stripe finalise et
 * encaisse une facture d'abonnement ~1 h après le début de période, donc
 * l'ancienneté (démarrée à `paid_at`) serait sinon comptée un mois trop tard
 * à chaque palier. 24 h absorbent ce décalage normal, jamais un mois entier.
 */
export const LOYALTY_REFERENCE_GRACE_MS = 24 * 60 * 60 * 1000

/**
 * Date métier de la facture : début de la période FACTURÉE (lignes
 * d'abonnement). `invoice.period_start` n'est volontairement pas utilisé :
 * pour une facture d'abonnement, Stripe y met la période PRÉCÉDENTE (usage) ;
 * `period_end` en est le repli (= début de la nouvelle période).
 */
export function resolveInvoiceLoyaltyReferenceDate(
  invoice: Pick<Stripe.Invoice, "lines" | "period_end">,
): Date {
  const starts = (invoice.lines?.data ?? [])
    .map((line) => line.period?.start)
    .filter((value): value is number => typeof value === "number" && value > 0)
  const unix = starts.length > 0 ? Math.max(...starts) : invoice.period_end
  return new Date(unix * 1000 + LOYALTY_REFERENCE_GRACE_MS)
}

export function getInvoiceLoyaltyDiscountBps(
  startedAt: Date | null,
  invoice: Pick<Stripe.Invoice, "lines" | "period_end">,
): number {
  if (!startedAt) return 0
  return getLoyaltyDiscountBps(startedAt, resolveInvoiceLoyaltyReferenceDate(invoice))
}

/**
 * Coupons des remises présentes sur une facture (discounts expansés).
 * `null` = remise non identifiable (non expansée ou sans coupon) => inconnue.
 */
export function extractInvoiceDiscountCouponIds(invoice: Pick<Stripe.Invoice, "discounts">): Array<string | null> {
  const result: Array<string | null> = []
  for (const discount of invoice.discounts ?? []) {
    if (typeof discount === "string") {
      result.push(null)
      continue
    }
    if ("deleted" in discount && discount.deleted) continue
    const coupon = (discount as Stripe.Discount).source?.coupon
    result.push(stripeRefId(coupon as string | { id: string } | null | undefined))
  }
  return result
}

export type InvoiceLoyaltyDecision =
  | { kind: "none" }
  | { kind: "already_applied" }
  | { kind: "apply"; couponId: string }
  | { kind: "fail"; code: SubscriptionErrorCode; message: string; retryable: boolean }

/**
 * Décision de remise fidélité (fail-closed) :
 * - aucun palier => rien ;
 * - remise inconnue présente => refus (jamais écrasée) ;
 * - coupon attendu déjà seul présent => idempotent ;
 * - facture non DRAFT => refus (impossible de remiser) ;
 * - sinon => appliquer (remplace un éventuel autre coupon fidélité DetailFlow).
 */
export function decideInvoiceLoyaltyDiscount(input: {
  invoiceStatus: string | null
  existingCouponIds: ReadonlyArray<string | null>
  targetCouponId: string | null
  knownLoyaltyCouponIds: ReadonlySet<string>
}): InvoiceLoyaltyDecision {
  const { invoiceStatus, existingCouponIds, targetCouponId, knownLoyaltyCouponIds } = input
  if (!targetCouponId) return { kind: "none" }

  const unknown = existingCouponIds.filter((id) => id === null || !knownLoyaltyCouponIds.has(id))
  if (unknown.length > 0) {
    return {
      kind: "fail",
      code: "UNKNOWN_DISCOUNT",
      message: "La facture porte une remise non identifiée : remise fidélité non appliquée.",
      retryable: true,
    }
  }
  if (existingCouponIds.length === 1 && existingCouponIds[0] === targetCouponId) return { kind: "already_applied" }
  if (invoiceStatus !== "draft") {
    return {
      kind: "fail",
      code: "INVOICE_NOT_DRAFT",
      message: `Facture au statut « ${invoiceStatus ?? "inconnu"} » : remise fidélité due mais non applicable.`,
      retryable: false,
    }
  }
  return { kind: "apply", couponId: targetCouponId }
}

/* --------------------------- Retour Checkout (UX) ------------------------- */

export type SubscriptionReturnState = "trial_active" | "active" | "payment_issue" | "canceled" | "pending"

/** Lit UNIQUEMENT l'état en base synchronisé par webhook (jamais l'URL). */
export function describeSubscriptionReturnState(
  company: Pick<CompanyBillingState, "stripeSubscriptionId" | "subscriptionStatus">,
): { state: SubscriptionReturnState; title: string } {
  const status = company.subscriptionStatus
  if (company.stripeSubscriptionId) {
    if (status === "trialing") return { state: "trial_active", title: "Votre mois offert est activé" }
    if (status === "active") return { state: "active", title: "Abonnement actif" }
    if (status === "past_due" || status === "unpaid" || status === "paused") {
      return { state: "payment_issue", title: "Paiement à régulariser" }
    }
    return { state: "pending", title: "Confirmation en cours" }
  }
  if (status === "canceled" || status === "incomplete_expired") return { state: "canceled", title: "Abonnement résilié" }
  return { state: "pending", title: "Confirmation en cours" }
}

/** Libellé commercial + prix (source unique : BILLING_PLANS / lib/pricing). */
export function describeSubscriptionPlan(plan: SubscriptionPlan): { name: string; monthlyPriceCents: number } {
  const config = BILLING_PLANS[plan]
  return { name: config.commercialName, monthlyPriceCents: config.monthlyPriceCents }
}
