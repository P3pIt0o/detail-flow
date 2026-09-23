"use server"

/**
 * ============================================================================
 *  ACTIONS SERVEUR — CHECKOUT CLIENT (paiement d'une réservation)
 * ============================================================================
 *  Le tenant est TOUJOURS résolu depuis la requête (jamais fourni par le
 *  client). Le montant est recalculé/relu en base côté serveur. Le client
 *  transmet le bookingId ET le jeton d'accès secret de la réservation : l'id
 *  seul (incrémental, devinable) n'autorise jamais rien.
 * ============================================================================
 */

import { headers } from "next/headers"
import { resolveRequestTenant } from "@/lib/tenant"
import { createBookingCheckout } from "@/lib/payments/queries"
import { hasPublicBookingAccess } from "@/lib/booking/access"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { canUseFeature } from "@/lib/licensing/enforce"
import { withTenant } from "@/lib/tenant-link"

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
export async function startBookingCheckout(
  bookingId: number,
  accessToken: string,
  chosenType?: "deposit" | "full_payment",
): Promise<StartCheckoutResult> {
  const tenant = await resolveRequestTenant()
  if (!tenant) return { ok: false, error: "Tenant introuvable." }
  // id + jeton secret + tenant AVANT toute autre opération (ni statut de
  // paiement, ni session Stripe). Erreur identique pour tout échec.
  if (!(await hasPublicBookingAccess({ bookingId, token: accessToken, companyId: tenant.id }))) {
    return { ok: false, error: "Réservation introuvable." }
  }
  // Choix client borné aux deux valeurs connues (le mode tenant fait autorité
  // côté serveur ; ce choix n'a d'effet qu'en mode "choice").
  const safeChosen = chosenType === "deposit" || chosenType === "full_payment" ? chosenType : undefined

  // Contrôle de licence (feature online_payments) — droit d'UTILISER le
  // paiement en ligne. LEGACY (licensePlan = NULL) => autorisé (inchangé).
  // Ne modifie aucune configuration Stripe : bloque uniquement le démarrage
  // d'un NOUVEAU paiement quand la licence explicite ne l'inclut pas.
  if (!(await canUseFeature(tenant.id, "online_payments"))) {
    return { ok: false, error: "Paiements indisponibles." }
  }

  const cfg = await getCompanyPaymentConfig(tenant.id)
  if (!cfg?.stripeAccountId) return { ok: false, error: "Paiements indisponibles." }

  // Le retour Stripe atterrit sur le domaine où le tenant est porté par
  // `?tenant=<slug>` (domaine racine). Sans ce paramètre, le middleware ne pose
  // pas `x-tenant-slug`, `resolveRequestTenant()` renvoie null et la page de
  // retour tombe en 404. On reconduit donc le slug résolu CÔTÉ SERVEUR (jamais
  // un companyId/slug fourni par le navigateur). Sur un vrai sous-domaine, le
  // paramètre est simplement redondant et sans effet. Le placeholder
  // {CHECKOUT_SESSION_ID} reste intact (withTenant n'encode que la valeur tenant).
  // Le jeton d'accès (déjà validé ci-dessus) est reconduit pour que la page de
  // retour puisse afficher le récapitulatif sans jamais se fier à l'id seul.
  const returnUrl = await absoluteUrl(
    withTenant(
      `/reservation/paiement/${bookingId}/retour?session_id={CHECKOUT_SESSION_ID}&token=${encodeURIComponent(accessToken)}`,
      tenant.slug,
    ),
  )
  const res = await createBookingCheckout({ bookingId, companyId: tenant.id, returnUrl, chosenType: safeChosen })
  if (!res.ok) return { ok: false, error: res.error }
  if ("alreadyPaid" in res) return { ok: true, alreadyPaid: true }

  return { ok: true, clientSecret: res.clientSecret, connectedAccountId: cfg.stripeAccountId }
}
