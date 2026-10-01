/**
 * Points d'entrée SERVEUR (futures Server Actions / routes). Le companyId vient
 * EXCLUSIVEMENT de requireCompanyMember() — jamais d'un champ de formulaire.
 * Mutations : OWNER / ADMIN (super-admin : comportement existant conservé).
 * Retour sérialisable { ok, value } | { ok: false, code } ; l'UI traduit les codes.
 */
import { requireCompanyMember, type MemberContext } from "@/lib/admin"
import { db } from "@/lib/db"
import { toErrorResult, type Result } from "./errors"
import * as engine from "./engine"
import type { PlanConfigInput } from "./plan-validation"
import type { VehicleInput } from "./vehicle"

type MemberRole = MemberContext["role"]

function actorOf(member: MemberContext): engine.Actor {
  return { userId: member.user.id, role: member.role, isSuperAdmin: member.isSuperAdmin }
}

async function run<T>(roles: MemberRole[] | undefined, fn: (companyId: number, actor: engine.Actor) => Promise<T>): Promise<Result<T>> {
  const member = await requireCompanyMember(roles)
  try {
    return { ok: true, value: await fn(member.tenant.id, actorOf(member)) }
  } catch (error) {
    return toErrorResult(error)
  }
}

const MUTATORS: MemberRole[] = ["OWNER", "ADMIN"]

export const getCapacityForCurrentTenant = () => run(undefined, (companyId) => engine.getCustomerSubscriptionCapacity(db, companyId))

export const createPlanForCurrentTenant = (input: PlanConfigInput) =>
  run(MUTATORS, (companyId, actor) => engine.createPlan(db, companyId, actor, input))

export const updatePlanForCurrentTenant = (planId: number, input: PlanConfigInput) =>
  run(MUTATORS, (companyId, actor) => engine.updatePlan(db, companyId, actor, planId, input))

export const archivePlanForCurrentTenant = (planId: number) =>
  run(MUTATORS, (companyId, actor) => engine.archivePlan(db, companyId, actor, planId))

export const createSubscriptionForCurrentTenant = (input: engine.CreateSubscriptionInput) =>
  run(MUTATORS, (companyId, actor) => engine.createSubscription(db, companyId, actor, input))

export const completeInitialCleaningForCurrentTenant = (subscriptionId: number) =>
  run(MUTATORS, (companyId, actor) => engine.completeInitialCleaning(db, companyId, actor, subscriptionId))

export const changeVehicleForCurrentTenant = (subscriptionId: number, vehicle: VehicleInput) =>
  run(MUTATORS, (companyId, actor) => engine.changeVehicle(db, companyId, actor, subscriptionId, vehicle))

export const requestRenewalOptOutForCurrentTenant = (subscriptionId: number) =>
  run(MUTATORS, (companyId, actor) => engine.requestRenewalOptOut(db, companyId, actor, subscriptionId))

export const revokeRenewalOptOutForCurrentTenant = (subscriptionId: number) =>
  run(MUTATORS, (companyId, actor) => engine.revokeRenewalOptOut(db, companyId, actor, subscriptionId))

export const scheduleCancellationForCurrentTenant = (subscriptionId: number, requestedCancelAt?: Date | null) =>
  run(MUTATORS, (companyId, actor) => engine.scheduleCancellation(db, companyId, actor, subscriptionId, { requestedCancelAt }))

export const forceEndSubscriptionForCurrentTenant = (subscriptionId: number, reason: string) =>
  run(MUTATORS, (companyId, actor) => engine.forceEndSubscription(db, companyId, actor, subscriptionId, reason))
