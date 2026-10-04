/**
 * LECTURES de l'espace pro « Abonnements clients ». Chaque requête est filtrée
 * par le companyId issu de requireCompanyMember() (jamais d'un paramètre client).
 * Aucune mutation ici : les écritures passent par ./service.
 */
import "server-only"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  maintenanceCancellationRequests,
  maintenancePayments,
  maintenancePlans,
  maintenanceSubscriptionEmailOutbox,
  maintenanceSubscriptionRequests,
  maintenanceSubscriptions,
  maintenanceSubscriptionVehicles,
  services,
} from "@/lib/db/schema"
import { listSubscriptionRequests } from "./requests"
import type { PlanRequestSnapshot } from "./requests"
import type { ValidatedPlanConfig } from "./plan-validation"

export type AdminPlanRow = typeof maintenancePlans.$inferSelect
export type AdminSubscriptionRow = typeof maintenanceSubscriptions.$inferSelect

export function planRowToConfig(p: AdminPlanRow): ValidatedPlanConfig {
  return {
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    billingIntervalUnit: p.billingIntervalUnit as ValidatedPlanConfig["billingIntervalUnit"],
    billingIntervalCount: p.billingIntervalCount,
    includedUsesPerCycle: p.includedUsesPerCycle,
    includedServiceId: p.includedServiceId,
    commitmentUnit: p.commitmentUnit as ValidatedPlanConfig["commitmentUnit"],
    commitmentCount: p.commitmentCount,
    renewalMode: p.renewalMode as ValidatedPlanConfig["renewalMode"],
    renewalNoticeDays: p.renewalNoticeDays,
    initialCleaningRequired: p.initialCleaningRequired,
    initialServiceId: p.initialServiceId,
    allowRecurringPayment: p.allowRecurringPayment,
    allowPrepaidPayment: p.allowPrepaidPayment,
    prepaidBillingCycles: p.prepaidBillingCycles,
    visibility: p.visibility as ValidatedPlanConfig["visibility"],
    status: p.status as ValidatedPlanConfig["status"],
  }
}

export async function listServiceOptions(companyId: number) {
  return db
    .select({ id: services.id, name: services.name, priceCents: services.basePriceCents })
    .from(services)
    .where(eq(services.companyId, companyId))
    .orderBy(services.sortOrder, services.name)
}

async function currentVehicles(companyId: number, subscriptionIds: number[]) {
  if (!subscriptionIds.length) return new Map<number, string>()
  const rows = await db
    .select({
      subscriptionId: maintenanceSubscriptionVehicles.subscriptionId,
      brand: maintenanceSubscriptionVehicles.vehicleBrand,
      model: maintenanceSubscriptionVehicles.vehicleModel,
      plate: maintenanceSubscriptionVehicles.vehiclePlate,
    })
    .from(maintenanceSubscriptionVehicles)
    .where(
      and(
        eq(maintenanceSubscriptionVehicles.companyId, companyId),
        inArray(maintenanceSubscriptionVehicles.subscriptionId, subscriptionIds),
        isNull(maintenanceSubscriptionVehicles.activeUntil),
      ),
    )
  return new Map(rows.map((r) => [r.subscriptionId, vehicleLabel(r.brand, r.model, r.plate)]))
}

export function vehicleLabel(brand: string, model: string, plate: string | null): string {
  return [`${brand} ${model}`.trim(), plate ? `· ${plate}` : ""].filter(Boolean).join(" ")
}

export async function getAdminOverview(companyId: number) {
  const [company] = await db
    .select({
      publicMode: companies.customerSubscriptionPublicMode,
      stripeAccountId: companies.stripeAccountId,
      stripeChargesEnabled: companies.stripeChargesEnabled,
      paymentsEnabled: companies.paymentsEnabled,
    })
    .from(companies)
    .where(eq(companies.id, companyId))

  const [plans, subscriptions, pendingRequests, cancellationRows, payments, emails] = await Promise.all([
    db.select().from(maintenancePlans).where(eq(maintenancePlans.companyId, companyId)).orderBy(desc(maintenancePlans.updatedAt)),
    db
      .select()
      .from(maintenanceSubscriptions)
      .where(eq(maintenanceSubscriptions.companyId, companyId))
      .orderBy(desc(maintenanceSubscriptions.createdAt))
      .limit(200),
    listSubscriptionRequests(db, companyId, "pending"),
    db
      .select({
        id: maintenanceCancellationRequests.id,
        subscriptionId: maintenanceCancellationRequests.subscriptionId,
        customerMessage: maintenanceCancellationRequests.customerMessage,
        createdAt: maintenanceCancellationRequests.createdAt,
      })
      .from(maintenanceCancellationRequests)
      .where(and(eq(maintenanceCancellationRequests.companyId, companyId), eq(maintenanceCancellationRequests.status, "pending")))
      .orderBy(desc(maintenanceCancellationRequests.createdAt)),
    db
      .select({
        id: maintenancePayments.id,
        subscriptionId: maintenancePayments.subscriptionId,
        type: maintenancePayments.type,
        status: maintenancePayments.status,
        grossAmountCents: maintenancePayments.grossAmountCents,
        refundedAmountCents: maintenancePayments.refundedAmountCents,
        createdAt: maintenancePayments.createdAt,
        paidAt: maintenancePayments.paidAt,
      })
      .from(maintenancePayments)
      .where(eq(maintenancePayments.companyId, companyId))
      .orderBy(desc(maintenancePayments.createdAt))
      .limit(50),
    db
      .select({
        id: maintenanceSubscriptionEmailOutbox.id,
        subscriptionId: maintenanceSubscriptionEmailOutbox.subscriptionId,
        type: maintenanceSubscriptionEmailOutbox.type,
        recipientRole: maintenanceSubscriptionEmailOutbox.recipientRole,
        status: maintenanceSubscriptionEmailOutbox.status,
        sendAt: maintenanceSubscriptionEmailOutbox.sendAt,
        sentAt: maintenanceSubscriptionEmailOutbox.sentAt,
      })
      .from(maintenanceSubscriptionEmailOutbox)
      .where(eq(maintenanceSubscriptionEmailOutbox.companyId, companyId))
      .orderBy(desc(maintenanceSubscriptionEmailOutbox.sendAt))
      .limit(50),
  ])

  const vehicles = await currentVehicles(companyId, subscriptions.map((s) => s.id))
  const subById = new Map(subscriptions.map((s) => [s.id, s]))
  const planById = new Map(plans.map((p) => [p.id, p]))

  const earlyCancellations = cancellationRows.flatMap((c) => {
    const s = subById.get(c.subscriptionId)
    if (!s) return []
    return [{ ...c, subscription: s, vehicle: vehicles.get(s.id) ?? null }]
  })

  const requests = pendingRequests.map((r) => {
    const current = planById.get(r.planId)
    return {
      ...r,
      planSnapshot: r.planSnapshot as PlanRequestSnapshot,
      currentPlan: current && current.status !== "archived" ? planRowToConfig(current) : null,
    }
  })

  return {
    company: company ?? { publicMode: "disabled", stripeAccountId: null, stripeChargesEnabled: false, paymentsEnabled: false },
    plans,
    subscriptions: subscriptions.map((s) => ({ ...s, vehicle: vehicles.get(s.id) ?? null })),
    requests,
    earlyCancellations,
    payments: payments.map((p) => ({ ...p, customerName: subById.get(p.subscriptionId)?.customerName ?? "Client" })),
    emails: emails.map((e) => ({ ...e, customerName: e.subscriptionId ? (subById.get(e.subscriptionId)?.customerName ?? null) : null })),
  }
}

export async function getPlanForEdit(companyId: number, planId: number) {
  const [plan] = await db
    .select()
    .from(maintenancePlans)
    .where(and(eq(maintenancePlans.companyId, companyId), eq(maintenancePlans.id, planId)))
  if (!plan) return null
  const subs = await db
    .select({ id: maintenanceSubscriptions.id })
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.companyId, companyId), eq(maintenanceSubscriptions.planId, planId)))
    .limit(1)
  return { plan, hasSubscribers: subs.length > 0 }
}

export async function getSubscriptionDetail(companyId: number, subscriptionId: number) {
  const [subscription] = await db
    .select()
    .from(maintenanceSubscriptions)
    .where(and(eq(maintenanceSubscriptions.companyId, companyId), eq(maintenanceSubscriptions.id, subscriptionId)))
  if (!subscription) return null
  const [vehicles, payments, emails, cancellations] = await Promise.all([
    db
      .select()
      .from(maintenanceSubscriptionVehicles)
      .where(and(eq(maintenanceSubscriptionVehicles.companyId, companyId), eq(maintenanceSubscriptionVehicles.subscriptionId, subscriptionId)))
      .orderBy(desc(maintenanceSubscriptionVehicles.activeFrom)),
    db
      .select({
        id: maintenancePayments.id,
        type: maintenancePayments.type,
        status: maintenancePayments.status,
        grossAmountCents: maintenancePayments.grossAmountCents,
        refundedAmountCents: maintenancePayments.refundedAmountCents,
        createdAt: maintenancePayments.createdAt,
        paidAt: maintenancePayments.paidAt,
      })
      .from(maintenancePayments)
      .where(and(eq(maintenancePayments.companyId, companyId), eq(maintenancePayments.subscriptionId, subscriptionId)))
      .orderBy(desc(maintenancePayments.createdAt)),
    db
      .select({
        id: maintenanceSubscriptionEmailOutbox.id,
        type: maintenanceSubscriptionEmailOutbox.type,
        recipientRole: maintenanceSubscriptionEmailOutbox.recipientRole,
        status: maintenanceSubscriptionEmailOutbox.status,
        sendAt: maintenanceSubscriptionEmailOutbox.sendAt,
        sentAt: maintenanceSubscriptionEmailOutbox.sentAt,
      })
      .from(maintenanceSubscriptionEmailOutbox)
      .where(and(eq(maintenanceSubscriptionEmailOutbox.companyId, companyId), eq(maintenanceSubscriptionEmailOutbox.subscriptionId, subscriptionId)))
      .orderBy(desc(maintenanceSubscriptionEmailOutbox.sendAt)),
    db
      .select({
        id: maintenanceCancellationRequests.id,
        status: maintenanceCancellationRequests.status,
        customerMessage: maintenanceCancellationRequests.customerMessage,
        createdAt: maintenanceCancellationRequests.createdAt,
        decidedAt: maintenanceCancellationRequests.decidedAt,
      })
      .from(maintenanceCancellationRequests)
      .where(and(eq(maintenanceCancellationRequests.companyId, companyId), eq(maintenanceCancellationRequests.subscriptionId, subscriptionId)))
      .orderBy(desc(maintenanceCancellationRequests.createdAt)),
  ])
  const current = vehicles.find((v) => v.activeUntil == null) ?? vehicles[0] ?? null
  return {
    subscription,
    vehicle: current ? vehicleLabel(current.vehicleBrand, current.vehicleModel, current.vehiclePlate) : null,
    payments,
    emails,
    cancellations,
  }
}

/** Demande d'abonnement source (pour lier la fiche à la demande acceptée). */
export async function getRequestForSubscription(companyId: number, subscriptionId: number) {
  const [row] = await db
    .select({ id: maintenanceSubscriptionRequests.id, createdAt: maintenanceSubscriptionRequests.createdAt })
    .from(maintenanceSubscriptionRequests)
    .where(
      and(
        eq(maintenanceSubscriptionRequests.companyId, companyId),
        eq(maintenanceSubscriptionRequests.convertedSubscriptionId, subscriptionId),
      ),
    )
  return row ?? null
}
