import "server-only"
import { createHash } from "node:crypto"
import { and, count, eq, gte, lt, sql } from "drizzle-orm"
import { companies, maintenancePlans, maintenanceSubscriptionRequests, services } from "@/lib/db/schema"
import { CustomerSubscriptionError } from "./errors"
import {
  appendMaintenanceAudit,
  assertCanMutate,
  createSubscription,
  getCustomerSubscriptionCapacity,
  normalizeCustomer,
  type Actor,
  type Executor,
} from "./engine"
import { emailEvents } from "./email-events"
import { assertValidPlanConfig, type PaymentMode, type ValidatedPlanConfig } from "./plan-validation"
import { isPlanPubliclyAccessible, parsePublicMode } from "./public-mode"
import { normalizeVehicle, type VehicleInput } from "./vehicle"

/**
 * Demandes d'abonnement (mode public « request »).
 *
 * Une demande N'EST PAS un abonnement : aucun maintenance_subscription, aucun
 * appel Stripe tant que le professionnel n'a pas accepté. Le navigateur ne
 * transmet que planId + coordonnées + véhicule + message + submissionId ; le
 * tenant (companyId) est résolu côté serveur par l'appelant, et prix, devise,
 * compte Stripe, commission, statut sont exclusivement relus en base.
 */

export const REQUEST_LIMITS = {
  messageMax: 1000,
  decisionMessageMax: 500,
  internalNoteMax: 1000,
  /** Demandes par (tenant, email) sur 24 h. */
  perEmailPerDay: 3,
  /** Demandes par tenant sur 1 h (protection inondation). */
  perTenantPerHour: 50,
  /** Durée de validité d'une demande non traitée. */
  ttlDays: 30,
} as const

const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const SUBMISSION_ID = /^[A-Za-z0-9_-]{16,128}$/
// eslint-disable-next-line no-control-regex -- retire les caractères de contrôle (hors \n)
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/g

export function normalizeSubmissionId(v: unknown): string {
  if (typeof v !== "string" || !SUBMISSION_ID.test(v)) {
    throw new CustomerSubscriptionError("INVALID_SUBMISSION", [{ field: "submissionId", code: "INVALID_SUBMISSION" }])
  }
  return v
}

/** Texte libre : contrôle retiré, espaces normalisés, longueur bornée. Vide → null. */
export function normalizeFreeText(v: unknown, max: number, field: string): string | null {
  if (v == null || v === "") return null
  if (typeof v !== "string") throw new CustomerSubscriptionError("INVALID_MESSAGE", [{ field, code: "INVALID_MESSAGE" }])
  const text = v.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  if (text.length > max) throw new CustomerSubscriptionError("INVALID_MESSAGE", [{ field, code: "INVALID_MESSAGE" }])
  return text || null
}

export type PlanRequestSnapshot = ValidatedPlanConfig & { planId: number; includedServiceName: string | null; initialServiceName: string | null }

/** Version déterministe (sha256) du snapshot : permet de détecter un plan modifié entre demande et acceptation. */
export function planSnapshotVersion(snapshot: PlanRequestSnapshot): string {
  const sorted = Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)))
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32)
}

async function serviceName(tx: Executor, companyId: number, serviceId: number | null): Promise<string | null> {
  if (serviceId == null) return null
  const [row] = await tx
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, companyId)))
  return row?.name ?? null
}

/* --------------------------- Création publique --------------------------- */

export type PublicRequestInput = {
  planId: unknown
  customer: { name: unknown; email: unknown; phone?: unknown }
  vehicle: VehicleInput
  message?: unknown
  submissionId: unknown
}

export type PublicRequestResult = { requestId: number; replayed: boolean }

/**
 * Crée une demande publique. `companyId` DOIT venir de la résolution serveur
 * du tenant (jamais du corps de requête). Toutes les erreurs « formule
 * indisponible » (inexistante, autre tenant, draft, archived, private)
 * renvoient le même code PLAN_NOT_AVAILABLE : aucune énumération possible.
 */
export async function createPublicSubscriptionRequest(
  db: Executor,
  companyId: number,
  input: PublicRequestInput,
  now: Date = new Date(),
): Promise<PublicRequestResult> {
  if (!Number.isInteger(companyId) || companyId <= 0) throw new CustomerSubscriptionError("FORBIDDEN")
  const planId = typeof input.planId === "number" ? input.planId : Number.NaN
  if (!Number.isInteger(planId) || planId <= 0) throw new CustomerSubscriptionError("PLAN_NOT_AVAILABLE")
  const submissionId = normalizeSubmissionId(input.submissionId)
  const customer = normalizeCustomer(input.customer)
  const vehicle = normalizeVehicle(input.vehicle ?? ({} as VehicleInput))
  const message = normalizeFreeText(input.message, REQUEST_LIMITS.messageMax, "message")

  return db.transaction(async (tx) => {
    // Verrou tenant : sérialise les créations → compteurs anti-abus fiables.
    const [company] = await tx
      .select({ id: companies.id, mode: companies.customerSubscriptionPublicMode, status: companies.status })
      .from(companies)
      .where(eq(companies.id, companyId))
      .for("update")
    if (!company || company.status === "ARCHIVED") throw new CustomerSubscriptionError("FORBIDDEN")

    // Idempotence : même submissionId → même demande, aucun second email.
    const [existing] = await tx
      .select({ id: maintenanceSubscriptionRequests.id, planId: maintenanceSubscriptionRequests.planId, email: maintenanceSubscriptionRequests.customerEmail })
      .from(maintenanceSubscriptionRequests)
      .where(and(eq(maintenanceSubscriptionRequests.companyId, companyId), eq(maintenanceSubscriptionRequests.submissionId, submissionId)))
    if (existing) {
      if (existing.planId !== planId || existing.email !== customer.customerEmail) throw new CustomerSubscriptionError("CONFLICT")
      return { requestId: existing.id, replayed: true }
    }

    const mode = parsePublicMode(company.mode)
    if (mode !== "request") throw new CustomerSubscriptionError("REQUESTS_DISABLED")

    const [planRow] = await tx
      .select()
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, planId), eq(maintenancePlans.companyId, companyId)))
    if (!planRow || !isPlanPubliclyAccessible(mode, planRow, "direct_link")) throw new CustomerSubscriptionError("PLAN_NOT_AVAILABLE")
    let plan: ValidatedPlanConfig
    try {
      plan = assertValidPlanConfig(planRow)
    } catch {
      throw new CustomerSubscriptionError("PLAN_NOT_AVAILABLE")
    }

    const capacity = await getCustomerSubscriptionCapacity(tx, companyId)
    if (!capacity.creationAllowed) throw new CustomerSubscriptionError("NOT_ACCEPTING_REQUESTS")

    // Double demande (même email + même formule encore en attente) : rejeu silencieux.
    const [pendingDup] = await tx
      .select({ id: maintenanceSubscriptionRequests.id })
      .from(maintenanceSubscriptionRequests)
      .where(
        and(
          eq(maintenanceSubscriptionRequests.companyId, companyId),
          eq(maintenanceSubscriptionRequests.planId, planId),
          eq(maintenanceSubscriptionRequests.customerEmail, customer.customerEmail),
          eq(maintenanceSubscriptionRequests.status, "pending"),
        ),
      )
    if (pendingDup) return { requestId: pendingDup.id, replayed: true }

    const [perEmail] = await tx
      .select({ n: count() })
      .from(maintenanceSubscriptionRequests)
      .where(
        and(
          eq(maintenanceSubscriptionRequests.companyId, companyId),
          eq(maintenanceSubscriptionRequests.customerEmail, customer.customerEmail),
          gte(maintenanceSubscriptionRequests.createdAt, new Date(now.getTime() - DAY)),
        ),
      )
    if (Number(perEmail?.n ?? 0) >= REQUEST_LIMITS.perEmailPerDay) throw new CustomerSubscriptionError("RATE_LIMITED")
    const [perTenant] = await tx
      .select({ n: count() })
      .from(maintenanceSubscriptionRequests)
      .where(and(eq(maintenanceSubscriptionRequests.companyId, companyId), gte(maintenanceSubscriptionRequests.createdAt, new Date(now.getTime() - HOUR))))
    if (Number(perTenant?.n ?? 0) >= REQUEST_LIMITS.perTenantPerHour) throw new CustomerSubscriptionError("RATE_LIMITED")

    const snapshot: PlanRequestSnapshot = {
      ...plan,
      planId,
      includedServiceName: await serviceName(tx, companyId, plan.includedServiceId),
      initialServiceName: plan.initialCleaningRequired ? await serviceName(tx, companyId, plan.initialServiceId) : null,
    }

    const [created] = await tx
      .insert(maintenanceSubscriptionRequests)
      .values({
        companyId,
        planId,
        ...customer,
        ...vehicle,
        message,
        status: "pending",
        submissionId,
        planSnapshot: snapshot,
        planSnapshotVersion: planSnapshotVersion(snapshot),
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + REQUEST_LIMITS.ttlDays * DAY),
      })
      .returning({ id: maintenanceSubscriptionRequests.id })

    await appendMaintenanceAudit(tx, { companyId, action: "request_created", actorType: "customer", meta: { requestId: created.id, planId } })
    await emailEvents.requestReceived(tx, { companyId, requestId: created.id }, now)
    return { requestId: created.id, replayed: false }
  })
}

/* ------------------------------ Décisions -------------------------------- */

async function lockRequest(tx: Executor, companyId: number, requestId: number) {
  if (!Number.isInteger(requestId) || requestId <= 0) throw new CustomerSubscriptionError("REQUEST_NOT_FOUND")
  const [row] = await tx
    .select()
    .from(maintenanceSubscriptionRequests)
    .where(and(eq(maintenanceSubscriptionRequests.id, requestId), eq(maintenanceSubscriptionRequests.companyId, companyId)))
    .for("update")
  if (!row) throw new CustomerSubscriptionError("REQUEST_NOT_FOUND")
  return row
}

/** Mode de paiement déterminé côté serveur depuis la formule (mensuel prioritaire). */
export function defaultPaymentMode(plan: Pick<ValidatedPlanConfig, "allowRecurringPayment" | "allowPrepaidPayment">): PaymentMode {
  if (plan.allowRecurringPayment) return "recurring"
  if (plan.allowPrepaidPayment) return "prepaid"
  throw new CustomerSubscriptionError("INVALID_PAYMENT_MODE")
}

export type AcceptRequestResult = { requestId: number; subscriptionId: number; replayed: boolean; planChangedSinceRequest: boolean }

/**
 * Acceptation ATOMIQUE demande → maintenance_subscription.
 * - FOR UPDATE sur la demande : deux clics concurrents sont sérialisés ; le
 *   second voit `accepted` et renvoie le MÊME contrat (rejeu).
 * - Clé d'idempotence de création dérivée de l'id de demande : même en cas de
 *   course résiduelle, createSubscription ne peut produire qu'un contrat.
 * - Conditions : relues depuis la formule SERVEUR puis figées en snapshots du
 *   contrat ; rien ne provient du navigateur. Aucun appel Stripe ici.
 */
export async function acceptSubscriptionRequest(
  db: Executor,
  companyId: number,
  actor: Actor,
  requestId: number,
  input: { customerMessage?: unknown; internalNote?: unknown } = {},
  now: Date = new Date(),
): Promise<AcceptRequestResult> {
  assertCanMutate(actor)
  const customerMessage = normalizeFreeText(input.customerMessage, REQUEST_LIMITS.decisionMessageMax, "customerMessage")
  const internalNote = normalizeFreeText(input.internalNote, REQUEST_LIMITS.internalNoteMax, "internalNote")

  return db.transaction(async (tx) => {
    const request = await lockRequest(tx, companyId, requestId)
    if (request.status === "accepted" && request.convertedSubscriptionId != null) {
      return { requestId, subscriptionId: request.convertedSubscriptionId, replayed: true, planChangedSinceRequest: false }
    }
    if (request.status !== "pending") throw new CustomerSubscriptionError("REQUEST_NOT_PENDING")
    if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
      await tx
        .update(maintenanceSubscriptionRequests)
        .set({ status: "expired", updatedAt: now })
        .where(and(eq(maintenanceSubscriptionRequests.id, requestId), eq(maintenanceSubscriptionRequests.companyId, companyId)))
      throw new CustomerSubscriptionError("REQUEST_NOT_PENDING")
    }

    const [planRow] = await tx
      .select()
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, request.planId), eq(maintenancePlans.companyId, companyId)))
    if (!planRow) throw new CustomerSubscriptionError("INVALID_PLAN")
    if (planRow.status !== "active") throw new CustomerSubscriptionError("PLAN_NOT_ACTIVE")
    const currentPlan = assertValidPlanConfig(planRow)

    const created = await createSubscription(
      tx,
      companyId,
      actor,
      {
        planId: request.planId,
        customerId: request.customerId,
        customer: { name: request.customerName, email: request.customerEmail, phone: request.customerPhone },
        vehicle: { brand: request.vehicleBrand, model: request.vehicleModel, plate: request.vehiclePlate, typeName: request.vehicleTypeName },
        paymentMode: defaultPaymentMode(currentPlan),
        idempotencyKey: `request-accept-${String(request.id).padStart(12, "0")}`,
      },
      now,
    )

    const currentSnapshot: PlanRequestSnapshot = {
      ...currentPlan,
      planId: request.planId,
      includedServiceName: await serviceName(tx, companyId, currentPlan.includedServiceId),
      initialServiceName: currentPlan.initialCleaningRequired ? await serviceName(tx, companyId, currentPlan.initialServiceId) : null,
    }
    const planChangedSinceRequest = planSnapshotVersion(currentSnapshot) !== request.planSnapshotVersion

    await tx
      .update(maintenanceSubscriptionRequests)
      .set({
        status: "accepted",
        convertedSubscriptionId: created.subscriptionId,
        acceptedAt: now,
        customerDecisionMessage: customerMessage,
        internalDecisionNote: internalNote,
        updatedAt: now,
      })
      .where(and(eq(maintenanceSubscriptionRequests.id, requestId), eq(maintenanceSubscriptionRequests.companyId, companyId), eq(maintenanceSubscriptionRequests.status, "pending")))

    await appendMaintenanceAudit(tx, {
      companyId,
      subscriptionId: created.subscriptionId,
      action: "request_accepted",
      actorType: "user",
      actorUserId: actor.userId,
      meta: { requestId, planChangedSinceRequest },
    })
    await emailEvents.requestAccepted(tx, { companyId, requestId, subscriptionId: created.subscriptionId }, now)
    return { requestId, subscriptionId: created.subscriptionId, replayed: false, planChangedSinceRequest }
  })
}

export async function rejectSubscriptionRequest(
  db: Executor,
  companyId: number,
  actor: Actor,
  requestId: number,
  input: { customerMessage?: unknown; internalNote?: unknown } = {},
  now: Date = new Date(),
): Promise<{ requestId: number; replayed: boolean }> {
  assertCanMutate(actor)
  const customerMessage = normalizeFreeText(input.customerMessage, REQUEST_LIMITS.decisionMessageMax, "customerMessage")
  const internalNote = normalizeFreeText(input.internalNote, REQUEST_LIMITS.internalNoteMax, "internalNote")

  return db.transaction(async (tx) => {
    const request = await lockRequest(tx, companyId, requestId)
    if (request.status === "rejected") return { requestId, replayed: true }
    if (request.status !== "pending") throw new CustomerSubscriptionError("REQUEST_NOT_PENDING")
    await tx
      .update(maintenanceSubscriptionRequests)
      .set({ status: "rejected", rejectedAt: now, customerDecisionMessage: customerMessage, internalDecisionNote: internalNote, updatedAt: now })
      .where(and(eq(maintenanceSubscriptionRequests.id, requestId), eq(maintenanceSubscriptionRequests.companyId, companyId)))
    await appendMaintenanceAudit(tx, { companyId, action: "request_rejected", actorType: "user", actorUserId: actor.userId, meta: { requestId } })
    await emailEvents.requestRejected(tx, { companyId, requestId }, now)
    return { requestId, replayed: false }
  })
}

/** Expire les demandes en attente dépassées (cron). Aucun email. */
export async function expireStaleSubscriptionRequests(db: Executor, now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(maintenanceSubscriptionRequests)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(maintenanceSubscriptionRequests.status, "pending"), lt(maintenanceSubscriptionRequests.expiresAt, now)))
    .returning({ id: maintenanceSubscriptionRequests.id })
  return rows.length
}

/** Vue admin (tenant strict). La note interne n'est exposée qu'ici, jamais au client. */
export async function listSubscriptionRequests(db: Executor, companyId: number, status?: "pending" | "accepted" | "rejected" | "expired") {
  return db
    .select({
      id: maintenanceSubscriptionRequests.id,
      planId: maintenanceSubscriptionRequests.planId,
      status: maintenanceSubscriptionRequests.status,
      customerName: maintenanceSubscriptionRequests.customerName,
      customerEmail: maintenanceSubscriptionRequests.customerEmail,
      customerPhone: maintenanceSubscriptionRequests.customerPhone,
      vehicleBrand: maintenanceSubscriptionRequests.vehicleBrand,
      vehicleModel: maintenanceSubscriptionRequests.vehicleModel,
      vehiclePlate: maintenanceSubscriptionRequests.vehiclePlate,
      message: maintenanceSubscriptionRequests.message,
      planSnapshot: maintenanceSubscriptionRequests.planSnapshot,
      convertedSubscriptionId: maintenanceSubscriptionRequests.convertedSubscriptionId,
      internalDecisionNote: maintenanceSubscriptionRequests.internalDecisionNote,
      createdAt: maintenanceSubscriptionRequests.createdAt,
      expiresAt: maintenanceSubscriptionRequests.expiresAt,
    })
    .from(maintenanceSubscriptionRequests)
    .where(and(eq(maintenanceSubscriptionRequests.companyId, companyId), status ? eq(maintenanceSubscriptionRequests.status, status) : sql`true`))
    .orderBy(sql`${maintenanceSubscriptionRequests.createdAt} desc`)
    .limit(200)
}
