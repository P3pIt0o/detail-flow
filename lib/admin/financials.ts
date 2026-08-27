/**
 * Helper PUR de calcul des indicateurs financiers mensuels du tableau de bord.
 *
 * Aucune dépendance base/serveur : les données sont fournies par l'appelant
 * (lecture SQL scopée companyId). Ceci rend la SÉMANTIQUE financière testable
 * unitairement, sans base — c'est la source de vérité des règles suivantes.
 *
 * Séparation stricte (jamais mélangées dans un même « CA ») :
 *  - `invoicedRevenueCents` : CA FACTURÉ = factures émises − avoirs (logique
 *    existante, calculée en amont, reprise telle quelle).
 *  - `collectedGrossCents`  : ENCAISSÉ BRUT = paiements réellement payés,
 *    rattachés à `paidAt`, montant brut AVANT frais Stripe.
 *  - `refundedCents`        : remboursements réellement exécutés, rattachés à
 *    `refundedAt` (donc au mois du remboursement, pas du paiement initial).
 *  - `collectedNetCents`    : encaissé net des remboursements, TOUJOURS brut de
 *    frais Stripe (les frais sont une dépense séparée, non déduite du CA brut).
 *  - `paymentFeesCents`     : NON exposé dans ce lot → `null` (jamais 0 : une
 *    valeur inconnue ne doit pas être présentée comme nulle en montant).
 *
 * Les montants sont en CENTIMES entiers (aucun flottant).
 */

/** Statuts DetailFlow considérés comme « argent réellement encaissé ». */
export const COLLECTED_STATUSES = ["paid", "partially_refunded", "refunded"] as const
export type CollectedStatus = (typeof COLLECTED_STATUSES)[number]

/** Ligne de paiement minimale nécessaire au calcul (déjà scopée par tenant). */
export type PaymentRow = {
  grossAmountCents: number
  refundedAmountCents: number
  status: string
  /** Date réelle d'encaissement. */
  paidAt: Date | string | null
  /** Date réelle du remboursement (si exécuté). */
  refundedAt: Date | string | null
}

export type MonthlyFinancials = {
  invoicedRevenueCents: number
  collectedGrossCents: number
  refundedCents: number
  collectedNetCents: number
  productCostsCents: number
  /** Frais de paiement : source fiable à venir → null tant qu'indisponible. */
  paymentFeesCents: number | null
}

/** Normalise une date (Date | ISO string) en `YYYY-MM-DD`, ou null. */
function toISODate(d: Date | string | null): string | null {
  if (d == null) return null
  if (typeof d === "string") {
    // Accepte "YYYY-MM-DD" ou une ISO complète ; on garde les 10 premiers chars.
    return d.length >= 10 ? d.slice(0, 10) : null
  }
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** true si `date` ∈ [start, end] (bornes incluses, comparaison lexicographique ISO). */
export function isWithin(date: Date | string | null, start: string, end: string): boolean {
  const iso = toISODate(date)
  if (iso == null) return false
  return iso >= start && iso <= end
}

const collectedStatusSet = new Set<string>(COLLECTED_STATUSES)

/**
 * Calcule les indicateurs mensuels à partir des lignes de paiement du tenant.
 *
 * Anti double comptage : chaque paiement est UNE ligne (unicité provider +
 * externalPaymentId en base) — un webhook rejoué ne crée pas de ligne
 * supplémentaire, donc n'augmente jamais le total. La création d'une facture ou
 * la fin d'un rendez-vous n'entrent JAMAIS ici (sources totalement distinctes).
 */
export function computeMonthlyFinancials(input: {
  invoicedRevenueCents: number
  productCostsCents: number
  payments: PaymentRow[]
  /** Bornes de mois `YYYY-MM-DD` (résolues par l'appelant). */
  start: string
  end: string
}): MonthlyFinancials {
  const { invoicedRevenueCents, productCostsCents, payments, start, end } = input

  let collectedGrossCents = 0
  let refundedCents = 0

  for (const p of payments) {
    // Encaissé brut : statut réellement payé + date d'encaissement dans le mois.
    if (collectedStatusSet.has(p.status) && isWithin(p.paidAt, start, end)) {
      collectedGrossCents += p.grossAmountCents
    }
    // Remboursement : rattaché à sa PROPRE date d'exécution (peut tomber un autre
    // mois que l'encaissement initial). Déduit une seule fois.
    if (p.refundedAmountCents > 0 && isWithin(p.refundedAt, start, end)) {
      refundedCents += p.refundedAmountCents
    }
  }

  return {
    invoicedRevenueCents,
    collectedGrossCents,
    refundedCents,
    collectedNetCents: collectedGrossCents - refundedCents,
    productCostsCents,
    paymentFeesCents: null,
  }
}
