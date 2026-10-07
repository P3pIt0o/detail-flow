/**
 * Intention commerciale d'un prospect (« je souhaite voir cette offre après
 * mon inscription »). Fichier PUR, importable client et serveur.
 *
 * Cette valeur n'accorde AUCUN droit : la licence d'un nouvel espace reste
 * `SELF_SERVICE_LICENSE_PLAN` (FREE) et ne change que via le webhook Stripe
 * Billing après un Checkout volontaire depuis /admin/abonnement.
 */

import { withTenant } from "../tenant-link"

export const DESIRED_PLANS = ["PRO", "BUSINESS"] as const
export type DesiredPlan = (typeof DESIRED_PLANS)[number]

/** Seules PRO et BUSINESS sont retenues ; FREE, ENTERPRISE et toute autre valeur → null. */
export function parseDesiredPlan(value: unknown): DesiredPlan | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === "PRO" || raw === "BUSINESS" ? raw : null
}

/** Ajoute `?plan=` à un chemin interne quand une intention valide existe. */
export function withDesiredPlan(href: string, plan: DesiredPlan | null): string {
  if (!plan) return href
  return `${href}${href.includes("?") ? "&" : "?"}plan=${plan}`
}

/**
 * Redirection après création d'espace.
 * - sans intention : redirection historique `/admin?tenant=<slug>[&start=<intent>]` ;
 * - PRO/BUSINESS : `/admin/abonnement?tenant=<slug>&plan=<plan>`.
 */
export function buildPostCreationRedirect(slug: string, intent: string, desiredPlan: DesiredPlan | null): string {
  if (desiredPlan) return withDesiredPlan(withTenant("/admin/abonnement", slug), desiredPlan)
  const params = new URLSearchParams({ tenant: slug })
  if (intent) params.set("start", intent)
  return `/admin?${params.toString()}`
}
