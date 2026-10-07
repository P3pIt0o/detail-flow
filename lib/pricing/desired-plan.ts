/**
 * Intention commerciale d'un prospect (« je souhaite voir cette offre après
 * mon inscription »). Fichier PUR, importable client et serveur.
 *
 * Cette valeur n'accorde AUCUN droit : la licence d'un nouvel espace reste
 * `SELF_SERVICE_LICENSE_PLAN` (FREE) et ne change que via le webhook Stripe
 * Billing après un Checkout volontaire depuis /admin/abonnement.
 */

import { withTenant } from "../tenant-link"

/** Phase de lancement : seule l'intention PRO (Indépendant) est retenue. */
export const DESIRED_PLANS = ["PRO"] as const
export type DesiredPlan = (typeof DESIRED_PLANS)[number]

/** Seule PRO est retenue ; FREE, BUSINESS, ENTERPRISE et toute autre valeur → null. */
export function parseDesiredPlan(value: unknown): DesiredPlan | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === "PRO" ? raw : null
}

/** Ajoute `?plan=` à un chemin interne quand une intention valide existe. */
export function withDesiredPlan(href: string, plan: DesiredPlan | null): string {
  if (!plan) return href
  return `${href}${href.includes("?") ? "&" : "?"}plan=${plan}`
}

/**
 * Redirection après création d'espace.
 * - sans intention : redirection historique `/admin?tenant=<slug>[&start=<intent>]` ;
 * - PRO : `/admin/abonnement?tenant=<slug>&plan=PRO`.
 */
export function buildPostCreationRedirect(slug: string, intent: string, desiredPlan: DesiredPlan | null): string {
  if (desiredPlan) return withDesiredPlan(withTenant("/admin/abonnement", slug), desiredPlan)
  const params = new URLSearchParams({ tenant: slug })
  if (intent) params.set("start", intent)
  return `/admin?${params.toString()}`
}
