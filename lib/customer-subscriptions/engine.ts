/**
 * MOTEUR TRANSACTIONNEL des abonnements clients. Chaque fonction reçoit un
 * exécuteur Drizzle (db applicatif ou PGlite en test) et un `companyId` déjà
 * résolu côté SERVEUR (voir service.ts : requireCompanyMember). Aucune
 * fonction n'accepte un companyId, un prix, une commission ou une limite
 * provenant du navigateur. Aucun appel Stripe dans ce lot.
 *
 * Isolation : toute lecture filtre `companyId = tenant` ; un ID d'un autre
 * tenant répond NOT_FOUND (existence jamais révélée).
 */
import "server-only"
import { and, count, eq, inArray, isNull, lt, ne } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import {
  clients,
  companies,
  companyFeatureOverrides,
  maintenanceAuditLog,
  maintenanceCycles,
  maintenancePayments,
  maintenancePlans,
  maintenanceSubscriptions,
  maintenanceSubscriptionVehicles,
  maintenanceUses,
  services,
} from "@/lib/db/schema"
import type { LicenseContext, ResolvedOverride } from "@/lib/licensing/resolver"
import type { FeatureKey } from "@/lib/licensing/types"
import { CustomerSubscriptionError } from "./errors"
import {
  billingBoundary,
  computeActualTermEnd,
  type BillingInterval,
  type Commitment,
} from "./dates"
import {
  buildContractSnapshot,
  canOptOutOfRenewal,
  evaluateCapacity,
  initialStatusFor,
  resolveCancellationAt,
  resolvePlatformFeeBps,
  type CapacityView,
} from "./contract"
import { assertValidPlanConfig, type PlanConfigInput, type ValidatedPlanConfig } from "./plan-validation"
import { CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES, isTerminalStatus } from "./statuses"
import { normalizeVehicle, type VehicleInput } from "./vehicle"
import { generateManageToken } from "./manage-token"
import { deriveIdempotencyKey } from "./idempotency"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepte node-postgres (app) et PGlite (tests)
export type Executor = PgDatabase<PgQueryResultHKT, any, any>

export type Actor = { userId: string; role: "OWNER" | "ADMIN" | "EMPLOYEE"; isSuperAdmin?: boolean }

const MUTATING_ROLES = new Set(["OWNER", "ADMIN"])

export function assertCanMutate(actor: Actor): void {
  if (!actor.isSuperAdmin && !MUTATING_ROLES.has(actor.role)) throw new CustomerSubscriptionError("FORBIDDEN")
}

/* --------------------------------- Audit --------------------------------- */

export const MAINTENANCE_AUDIT_ACTIONS = [
  "plan_created",
  "plan_updated",
  "plan_archived",
  "subscription_created",
  "subscription_activated",
  "initial_cleaning_completed",
  "vehicle_changed",
  "cycle_created",
  "renewal_opt_out_requested",
  "renewal_opt_out_revoked",
  "cancel_requested",
  "cancel_scheduled",
  "subscription_cancelled",
  "subscription_force_ended",
  "subscription_suspended",
  "subscription_resumed",
  "manage_token_rotated",
  "checkout_started",
  "payment_pending",
  "payment_succeeded",
  "payment_failed",
  "subscription_past_due",
  "subscription_recovered",
  "subscription_expired",
  "subscription_ended_by_provider",
  "provider_ids_linked",
  "provider_subscription_updated",
  "provider_cancellation_applied",
  "provider_account_mismatch",
  "platform_fee_synced",
] as const
export type MaintenanceAuditAction = (typeof MAINTENANCE_AUDIT_ACTIONS)[number]

const SENSITIVE_META_KEY = /token|secret|password|card|iban|email|phone|cvc|pan/i

/** Retire toute clé sensible (token, email, téléphone, carte…) avant écriture. */
export function sanitizeAuditMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_META_KEY.test(key)) continue
    if (value === undefined) continue
    out[key] = value instanceof Date ? value.toISOString() : value
  }
  return out
}

/** Journal append-only : INSERT uniquement, aucune fonction d'UPDATE/DELETE. */
export async function appendMaintenanceAudit(
  tx: Executor,
  entry: {
    companyId: number
    subscriptionId?: number | null
    action: MaintenanceAuditAction
    actorType: "user" | "customer" | "system" | "provider"
    actorUserId?: string | null
    meta?: Record<string, unknown>
  },
): Promise<void> {
  await tx.insert(maintenanceAuditLog).values({
    companyId: entry.companyId,
    subscriptionId: entry.subscriptionId ?? null,
    action: entry.action,
    actorType: entry.actorType,
    actorUserId: entry.actorUserId ?? null,
    meta: sanitizeAuditMeta(entry.meta ?? {}),
  })
}

/* ------------------------- Licence / capacité ---------------------------- */

type LockedCompany = {
  id: number
  licensePlan: string | null
  stripeAccountId: string | null
  stripeChargesEnabled: boolean
  paymentsEnabled: boolean
}

async function readCompany(tx: Executor, companyId: number, lock: boolean): Promise<LockedCompany> {
  const query = tx
    .select({
      id: companies.id,
      licensePlan: companies.licensePlan,
      stripeAccountId: companies.stripeAccountId,
      stripeChargesEnabled: companies.stripeChargesEnabled,
      paymentsEnabled: companies.paymentsEnabled,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
  const [row] = lock ? await query.for("update") : await query
  if (!row) throw new CustomerSubscriptionError("FORBIDDEN")
  return row
}

async function readLicenseContext(tx: Executor, company: LockedCompany): Promise<LicenseContext> {
  const rows = await tx
    .select({
      featureKey: companyFeatureOverrides.featureKey,
      state: companyFeatureOverrides.state,
      source: companyFeatureOverrides.source,
      expiresAt: companyFeatureOverrides.expiresAt,
    })
    .from(companyFeatureOverrides)
    .where(eq(companyFeatureOverrides.companyId, company.id))
  const overrides = rows
    .filter((r) => r.state === "ENABLED" || r.state === "DISABLED")
    .map((r) => ({ ...r, featureKey: r.featureKey as FeatureKey }) as ResolvedOverride)
  return { plan: company.licensePlan as LicenseContext["plan"], generation: null, overrides }
}

async function countCapacityConsumers(tx: Executor, companyId: number): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(maintenanceSubscriptions)
    .where(
      and(
        eq(maintenanceSubscriptions.companyId, companyId),
        inArray(maintenanceSubscriptions.status, [...CUSTOMER_SUBSCRIPTION_CAPACITY_STATUSES]),
      ),
    )
  return Number(row?.n ?? 0)
}

/** Vue capacité pour l'UI (activeCount, maxActive, remaining, overLimit, creationAllowed, reason). */
export async function getCustomerSubscriptionCapacity(tx: Executor, companyId: number): Promise<CapacityView> {
  const company = await readCompany(tx, companyId, false)
  return evaluateCapacity(await readLicenseContext(tx, company), await countCapacityConsumers(tx, companyId))
}

/**
 * Commission du plan DetailFlow EFFECTIF à l'instant du paiement. Ne modifie
 * jamais un paiement existant (platformFeeBps / platformFeeAmountCents figés).
 */
export async function resolveCurrentCustomerSubscriptionFee(
  tx: Executor,
  companyId: number,
): Promise<{ platformFeeBps: number }> {
  const company = await readCompany(tx, companyId, false)
  return { platformFeeBps: resolvePlatformFeeBps(company.licensePlan) }
}

/**
 * Paiement opérationnel pour une NOUVELLE souscription. Volontairement
 * indépendant de la feature `online_payments`. paymentsEnabled = false bloque
 * le neuf, jamais les contrats existants.
 */
export function assertNewPaymentsReady(company: LockedCompany): { providerAccountId: string } {
  if (!company.stripeAccountId || !company.stripeChargesEnabled) throw new CustomerSubscriptionError("STRIPE_NOT_CONNECTED")
  if (!company.paymentsEnabled) throw new CustomerSubscriptionError("PAYMENTS_DISABLED")
  return { providerAccountId: company.stripeAccountId }
}

/* -------------------------------- Formules ------------------------------- */

async function loadTenantService(tx: Executor, companyId: number, serviceId: number) {
  const [row] = await tx
    .select({ id: services.id, name: services.name, priceCents: services.basePriceCents })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, companyId)))
  if (!row) throw new CustomerSubscriptionError("SERVICE_NOT_FOUND")
  return row
}

async function assertPlanServices(tx: Executor, companyId: number, plan: ValidatedPlanConfig): Promise<void> {
  if (plan.includedServiceId != null) await loadTenantService(tx, companyId, plan.includedServiceId)
  if (plan.initialServiceId != null) await loadTenantService(tx, companyId, plan.initialServiceId)
}

export type PlanMutationResult = { planId: number; appliesTo: "new_subscriptions_only" }

/**
 * Brouillon possible sans Stripe ; PUBLICATION (status active) refusée tant que
 * le paiement n'est pas opérationnel.
 */
export async function createPlan(db: Executor, companyId: number, actor: Actor, input: PlanConfigInput): Promise<PlanMutationResult> {
  assertCanMutate(actor)
  const plan = assertValidPlanConfig(input)
  return db.transaction(async (tx) => {
    const company = await readCompany(tx, companyId, false)
    if (plan.status === "active") assertNewPaymentsReady(company)
    await assertPlanServices(tx, companyId, plan)
    const [row] = await tx
      .insert(maintenancePlans)
      .values({ ...plan, companyId, archivedAt: plan.status === "archived" ? new Date() : null })
      .returning({ id: maintenancePlans.id })
    await appendMaintenanceAudit(tx, { companyId, action: "plan_created", actorType: "user", actorUserId: actor.userId, meta: { planId: row.id, status: plan.status } })
    return { planId: row.id, appliesTo: "new_subscriptions_only" as const }
  })
}

/** Modifier une formule ne concerne QUE les futurs abonnements (snapshots intacts). */
export async function updatePlan(db: Executor, companyId: number, actor: Actor, planId: number, input: PlanConfigInput): Promise<PlanMutationResult> {
  assertCanMutate(actor)
  const plan = assertValidPlanConfig(input)
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: maintenancePlans.id, status: maintenancePlans.status })
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, planId), eq(maintenancePlans.companyId, companyId)))
      .for("update")
    if (!existing) throw new CustomerSubscriptionError("INVALID_PLAN")
    if (existing.status === "archived") throw new CustomerSubscriptionError("PLAN_NOT_ACTIVE")
    if (plan.status === "active") assertNewPaymentsReady(await readCompany(tx, companyId, false))
    await assertPlanServices(tx, companyId, plan)
    await tx
      .update(maintenancePlans)
      .set({ ...plan, updatedAt: new Date(), archivedAt: plan.status === "archived" ? new Date() : null })
      .where(and(eq(maintenancePlans.id, planId), eq(maintenancePlans.companyId, companyId)))
    await appendMaintenanceAudit(tx, {
      companyId,
      action: plan.status === "archived" ? "plan_archived" : "plan_updated",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { planId, status: plan.status },
    })
    return { planId, appliesTo: "new_subscriptions_only" as const }
  })
}

export async function archivePlan(db: Executor, companyId: number, actor: Actor, planId: number): Promise<PlanMutationResult> {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(maintenancePlans)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(maintenancePlans.id, planId), eq(maintenancePlans.companyId, companyId), ne(maintenancePlans.status, "archived")))
      .returning({ id: maintenancePlans.id })
    if (!updated.length) throw new CustomerSubscriptionError("INVALID_PLAN")
    await appendMaintenanceAudit(tx, { companyId, action: "plan_archived", actorType: "user", actorUserId: actor.userId, meta: { planId } })
    return { planId, appliesTo: "new_subscriptions_only" as const }
  })
}

/* --------------------------- Création contrat ---------------------------- */

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function normalizeCustomer(input: { name: unknown; email: unknown; phone?: unknown }) {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : ""
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  const phone = typeof input.phone === "string" ? input.phone.replace(/[^\d+]/g, "") : ""
  const issues = []
  if (!name || name.length > 120) issues.push({ field: "customer.name", code: "INVALID_CUSTOMER" as const })
  if (!EMAIL_PATTERN.test(email) || email.length > 254) issues.push({ field: "customer.email", code: "INVALID_CUSTOMER" as const })
  if (phone.length > 20) issues.push({ field: "customer.phone", code: "INVALID_CUSTOMER" as const })
  if (issues.length) throw new CustomerSubscriptionError("INVALID_CUSTOMER", issues)
  return { customerName: name, customerEmail: email, customerPhone: phone || null }
}

export type CreateSubscriptionInput = {
  planId: number
  customerId?: number | null
  customer: { name: unknown; email: unknown; phone?: unknown }
  vehicle: VehicleInput
  paymentMode: unknown
  /** Clé client (16–128 car.) ; dérivée côté serveur avec tenant + opération + formule. */
  idempotencyKey: string
  termsAcceptedAt?: Date | null
  termsVersion?: string | null
}

export type CreateSubscriptionResult = {
  subscriptionId: number
  status: "pending_initial_cleaning" | "pending_payment"
  /**
   * Token brut (futur email) — rendu UNE fois ; null lors d'un rejeu idempotent
   * (le brut n'est jamais stocké). Réponse perdue → rotateManageToken().
   */
  manageToken: string | null
  replayed: boolean
}

/**
 * Création ATOMIQUE contrat + véhicule :
 *  1. verrou FOR UPDATE sur companies (sérialise les créations du tenant) ;
 *  2. relecture de la licence effective ; 3. comptage des places consommées ;
 *  4. contrôle de capacité ; 5. insert contrat ; 6. insert véhicule ; 7. commit.
 */
export async function createSubscription(
  db: Executor,
  companyId: number,
  actor: Actor,
  input: CreateSubscriptionInput,
  now: Date = new Date(),
): Promise<CreateSubscriptionResult> {
  assertCanMutate(actor)
  if (!Number.isInteger(input.planId) || input.planId <= 0) throw new CustomerSubscriptionError("INVALID_PLAN")
  const idempotencyKey = deriveIdempotencyKey({ companyId, operation: "subscription.create", subjectId: input.planId, clientKey: input.idempotencyKey })
  const customer = normalizeCustomer(input.customer)
  const vehicle = normalizeVehicle(input.vehicle)
  const termsVersion = typeof input.termsVersion === "string" && input.termsVersion.trim() ? input.termsVersion.trim().slice(0, 64) : null
  if (input.termsAcceptedAt && !termsVersion) throw new CustomerSubscriptionError("INVALID_PLAN", [{ field: "termsVersion", code: "INVALID_PLAN" }])

  return db.transaction(async (tx) => {
    const company = await readCompany(tx, companyId, true)

    const [replay] = await tx
      .select({ id: maintenanceSubscriptions.id, status: maintenanceSubscriptions.status })
      .from(maintenanceSubscriptions)
      .where(and(eq(maintenanceSubscriptions.companyId, companyId), eq(maintenanceSubscriptions.creationIdempotencyKey, idempotencyKey)))
    if (replay) {
      return { subscriptionId: replay.id, status: replay.status as CreateSubscriptionResult["status"], manageToken: null, replayed: true }
    }

    const license = await readLicenseContext(tx, company)
    const capacity = evaluateCapacity(license, await countCapacityConsumers(tx, companyId), now)
    if (capacity.reason === "FEATURE_DISABLED") throw new CustomerSubscriptionError("FEATURE_DISABLED")
    const { providerAccountId } = assertNewPaymentsReady(company)

    const [planRow] = await tx
      .select()
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, input.planId), eq(maintenancePlans.companyId, companyId)))
    if (!planRow) throw new CustomerSubscriptionError("INVALID_PLAN")
    if (planRow.status !== "active") throw new CustomerSubscriptionError("PLAN_NOT_ACTIVE")
    const plan = assertValidPlanConfig(planRow)
    if (plan.includedServiceId == null) throw new CustomerSubscriptionError("SERVICE_NOT_FOUND")
    const includedService = await loadTenantService(tx, companyId, plan.includedServiceId)
    const initialService =
      plan.initialCleaningRequired && plan.initialServiceId != null ? await loadTenantService(tx, companyId, plan.initialServiceId) : null

    if (input.customerId != null) {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, input.customerId), eq(clients.companyId, companyId)))
      if (!client) throw new CustomerSubscriptionError("CLIENT_NOT_FOUND")
    }

    if (!capacity.creationAllowed) throw new CustomerSubscriptionError("LIMIT_REACHED")

    const snapshot = buildContractSnapshot({
      plan,
      paymentMode: input.paymentMode,
      includedService: { id: includedService.id, name: includedService.name },
      initialService: initialService ? { name: initialService.name, priceCents: initialService.priceCents } : null,
    })
    const status = initialStatusFor(snapshot)
    const token = generateManageToken()

    const [created] = await tx
      .insert(maintenanceSubscriptions)
      .values({
        companyId,
        planId: planRow.id,
        customerId: input.customerId ?? null,
        status,
        ...customer,
        ...snapshot,
        creationIdempotencyKey: idempotencyKey,
        termsAcceptedAt: input.termsAcceptedAt ?? null,
        termsVersion,
        provider: "stripe",
        providerAccountId,
        manageTokenHash: token.hash,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: maintenanceSubscriptions.id })

    await tx.insert(maintenanceSubscriptionVehicles).values({ companyId, subscriptionId: created.id, ...vehicle, activeFrom: now })
    await appendMaintenanceAudit(tx, {
      companyId,
      subscriptionId: created.id,
      action: "subscription_created",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { planId: planRow.id, status, paymentMode: snapshot.paymentMode },
    })
    return { subscriptionId: created.id, status, manageToken: token.token, replayed: false }
  })
}

/** V1 : aucun changement de formule sur un contrat existant (pas de mutation silencieuse). */
export function changeSubscriptionPlan(): never {
  throw new CustomerSubscriptionError("PLAN_CHANGE_NOT_SUPPORTED")
}

/* ----------------------------- Cycle de vie ------------------------------ */

async function lockSubscription(tx: Executor, companyId: number, subscriptionId: number) {
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_FOUND")
  const [row] = await tx
    .select()
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.id, subscriptionId), eq(maintenanceSubscriptions.companyId, companyId)))
    .for("update")
  if (!row) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_FOUND")
  return row
}

type SubscriptionRow = Awaited<ReturnType<typeof lockSubscription>>

function intervalOf(sub: SubscriptionRow): BillingInterval {
  return { unit: sub.billingIntervalUnitSnapshot as BillingInterval["unit"], count: sub.billingIntervalCountSnapshot }
}
function commitmentOf(sub: SubscriptionRow): Commitment {
  return { unit: sub.commitmentUnitSnapshot as Commitment["unit"], count: sub.commitmentCountSnapshot }
}

/**
 * Régénère le token de gestion client (ex. réponse de création perdue → rejeu
 * idempotent sans token). Remplace UNIQUEMENT manageTokenHash : l'ancien token
 * est invalide dès le commit. Le brut est rendu une seule fois, jamais stocké
 * ni journalisé. Aucun email envoyé ici.
 */
export async function rotateManageToken(
  db: Executor,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  now: Date = new Date(),
): Promise<{ subscriptionId: number; manageToken: string }> {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    const token = generateManageToken()
    await tx
      .update(maintenanceSubscriptions)
      .set({ manageTokenHash: token.hash, updatedAt: now })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "manage_token_rotated", actorType: "user", actorUserId: actor.userId })
    return { subscriptionId: sub.id, manageToken: token.token }
  })
}

/** Nettoyage initial validé : passe au paiement. Aucune ancre de facturation ici. */
export async function completeInitialCleaning(db: Executor, companyId: number, actor: Actor, subscriptionId: number, now: Date = new Date()) {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (sub.status !== "pending_initial_cleaning") throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_MUTABLE")
    // Nettoyage initial PAYANT : un paiement initial_cleaning PAID est exigé.
    // Aucun mécanisme de paiement hors ligne n'existe : rien n'est supposé payé.
    if (sub.initialCleaningRequiredSnapshot && (sub.initialServicePriceCentsSnapshot ?? 0) > 0) {
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
      if (!paid) throw new CustomerSubscriptionError("INITIAL_CLEANING_PAYMENT_REQUIRED")
    }
    await tx
      .update(maintenanceSubscriptions)
      .set({ status: "pending_payment", updatedAt: now })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "initial_cleaning_completed", actorType: "user", actorUserId: actor.userId })
    return { status: "pending_payment" as const }
  })
}

/**
 * Activation (appelée plus tard par le webhook Connect après 1er paiement
 * confirmé). Fixe l'ancre, le terme aligné et, en prépayé, la fin de période.
 */
export async function activateSubscription(
  db: Executor,
  companyId: number,
  subscriptionId: number,
  at: Date,
  actorType: "system" | "provider" = "system",
) {
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (sub.status !== "pending_payment") throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_MUTABLE")
    const interval = intervalOf(sub)
    const term = computeActualTermEnd(at, interval, commitmentOf(sub))
    const prepaidUntil = sub.paymentMode === "prepaid" && sub.prepaidBillingCyclesSnapshot
      ? billingBoundary(at, interval, sub.prepaidBillingCyclesSnapshot)
      : null
    const termEnd = term && prepaidUntil ? (term.termEnd > prepaidUntil ? term.termEnd : prepaidUntil) : (term?.termEnd ?? prepaidUntil)
    await tx
      .update(maintenanceSubscriptions)
      .set({
        status: "active",
        startedAt: sub.startedAt ?? at,
        activatedAt: at,
        billingAnchorAt: at,
        currentTermStartedAt: at,
        currentTermEndsAt: termEnd,
        prepaidUntil,
        updatedAt: at,
      })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, {
      companyId,
      subscriptionId: sub.id,
      action: "subscription_activated",
      actorType,
      meta: { billingAnchorAt: at, currentTermEndsAt: termEnd, firstTermBillingCycles: term?.billingCycles ?? null },
    })
    return { billingAnchorAt: at, currentTermEndsAt: termEnd, prepaidUntil }
  })
}

/** Changement de véhicule : clôture l'actif (activeUntil) + nouvelle ligne. Jamais d'écrasement. */
export async function changeVehicle(db: Executor, companyId: number, actor: Actor, subscriptionId: number, vehicleInput: VehicleInput, now: Date = new Date()) {
  assertCanMutate(actor)
  const vehicle = normalizeVehicle(vehicleInput)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (isTerminalStatus(sub.status)) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_MUTABLE")
    await tx
      .update(maintenanceSubscriptionVehicles)
      .set({ activeUntil: now })
      .where(
        and(
          eq(maintenanceSubscriptionVehicles.companyId, companyId),
          eq(maintenanceSubscriptionVehicles.subscriptionId, sub.id),
          isNull(maintenanceSubscriptionVehicles.activeUntil),
        ),
      )
    const [row] = await tx
      .insert(maintenanceSubscriptionVehicles)
      .values({ companyId, subscriptionId: sub.id, ...vehicle, activeFrom: now })
      .returning({ id: maintenanceSubscriptionVehicles.id })
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "vehicle_changed", actorType: "user", actorUserId: actor.userId, meta: { vehicleId: row.id } })
    return { vehicleId: row.id }
  })
}

/* --------------------------------- Cycles -------------------------------- */

export type CycleWindow = { index: number; cycleStart: Date; cycleEnd: Date }

/** Fenêtre PURE du cycle contenant `at` (ancre + intervalle figé). */
export function buildCycleWindow(anchor: Date, interval: BillingInterval, at: Date): CycleWindow | null {
  if (at < anchor) return null
  let index = 0
  // Recherche du dernier k tel que boundary(k) <= at (borné par la saisie).
  while (billingBoundary(anchor, interval, index + 1) <= at) {
    index++
    if (index > 10_000) throw new CustomerSubscriptionError("INTERNAL_ERROR")
  }
  return { index, cycleStart: billingBoundary(anchor, interval, index), cycleEnd: billingBoundary(anchor, interval, index + 1) }
}

const CYCLE_ELIGIBLE_STATUSES = new Set(["active", "cancel_scheduled", "past_due", "suspended"])

/**
 * Crée le cycle contenant `at` s'il n'existe pas, puis EXACTEMENT
 * includedUsesPerCycleSnapshot droits. Idempotent : contrainte unique
 * (subscriptionId, cycleStart) + verrou sur l'abonnement. Les droits encore
 * disponibles des cycles précédents expirent (non reportables).
 */
export async function createCycleIfMissing(db: Executor, companyId: number, subscriptionId: number, at: Date) {
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (!CYCLE_ELIGIBLE_STATUSES.has(sub.status) || !sub.billingAnchorAt) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_USABLE")
    const window = buildCycleWindow(sub.billingAnchorAt, intervalOf(sub), at)
    if (!window) throw new CustomerSubscriptionError("SUBSCRIPTION_NOT_USABLE")
    const hardEnd = sub.cancelAt ?? sub.prepaidUntil ?? null
    if (hardEnd && window.cycleStart >= hardEnd) throw new CustomerSubscriptionError("ALREADY_CANCELLED")

    const inserted = await tx
      .insert(maintenanceCycles)
      .values({ companyId, subscriptionId: sub.id, cycleStart: window.cycleStart, cycleEnd: window.cycleEnd, includedUses: sub.includedUsesPerCycleSnapshot })
      .onConflictDoNothing({ target: [maintenanceCycles.subscriptionId, maintenanceCycles.cycleStart] })
      .returning({ id: maintenanceCycles.id })

    if (!inserted.length) {
      const [existing] = await tx
        .select({ id: maintenanceCycles.id })
        .from(maintenanceCycles)
        .where(and(eq(maintenanceCycles.companyId, companyId), eq(maintenanceCycles.subscriptionId, sub.id), eq(maintenanceCycles.cycleStart, window.cycleStart)))
      return { cycleId: existing.id, created: false, ...window }
    }

    const cycleId = inserted[0].id
    await tx.insert(maintenanceUses).values(
      Array.from({ length: sub.includedUsesPerCycleSnapshot }, () => ({ companyId, subscriptionId: sub.id, cycleId })),
    )
    const previous = await tx
      .update(maintenanceCycles)
      .set({ status: "closed", updatedAt: at })
      .where(and(eq(maintenanceCycles.companyId, companyId), eq(maintenanceCycles.subscriptionId, sub.id), eq(maintenanceCycles.status, "open"), lt(maintenanceCycles.cycleStart, window.cycleStart)))
      .returning({ id: maintenanceCycles.id })
    if (previous.length) {
      await tx
        .update(maintenanceUses)
        .set({ status: "expired", expiredAt: at })
        .where(and(eq(maintenanceUses.companyId, companyId), inArray(maintenanceUses.cycleId, previous.map((p) => p.id)), eq(maintenanceUses.status, "available")))
    }
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "cycle_created", actorType: "system", meta: { cycleId, cycleStart: window.cycleStart, includedUses: sub.includedUsesPerCycleSnapshot } })
    return { cycleId, created: true, ...window }
  })
}

/* -------------------- Non-renouvellement / annulation -------------------- */

/** « Je ne renouvelle pas le prochain terme » : le service continue jusqu'à currentTermEndsAt. */
export async function requestRenewalOptOut(db: Executor, companyId: number, actor: Actor, subscriptionId: number, now: Date = new Date()) {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    const check = canOptOutOfRenewal(sub)
    if (!check.allowed) throw new CustomerSubscriptionError(check.reason)
    if (sub.renewalOptOutAt) return { renewalOptOutAt: sub.renewalOptOutAt, serviceUntil: sub.currentTermEndsAt }
    await tx
      .update(maintenanceSubscriptions)
      .set({ renewalOptOutAt: now, updatedAt: now })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "renewal_opt_out_requested", actorType: "user", actorUserId: actor.userId, meta: { serviceUntil: sub.currentTermEndsAt } })
    return { renewalOptOutAt: now, serviceUntil: sub.currentTermEndsAt }
  })
}

export async function revokeRenewalOptOut(db: Executor, companyId: number, actor: Actor, subscriptionId: number, now: Date = new Date()) {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (isTerminalStatus(sub.status)) throw new CustomerSubscriptionError("ALREADY_CANCELLED")
    if (!sub.renewalOptOutAt) return { revoked: false }
    await tx
      .update(maintenanceSubscriptions)
      .set({ renewalOptOutAt: null, updatedAt: now })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "renewal_opt_out_revoked", actorType: "user", actorUserId: actor.userId })
    return { revoked: true }
  })
}

/**
 * Programme l'arrêt (cancelRequestedAt → cancelAt). Contrat non démarré :
 * annulation immédiate (rien n'a été facturé). Engagement en cours : jamais
 * avant currentTermEndsAt. Aucun remboursement.
 */
export async function scheduleCancellation(
  db: Executor,
  companyId: number,
  actor: Actor,
  subscriptionId: number,
  options: { requestedCancelAt?: Date | null } = {},
  now: Date = new Date(),
) {
  assertCanMutate(actor)
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (isTerminalStatus(sub.status)) throw new CustomerSubscriptionError("ALREADY_CANCELLED")
    const where = and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "cancel_requested", actorType: "user", actorUserId: actor.userId })

    if (!sub.billingAnchorAt) {
      await tx.update(maintenanceSubscriptions).set({ status: "cancelled", cancelRequestedAt: now, cancelAt: now, cancelledAt: now, updatedAt: now }).where(where)
      await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "subscription_cancelled", actorType: "user", actorUserId: actor.userId, meta: { immediate: true } })
      return { status: "cancelled" as const, cancelAt: now }
    }

    const cancelAt = resolveCancellationAt(sub, now, options.requestedCancelAt)
    // past_due / suspended conservent leur statut (blocage d'usage), seule la date est programmée.
    const status = sub.status === "active" ? "cancel_scheduled" : sub.status
    await tx.update(maintenanceSubscriptions).set({ status, cancelRequestedAt: sub.cancelRequestedAt ?? now, cancelAt, updatedAt: now }).where(where)
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "cancel_scheduled", actorType: "user", actorUserId: actor.userId, meta: { cancelAt } })
    return { status, cancelAt }
  })
}

/**
 * Fin FORCÉE (OWNER/ADMIN), motif obligatoire, journalisée. Aucun
 * remboursement automatique (action financière séparée), aucune suppression.
 */
export async function forceEndSubscription(db: Executor, companyId: number, actor: Actor, subscriptionId: number, reason: unknown, now: Date = new Date()) {
  assertCanMutate(actor)
  const motive = typeof reason === "string" ? reason.replace(/\s+/g, " ").trim() : ""
  if (motive.length < 3 || motive.length > 500) throw new CustomerSubscriptionError("INVALID_REASON")
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, companyId, subscriptionId)
    if (isTerminalStatus(sub.status)) throw new CustomerSubscriptionError("ALREADY_CANCELLED")
    await tx
      .update(maintenanceSubscriptions)
      .set({ status: "ended", endedAt: now, cancelAt: sub.cancelAt ?? now, cancelRequestedAt: sub.cancelRequestedAt ?? now, updatedAt: now })
      .where(and(eq(maintenanceSubscriptions.id, sub.id), eq(maintenanceSubscriptions.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, subscriptionId: sub.id, action: "subscription_force_ended", actorType: "user", actorUserId: actor.userId, meta: { reason: motive, previousStatus: sub.status, refund: "none" } })
    return { status: "ended" as const }
  })
}
