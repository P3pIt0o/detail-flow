"use server"

import { revalidatePath } from "next/cache"
import {
  acceptRequestForCurrentTenant,
  archivePlanForCurrentTenant,
  createPlanForCurrentTenant,
  decideEarlyCancellationForCurrentTenant,
  rejectRequestForCurrentTenant,
  resendPaymentLinkForCurrentTenant,
  markUseCompletedForCurrentTenant,
  setPublicModeForCurrentTenant,
  undoUseCompletedForCurrentTenant,
  updatePlanForCurrentTenant,
} from "@/lib/customer-subscriptions/service"
import { toPlanConfigInput, wizardToPlanConfigInput, type PlanFormState, type WizardFormState } from "@/lib/customer-subscriptions/plan-form"
import type { UsageView } from "@/lib/customer-subscriptions/engine"
import { errorMessage } from "@/lib/customer-subscriptions/admin-labels"

export type ActionResult = { ok: true; id?: number; warning?: string } | { ok: false; message: string; planChanged?: boolean }

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

/** Formulaire en 3 étapes (L27) : même retraduction serveur, aucune valeur technique du navigateur. */
export async function saveWizardPlanAction(planId: number | null, form: WizardFormState): Promise<ActionResult> {
  if (planId !== null && !validId(planId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const input = wizardToPlanConfigInput(form)
  const r = planId === null ? await createPlanForCurrentTenant(input) : await updatePlanForCurrentTenant(planId, input)
  if (!r.ok) return fail(r)
  revalidatePath(BASE)
  return { ok: true, id: r.value.planId }
}

export type UseActionResult =
  | { ok: true; outcome: "completed" | "stale" | "undone"; useId: number | null; usage: { total: number; remaining: number; periodEndsAt: string; lastCompletedUseId: number | null; lastCompletedAt: string | null } | null }
  | { ok: false; message: string }

const serializeUsage = (u: UsageView | null) =>
  u ? { total: u.total, remaining: u.remaining, periodEndsAt: u.periodEndsAt.toISOString(), lastCompletedUseId: u.lastCompleted?.useId ?? null, lastCompletedAt: u.lastCompleted?.completedAt.toISOString() ?? null } : null

/** Le tenant vient de la session ; l'abonnement est re-vérifié dans le tenant par le moteur. */
export async function markUseCompletedAction(subscriptionId: number, expectedRemaining: number): Promise<UseActionResult> {
  if (!validId(subscriptionId) || !Number.isInteger(expectedRemaining) || expectedRemaining < 0) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await markUseCompletedForCurrentTenant(subscriptionId, expectedRemaining)
  if (!r.ok) return { ok: false, message: errorMessage(r.code) }
  revalidatePath(`${BASE}/abonnes/${subscriptionId}`)
  return { ok: true, outcome: r.value.outcome, useId: r.value.useId, usage: serializeUsage(r.value.usage) }
}

export async function undoUseCompletedAction(subscriptionId: number, useId: number): Promise<UseActionResult> {
  if (!validId(subscriptionId) || !validId(useId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await undoUseCompletedForCurrentTenant(subscriptionId, useId)
  if (!r.ok) return { ok: false, message: errorMessage(r.code) }
  revalidatePath(`${BASE}/abonnes/${subscriptionId}`)
  return { ok: true, outcome: "undone", useId: null, usage: serializeUsage(r.value.usage) }
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
  const mail = r.value.paymentLinkEmail
  const warning =
    mail === "failed"
      ? "Abonnement créé, mais l’email de paiement n’a pas pu être envoyé. Utilisez « Renvoyer le lien de paiement » sur la fiche."
      : mail === "disabled"
        ? "Abonnement créé. L’envoi d’emails clients est désactivé dans cet environnement : utilisez « Renvoyer le lien de paiement » une fois activé."
        : undefined
  return { ok: true, id: r.value.subscriptionId, warning }
}

export async function resendPaymentLinkAction(subscriptionId: number): Promise<ActionResult> {
  if (!validId(subscriptionId)) return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  const r = await resendPaymentLinkForCurrentTenant(subscriptionId)
  if (!r.ok) return fail(r)
  revalidatePath(`${BASE}/abonnes/${subscriptionId}`)
  if (r.value.paymentLinkEmail !== "sent") return { ok: false, message: "Le lien n’a pas pu être envoyé. Réessayez." }
  return { ok: true, id: subscriptionId }
}

export type EarlyCancellationActionResult =
  | { ok: true; providerPending: boolean }
  | { ok: false; message: string }

export async function decideEarlyCancellationAction(
  cancellationRequestId: number,
  decision: string,
  input: { customerMessage?: string; internalNote?: string },
): Promise<EarlyCancellationActionResult> {
  if (!validId(cancellationRequestId) || (decision !== "approved" && decision !== "rejected")) {
    return { ok: false, message: errorMessage("INVALID_SUBMISSION") }
  }
  const r = await decideEarlyCancellationForCurrentTenant(cancellationRequestId, decision, {
    customerMessage: typeof input?.customerMessage === "string" ? input.customerMessage : undefined,
    internalNote: typeof input?.internalNote === "string" ? input.internalNote : undefined,
  })
  if (!r.ok) return { ok: false, message: errorMessage(r.code) }
  revalidatePath(BASE, "layout")
  return { ok: true, providerPending: r.value.provider.status === "pending_retry" }
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
