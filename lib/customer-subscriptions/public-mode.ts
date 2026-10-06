/**
 * Source de vérité UNIQUE (companies.customerSubscriptionPublicMode) partagée par
 * le site ET le widget. Désactiver ne touche jamais aux contrats existants.
 */
export const CUSTOMER_SUBSCRIPTION_PUBLIC_MODES = ["disabled", "request", "direct"] as const
export type CustomerSubscriptionPublicMode = (typeof CUSTOMER_SUBSCRIPTION_PUBLIC_MODES)[number]

export function parsePublicMode(value: unknown): CustomerSubscriptionPublicMode {
  return (CUSTOMER_SUBSCRIPTION_PUBLIC_MODES as readonly string[]).includes(value as string)
    ? (value as CustomerSubscriptionPublicMode)
    : "disabled"
}

/** listing = affichage dans la liste publique ; direct_link = lien explicite vers une formule. */
export type PlanPublicAccess = "listing" | "direct_link"

/**
 * public : listable + lien direct ; unlisted : lien direct uniquement ;
 * private : jamais accessible publiquement (même avec l'id). Seules les formules
 * `active` sont proposées (draft/archived refusées).
 */
export function isPlanPubliclyAccessible(
  mode: CustomerSubscriptionPublicMode,
  plan: { status: string; visibility: string },
  access: PlanPublicAccess,
): boolean {
  if (mode === "disabled") return false
  if (plan.status !== "active") return false
  if (plan.visibility === "public") return true
  if (plan.visibility === "unlisted") return access === "direct_link"
  return false
}

export const PUBLIC_MODE_LABELS: Record<CustomerSubscriptionPublicMode, string> = {
  disabled: "Désactivé",
  request: "Sur demande",
  direct: "Souscription directe",
}

/** Option widget : valeur absente → booking (anciens snippets strictement identiques). */
export const WIDGET_MODES = ["booking", "subscriptions", "both"] as const
export type WidgetMode = (typeof WIDGET_MODES)[number]
export function parseWidgetMode(value: unknown): WidgetMode {
  return (WIDGET_MODES as readonly string[]).includes(value as string) ? (value as WidgetMode) : "booking"
}

/** both : écran de choix seulement si les deux fonctions sont réellement disponibles. */
export function resolveWidgetEntry(
  mode: WidgetMode,
  available: { booking: boolean; subscriptions: boolean },
): "booking" | "subscriptions" | "choice" | "none" {
  const wantsBooking = mode !== "subscriptions"
  const wantsSubs = mode !== "booking"
  const b = wantsBooking && available.booking
  const s = wantsSubs && available.subscriptions
  if (b && s) return "choice"
  if (b) return "booking"
  if (s) return "subscriptions"
  return mode === "booking" ? "booking" : "none"
}
