/**
 * ESPACE CLIENT (sans compte DetailFlow).
 *
 * INVARIANTS :
 *  - tenant résolu SERVEUR, session = cookie signé (purpose=session) ;
 *  - contrat chargé par (companyId de la session vérifiée + subscriptionId du
 *    token signé) puis capability courante vérifiée → rotation = révocation ;
 *  - aucun identifiant (companyId/subscriptionId/customerId/planId) ni prix,
 *    date ou consentement n'est accepté du navigateur ;
 *  - jamais de rôle admin simulé : on appelle les wrappers *AsCustomer du moteur.
 * Aucune dépendance Next.js : testable avec un Executor/port injectés.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import {
  maintenancePayments,
  maintenanceAuditLog,
  maintenanceCancellationRequests,
  maintenanceSubscriptionVehicles,
  maintenanceSubscriptions,
} from "@/lib/db/schema"
import {
  CUSTOMER_SESSION_TTL_SECONDS,
  CustomerAccessUnavailableError,
  capabilityMatches,
  resolveCustomerAccessSecret,
  signCustomerAccess,
  verifyCustomerAccess,
} from "./customer-access"
import { appendMaintenanceAudit, requestEarlyCancellationAsCustomer, withdrawEarlyCancellationAsCustomer, type CustomerSessionProof, type Executor } from "./engine"
import {
  requestRenewalOptOutAsCustomerAndSync,
  revokeRenewalOptOutAsCustomerAndSync,
  scheduleCancellationAsCustomerAndSync,
  startSubscriptionCheckoutAsCustomer,
  type CustomerSubscriptionStripePort,
  type ProviderSyncOutcome,
  type StartCheckoutResult,
} from "./payments"
import { buildSubscriptionContractSummary, type SubscriptionContractSummary } from "./contract-summary"
import { canCustomerRequestEarlyCancellation, resolveCancellationAt } from "./contract"
import { lastPaymentBefore } from "./email-events"
import { CustomerSubscriptionError } from "./errors"
import { isTerminalStatus } from "./statuses"
import type { ReturnUrlContext } from "./return-url"

type SubscriptionRow = typeof maintenanceSubscriptions.$inferSelect

/** Contexte serveur d'une requête client. companyId = tenant résolu serveur (null = pas de tenant). */
export type CustomerRequestContext = {
  companyId: number | null
  sessionToken: string | null | undefined
  now?: Date
  /** Injecté par les tests ; sinon CUSTOMER_SUBSCRIPTIONS_ACTION_SECRET (fail closed en prod). */
  secret?: string
}

/** Erreur unique et générique : ne révèle jamais la cause (tenant, id, signature, hash…). */
export class CustomerSessionInvalidError extends Error {
  constructor() {
    super("CUSTOMER_SESSION_INVALID")
    this.name = "CustomerSessionInvalidError"
  }
}

function secretOrNull(secret?: string): string | null {
  if (secret) return secret
  try {
    return resolveCustomerAccessSecret()
  } catch (e) {
    if (e instanceof CustomerAccessUnavailableError) return null
    throw e
  }
}

async function loadTenantSubscription(db: Executor, companyId: number, subscriptionId: number): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.companyId, companyId), eq(maintenanceSubscriptions.id, subscriptionId)))
    .limit(1)
  return row ?? null
}

const proofOf = (companyId: number, subscriptionId: number) => ({ companyId, subscriptionId }) as CustomerSessionProof

/* ------------------------------ Échange du lien ------------------------------ */

export type ExchangeResult = { ok: true; sessionToken: string } | { ok: false }

/**
 * Lien email (purpose=manage_link) → token de session (purpose=session).
 * Lecture seule sur le contrat ; seul un audit sans PII est écrit.
 */
export async function exchangeManageLink(
  db: Executor,
  input: { companyId: number | null; linkToken: string | null | undefined; now?: Date; secret?: string },
): Promise<ExchangeResult> {
  const now = input.now ?? new Date()
  const secret = secretOrNull(input.secret)
  if (!secret || input.companyId == null) return { ok: false }
  const v = verifyCustomerAccess(input.linkToken, { companyId: input.companyId, purpose: "manage_link" }, now, secret)
  if (!v.ok) return { ok: false }
  const sub = await loadTenantSubscription(db, input.companyId, v.claims.s)
  if (!sub || !capabilityMatches(v.claims, sub.manageTokenHash)) return { ok: false }
  const sessionToken = signCustomerAccess(
    { companyId: sub.companyId, subscriptionId: sub.id, purpose: "session", manageTokenHash: sub.manageTokenHash!, ttlSeconds: CUSTOMER_SESSION_TTL_SECONDS },
    now,
    secret,
  )
  await appendMaintenanceAudit(db, { companyId: sub.companyId, subscriptionId: sub.id, action: "customer_access_session_created", actorType: "customer", actorUserId: null })
  return { ok: true, sessionToken }
}

/* -------------------------------- Session -------------------------------- */

export type VerifiedCustomerSession = { proof: CustomerSessionProof; subscription: SubscriptionRow }

/** Vérifie la session à CHAQUE lecture/action. null = refus générique. */
export async function resolveCustomerSession(db: Executor, ctx: CustomerRequestContext): Promise<VerifiedCustomerSession | null> {
  const now = ctx.now ?? new Date()
  const secret = secretOrNull(ctx.secret)
  if (!secret || ctx.companyId == null || !ctx.sessionToken) return null
  const v = verifyCustomerAccess(ctx.sessionToken, { companyId: ctx.companyId, purpose: "session" }, now, secret)
  if (!v.ok) return null
  const sub = await loadTenantSubscription(db, ctx.companyId, v.claims.s)
  if (!sub || !capabilityMatches(v.claims, sub.manageTokenHash)) return null
  return { proof: proofOf(sub.companyId, sub.id), subscription: sub }
}

async function requireSession(db: Executor, ctx: CustomerRequestContext): Promise<VerifiedCustomerSession> {
  const s = await resolveCustomerSession(db, ctx)
  if (!s) throw new CustomerSessionInvalidError()
  return s
}

/* --------------------------------- Vue --------------------------------- */

export type CustomerAction =
  | { kind: "checkout"; step: "initial_cleaning" | "subscription" }
  | { kind: "renewal_opt_out"; serviceUntil: Date; lastPaymentAt: Date | null; lastPaymentCents: number | null }
  | { kind: "revoke_renewal_opt_out"; continuesAfter: Date }
  | { kind: "schedule_cancellation"; cancelAt: Date }
  | { kind: "early_cancellation_request" }

export type CustomerPortalView = {
  summary: SubscriptionContractSummary
  vehicle: { label: string; plate: string | null } | null
  status: string
  terminal: boolean
  paymentIssue: boolean
  initialCleaningPaid: boolean
  /** Dernier état connu de la synchronisation Stripe (journal d'audit, sans appel réseau). */
  providerSyncPending: boolean
  pendingEarlyCancellation: { id: number; createdAt: Date } | null
  /** Une seule action principale contextuelle + éventuelle demande de fin anticipée. */
  primaryAction: CustomerAction | null
  secondaryAction: CustomerAction | null
}

const STATUS_LABELS: Record<string, string> = {
  pending_initial_cleaning: "Nettoyage initial à réaliser",
  pending_payment: "En attente de paiement",
  active: "Actif",
  past_due: "Paiement à régulariser",
  suspended: "Suspendu",
  cancel_scheduled: "Arrêt programmé",
  cancelled: "Annulé",
  ended: "Terminé",
  expired: "Expiré",
}

/** Libellé client d'un statut : jamais l'enum brut. */
export function customerStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "En cours de traitement"
}

/** Actions disponibles, calculées serveur depuis les snapshots du contrat uniquement. */
export function computeCustomerActions(
  sub: SubscriptionRow,
  opts: { hasPendingEarlyCancellation: boolean; initialCleaningPaid: boolean },
  now: Date,
): { primary: CustomerAction | null; secondary: CustomerAction | null } {
  if (isTerminalStatus(sub.status)) return { primary: null, secondary: null }
  if (sub.status === "pending_initial_cleaning") return { primary: opts.initialCleaningPaid ? null : { kind: "checkout", step: "initial_cleaning" }, secondary: null }
  if (sub.status === "pending_payment") return { primary: { kind: "checkout", step: "subscription" }, secondary: null }
  if (!sub.billingAnchorAt) return { primary: null, secondary: null }

  const early: CustomerAction | null = !opts.hasPendingEarlyCancellation && canCustomerRequestEarlyCancellation(sub, now) ? { kind: "early_cancellation_request" } : null
  if (sub.paymentMode === "prepaid") return { primary: null, secondary: early }
  if (sub.status === "suspended") return { primary: null, secondary: null }
  // Arrêt déjà programmé : rien d'autre à proposer qu'une éventuelle demande.
  if (sub.cancelAt && sub.cancelAt.getTime() > now.getTime()) return { primary: null, secondary: null }

  const termInProgress =
    sub.commitmentUnitSnapshot !== "none" && !!sub.currentTermEndsAt && sub.currentTermEndsAt.getTime() > now.getTime()

  if (termInProgress) {
    const termEnd = sub.currentTermEndsAt!
    if (sub.renewalOptOutAt) return { primary: { kind: "revoke_renewal_opt_out", continuesAfter: termEnd }, secondary: early }
    if (sub.renewalModeSnapshot === "none") return { primary: null, secondary: early }
    const last = lastPaymentBefore(sub as never, termEnd, now)
    return {
      primary: { kind: "renewal_opt_out", serviceUntil: termEnd, lastPaymentAt: last, lastPaymentCents: last ? sub.priceCentsSnapshot : null },
      secondary: early,
    }
  }

  if (!["active", "past_due"].includes(sub.status)) return { primary: null, secondary: null }
  let cancelAt: Date
  try {
    cancelAt = resolveCancellationAt(sub, now, null)
  } catch {
    return { primary: null, secondary: null }
  }
  return { primary: { kind: "schedule_cancellation", cancelAt }, secondary: null }
}

async function readPendingEarlyCancellation(db: Executor, companyId: number, subscriptionId: number) {
  const [row] = await db
    .select({ id: maintenanceCancellationRequests.id, createdAt: maintenanceCancellationRequests.createdAt })
    .from(maintenanceCancellationRequests)
    .where(
      and(
        eq(maintenanceCancellationRequests.companyId, companyId),
        eq(maintenanceCancellationRequests.subscriptionId, subscriptionId),
        eq(maintenanceCancellationRequests.status, "pending"),
      ),
    )
    .limit(1)
  return row ?? null
}

async function readProviderSyncPending(db: Executor, companyId: number, subscriptionId: number): Promise<boolean> {
  const [last] = await db
    .select({ action: maintenanceAuditLog.action })
    .from(maintenanceAuditLog)
    .where(
      and(
        eq(maintenanceAuditLog.companyId, companyId),
        eq(maintenanceAuditLog.subscriptionId, subscriptionId),
        inArray(maintenanceAuditLog.action, ["provider_sync_failed", "provider_cancellation_applied"]),
      ),
    )
    .orderBy(desc(maintenanceAuditLog.id))
    .limit(1)
  return last?.action === "provider_sync_failed"
}

/** Lecture seule : aucune écriture, quels que soient les paramètres de l'URL. */
export async function loadCustomerPortal(db: Executor, ctx: CustomerRequestContext): Promise<CustomerPortalView | null> {
  const session = await resolveCustomerSession(db, ctx)
  if (!session) return null
  const now = ctx.now ?? new Date()
  const sub = session.subscription
  const [vehicle] = await db
    .select({ brand: maintenanceSubscriptionVehicles.vehicleBrand, model: maintenanceSubscriptionVehicles.vehicleModel, plate: maintenanceSubscriptionVehicles.vehiclePlate })
    .from(maintenanceSubscriptionVehicles)
    .where(
      and(
        eq(maintenanceSubscriptionVehicles.companyId, sub.companyId),
        eq(maintenanceSubscriptionVehicles.subscriptionId, sub.id),
        isNull(maintenanceSubscriptionVehicles.activeUntil),
      ),
    )
    .limit(1)
  const pending = await readPendingEarlyCancellation(db, sub.companyId, sub.id)
  const providerSyncPending = await readProviderSyncPending(db, sub.companyId, sub.id)
  const [initialPayment] = await db.select({ id: maintenancePayments.id }).from(maintenancePayments)
    .where(and(eq(maintenancePayments.companyId, sub.companyId), eq(maintenancePayments.subscriptionId, sub.id), eq(maintenancePayments.type, "initial_cleaning"), eq(maintenancePayments.status, "paid"))).limit(1)
  const initialCleaningPaid = !!initialPayment
  const { primary, secondary } = computeCustomerActions(sub, { hasPendingEarlyCancellation: !!pending, initialCleaningPaid }, now)
  return {
    summary: buildSubscriptionContractSummary(sub, now),
    vehicle: vehicle ? { label: `${vehicle.brand} ${vehicle.model}`.trim(), plate: vehicle.plate } : null,
    status: customerStatusLabel(sub.status),
    terminal: isTerminalStatus(sub.status),
    paymentIssue: sub.status === "past_due",
    initialCleaningPaid,
    providerSyncPending,
    pendingEarlyCancellation: pending,
    primaryAction: primary,
    secondaryAction: secondary,
  }
}

/* -------------------------------- Actions -------------------------------- */

export type CustomerMutationResult = { provider?: ProviderSyncOutcome }

export async function customerRequestRenewalOptOut(db: Executor, port: CustomerSubscriptionStripePort, ctx: CustomerRequestContext) {
  const { proof } = await requireSession(db, ctx)
  return requestRenewalOptOutAsCustomerAndSync(db, port, proof, ctx.now ?? new Date())
}

export async function customerRevokeRenewalOptOut(db: Executor, port: CustomerSubscriptionStripePort, ctx: CustomerRequestContext) {
  const { proof } = await requireSession(db, ctx)
  return revokeRenewalOptOutAsCustomerAndSync(db, port, proof, ctx.now ?? new Date())
}

export async function customerScheduleCancellation(db: Executor, port: CustomerSubscriptionStripePort, ctx: CustomerRequestContext) {
  const { proof } = await requireSession(db, ctx)
  return scheduleCancellationAsCustomerAndSync(db, port, proof, ctx.now ?? new Date())
}

/** Seul `message` vient du navigateur. Aucun appel Stripe, aucun changement du contrat. */
export async function customerRequestEarlyCancellation(db: Executor, ctx: CustomerRequestContext, input: { message?: unknown }) {
  const { proof } = await requireSession(db, ctx)
  return requestEarlyCancellationAsCustomer(db, proof, { message: input.message }, ctx.now ?? new Date())
}

export async function customerWithdrawEarlyCancellation(db: Executor, ctx: CustomerRequestContext) {
  const { proof } = await requireSession(db, ctx)
  return withdrawEarlyCancellationAsCustomer(db, proof, ctx.now ?? new Date())
}

/** Seul `termsAccepted === true` est lu ; tout le reste est rechargé serveur. */
export async function customerStartCheckout(
  db: Executor,
  port: CustomerSubscriptionStripePort,
  ctx: CustomerRequestContext,
  input: { termsAccepted: unknown },
  returnUrlContext?: ReturnUrlContext,
): Promise<StartCheckoutResult & { connectedAccountId: string }> {
  const { proof } = await requireSession(db, ctx)
  if (input.termsAccepted !== true) throw new CustomerSubscriptionError("INVALID_PLAN", [{ field: "termsAccepted", code: "INVALID_PLAN" }])
  const result = await startSubscriptionCheckoutAsCustomer(db, port, proof, { termsAccepted: true }, { returnUrlContext }, ctx.now ?? new Date())
  // Compte connecté relu serveur (identifiant public Stripe, requis par Stripe.js).
  const sub = await loadTenantSubscription(db, proof.companyId, proof.subscriptionId)
  if (!sub?.providerAccountId) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")
  return { ...result, connectedAccountId: sub.providerAccountId }
}

/* ------------------------------ Retour Stripe ------------------------------ */

/**
 * Page de retour Checkout : lecture DB seule (le navigateur n'est jamais une
 * preuve de paiement). Retrouve le contrat par tenant + session Checkout.
 */
export async function readCheckoutReturnState(
  db: Executor,
  companyId: number | null,
  checkoutSessionId: string | null | undefined,
): Promise<"active" | "processing" | "unknown"> {
  if (companyId == null || !checkoutSessionId || checkoutSessionId.length > 255 || !/^cs_[A-Za-z0-9_]+$/.test(checkoutSessionId)) return "unknown"
  const [row] = await db
    .select({ id: maintenanceSubscriptions.id, status: maintenanceSubscriptions.status })
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.companyId, companyId), eq(maintenanceSubscriptions.externalCheckoutSessionId, checkoutSessionId)))
    .limit(1)
  if (!row) return "unknown"
  if (row.status === "active") return "active"
  const [paid] = await db.select({ id: maintenancePayments.id }).from(maintenancePayments)
    .where(and(eq(maintenancePayments.companyId, companyId), eq(maintenancePayments.subscriptionId, row.id), eq(maintenancePayments.status, "paid"))).limit(1)
  return paid ? "processing" : "unknown"
}

/* ------------------------------ Messages FR ------------------------------ */

/** Messages client sans détail technique ni indication de cause interne. */
export function customerErrorMessage(e: unknown): string {
  if (e instanceof CustomerSessionInvalidError) return "Votre session a expiré. Rouvrez le lien reçu par email."
  if (e instanceof CustomerSubscriptionError) {
    switch (e.code) {
      case "ALREADY_CANCELLED":
        return "Cet abonnement est déjà terminé."
      case "CHECKOUT_ALREADY_COMPLETED":
        return "Ce paiement a déjà été effectué. Activation en cours."
      case "STRIPE_NOT_CONNECTED":
        return "Le paiement en ligne n'est pas disponible pour le moment. Contactez le professionnel."
      case "INVALID_PLAN":
        return "Veuillez accepter les conditions de la formule pour continuer."
      case "PROVIDER_ERROR":
        return "Le service de paiement est momentanément indisponible. Réessayez dans quelques instants."
      default:
        return "Cette action n'est pas disponible pour votre abonnement."
    }
  }
  return "Une erreur est survenue. Réessayez dans quelques instants."
}
