"use server"

import { revalidatePath } from "next/cache"
import {
  acceptRequestForCurrentTenant,
  archivePlanForCurrentTenant,
  createPlanForCurrentTenant,
  rejectRequestForCurrentTenant,
  setPublicModeForCurrentTenant,
  updatePlanForCurrentTenant,
} from "@/lib/customer-subscriptions/service"
import { toPlanConfigInput, type PlanFormState } from "@/lib/customer-subscriptions/plan-form"
import { errorMessage } from "@/lib/customer-subscriptions/admin-labels"

export type ActionResult = { ok: true; id?: number } | { ok: false; message: string; planChanged?: boolean }

const BASE = "/admin/abonnements-clients"

function validId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0
}

function fail(r: { code: string; planChangedSinceRequest?: boolean }): ActionResult {
  return { ok: false, message: errorMessage(r.code), planChanged: r.planChangedSinceRequest === true }
}

/** Le formulaire est re-traduit côté serveur : le navigateur ne fournit jamais de valeurs techniques. */
export async function savePlanAction(planId: number | null, form: PlanFormState): Promise<ActionResult> {
  if (planId !== null && !validId(planId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const input = toPlanConfigInput(form)
  const r = planId === null ? await createPlanForCurrentTenant(input) : await updatePlanForCurrentTenant(planId, input)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true, id: r.value.planId }
}

export async function archivePlanAction(planId: number): Promise<ActionResult> {
  if (!validId(planId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await archivePlanForCurrentTenant(planId)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true }
}

export async function setPublicModeAction(mode: string): Promise<ActionResult> {
  const r = await setPublicModeForCurrentTenant(mode)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true }
}

export async function acceptRequestAction(
  requestId: number,
  input: { customerMessage?: string; internalNote?: string; confirmPlanChange?: boolean },
): Promise<ActionResult> {
  if (!validId(requestId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await acceptRequestForCurrentTenant(requestId, input)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true, id: r.value.subscriptionId }
}

export async function rejectRequestAction(
  requestId: number,
  input: { customerMessage?: string; internalNote?: string },
): Promise<ActionResult> {
  if (!validId(requestId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await rejectRequestForCurrentTenant(requestId, input)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true }
}
