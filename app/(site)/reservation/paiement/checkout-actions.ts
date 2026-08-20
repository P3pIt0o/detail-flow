"use server"

/**
 * ============================================================================
 *  ACTIONS SERVEUR — CHECKOUT CLIENT (paiement d'une réservation)
 * ============================================================================
 *  Le tenant est TOUJOURS résolu depuis la requête (jamais fourni par le
 *  client). Le montant est recalculé/relu en base côté serveur. Le client ne
 *  transmet que le bookingId, qui est borné au tenant courant.
 * ============================================================================
 */

import { headers } from "next/headers"
import { resolveRequestTenant } from "@/lib/tenant"
import { createBookingCheckout, bookingHasPaidPayment } from "@/lib/payments/queries"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { canUseFeature } from "@/lib/licensing/enforce"

async function absoluteUrl(path: string): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}${path}`
}

export type StartCheckoutResult =
  | { ok: true; clientSecret: string; connectedAccountId: string }
  | { ok: true; alreadyPaid: true }
  | { ok: false; error: string }

/**
 * Démarre (ou reprend) la session de paiement embarquée pour une réservation.
 * Renvoie le clientSecret Stripe + le compte connecté (nécessaire à Stripe.js
 * en mode Connect). Idempotent : si déjà payé, on le signale.
 */
export async function startBookingCheckout(bookingId: number): Promise<StartCheckoutResult> {
  const tenant = await resolveRequestTenant()
  if (!tenant) return { ok: false, error: "Tenant introuvable." }
  if (!Number.isInteger(bookingId) || bookingId <= 0) return { ok: false, error: "Réservation invalide." }

  // Contrôle de licence (feature online_payments) — droit d'UTILISER le
  // paiement en ligne. LEGACY (licensePlan = NULL) => autorisé (inchangé).
  // Ne modifie aucune configuration Stripe : bloque uniquement le démarrage
  // d'un NOUVEAU paiement quand la licence explicite ne l'inclut pas.
  if (!(await canUseFeature(tenant.id, "online_payments"))) {
    return { ok: false, error: "Paiements indisponibles." }
  }

  const cfg = await getCompanyPaymentConfig(tenant.id)
  if (!cfg?.stripeAccountId) return { ok: false, error: "Paiements indisponibles." }

  const returnUrl = await absoluteUrl(
    `/reservation/paiement/${bookingId}/retour?session_id={CHECKOUT_SESSION_ID}`,
  )
  const res = await createBookingCheckout({ bookingId, companyId: tenant.id, returnUrl })
  if (!res.ok) return { ok: false, error: res.error }
  if ("alreadyPaid" in res) return { ok: true, alreadyPaid: true }

  return { ok: true, clientSecret: res.clientSecret, connectedAccountId: cfg.stripeAccountId }
}

/** Statut de paiement d'une réservation (borné au tenant). */
export async function isBookingPaid(bookingId: number): Promise<boolean> {
  const tenant = await resolveRequestTenant()
  if (!tenant) return false
  return bookingHasPaidPayment(bookingId, tenant.id)
}
