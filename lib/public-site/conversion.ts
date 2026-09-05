/**
 * ============================================================================
 *  RÉSOLUTION DU MODE DE CONVERSION → MOTEUR EXISTANT (la « couture »)
 * ============================================================================
 *
 *  POINT CRITIQUE du cahier des charges : une page SEO ne doit JAMAIS être
 *  couplée en dur à un formulaire. Elle déclare seulement un `conversionMode`
 *  (par page), puis cette fonction le TRADUIT vers le moteur DetailFlow adapté.
 *
 *  Cette couche ne fait AUCUN travail métier : elle ne calcule pas de prix, ne
 *  crée pas de réservation, n'appelle pas Stripe. Elle décrit seulement QUEL
 *  moteur existant utiliser et avec quel comportement de paiement. Elle
 *  n'importe pas non plus ces moteurs (aucun couplage de bundle) : elle renvoie
 *  un descripteur que l'appelant (route/UI) branche sur l'existant.
 *
 *  Moteurs de paiement RÉELS du dépôt (cf. `lib/payments/mode.ts`) :
 *    "none" | "deposit" | "full" | "choice". On mappe ici les modes publics
 *    vers ces valeurs SANS en inventer de nouvelles.
 * ============================================================================
 */

import type { ConversionMode } from "./types"

/** Moteur métier ciblé par un mode de conversion. */
export type ConversionEngine = "custom_request" | "booking"

/**
 * Comportement de paiement attendu du moteur de réservation existant. Aligné
 * sur `lib/payments/mode.ts` (aucune valeur nouvelle). `null` = sans objet
 * (moteur « demande de devis »).
 */
export type ConversionPaymentMode = "none" | "deposit" | "full" | null

/** Descripteur résolu : dit à l'appelant quel moteur existant activer. */
export interface ConversionResolution {
  mode: ConversionMode
  engine: ConversionEngine
  paymentMode: ConversionPaymentMode
}

/**
 * Traduit un mode de conversion public vers le moteur DetailFlow correspondant.
 *
 * Spirit ACS n'emploie que `quote_request` → moteur custom_requests. Les modes
 * `booking*` sont prêts pour la future V2 des sites standards : ils pointent
 * vers le moteur de réservation EXISTANT, avec le comportement de paiement déjà
 * supporté. Aucun second moteur n'est créé.
 */
export function resolveConversion(mode: ConversionMode): ConversionResolution {
  switch (mode) {
    case "booking":
      return { mode, engine: "booking", paymentMode: "none" }
    case "booking_deposit":
      return { mode, engine: "booking", paymentMode: "deposit" }
    case "booking_full":
      return { mode, engine: "booking", paymentMode: "full" }
    case "quote_request":
    default:
      return { mode: "quote_request", engine: "custom_request", paymentMode: null }
  }
}
