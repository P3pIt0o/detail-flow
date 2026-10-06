"use server"

import { db } from "@/lib/db"
import { resolvePublicRequestTenant } from "@/lib/tenant"
import { createPublicSubscriptionRequest } from "@/lib/customer-subscriptions/requests"
import { CustomerSubscriptionError } from "@/lib/customer-subscriptions/errors"

export type SubscriptionRequestState = {
  status: "idle" | "success" | "error"
  message: string
  fields?: string[]
}

const MESSAGES: Record<string, string> = {
  PLAN_NOT_AVAILABLE: "Cette formule n'est plus disponible.",
  REQUESTS_DISABLED: "Les demandes de formule ne sont pas ouvertes pour le moment.",
  RATE_LIMITED: "Trop de demandes envoyées. Réessayez plus tard.",
  CONFLICT: "Cette demande a déjà été envoyée avec d'autres informations. Rechargez la page.",
}

/**
 * Le tenant est TOUJOURS résolu côté serveur (host / en-tête middleware),
 * jamais depuis le formulaire. Même backend pour le site et le widget.
 */
export async function submitSubscriptionRequest(
  _prev: SubscriptionRequestState,
  formData: FormData,
): Promise<SubscriptionRequestState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim()
  if (get("company_website")) return { status: "success", message: "Merci, votre demande a bien été envoyée." }

  const tenant = await resolvePublicRequestTenant()
  if (!tenant) return { status: "error", message: "Service indisponible." }

  try {
    await createPublicSubscriptionRequest(db, tenant.id, {
      planId: Number(get("planId")),
      customer: { name: get("name"), email: get("email"), phone: get("phone") || undefined },
      vehicle: { brand: get("brand"), model: get("model"), plate: get("plate") || undefined },
      message: get("message") || undefined,
      submissionId: get("submissionId"),
    })
    return {
      status: "success",
      message: "Merci, votre demande a bien été envoyée. Le professionnel vous recontacte pour la valider.",
    }
  } catch (err) {
    if (err instanceof CustomerSubscriptionError) {
      const fields = err.issues.map((i) => i.field).filter(Boolean) as string[]
      return {
        status: "error",
        message: MESSAGES[err.code] ?? (fields.length ? "Vérifiez les champs signalés." : "La demande n'a pas pu être envoyée."),
        fields,
      }
    }
    console.error("[subscriptions] public request failed", err instanceof Error ? err.message : err)
    return { status: "error", message: "La demande n'a pas pu être envoyée. Réessayez." }
  }
}
