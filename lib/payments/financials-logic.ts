/**
 * Logique PURE des données financières réelles d'un paiement Stripe Connect
 * (Direct Charge). Aucune base, aucun réseau.
 *
 * Source de vérité : la BalanceTransaction de la Charge, lue dans le contexte du
 * compte connecté. Aucun frais n'est jamais estimé.
 *
 *  - providerFeeAmountCents = frais Stripe UNIQUEMENT (fee_details hors
 *    `application_fee`) → la commission DetailFlow n'est jamais comptée deux fois.
 *  - netAmountCents = `balance_transaction.net` tel que retourné par Stripe :
 *    snapshot du NET DU PAIEMENT INITIAL. Un remboursement ne le modifie jamais
 *    (les remboursements vivent dans `refunds` + `payments.refundedAmountCents`).
 */

export type StripeFeeDetailLike = { amount?: number | null; type?: string | null }

export type StripeBalanceTransactionLike = {
  id?: string | null
  amount?: number | null
  currency?: string | null
  fee?: number | null
  net?: number | null
  fee_details?: StripeFeeDetailLike[] | null
}

/** Statuts pour lesquels le paiement a réellement été encaissé. */
export const SETTLED_PAYMENT_STATUSES = ["paid", "partially_refunded", "refunded"] as const

export function isSettledPaymentStatus(status: string | null | undefined): boolean {
  return (SETTLED_PAYMENT_STATUSES as readonly string[]).includes(status ?? "")
}

/** Le compte connecté utilisé doit être EXACTEMENT celui du tenant (non vide). */
export function isExpectedConnectedAccount(expected: string | null | undefined, given: string | null | undefined): boolean {
  return typeof expected === "string" && expected.length > 0 && expected === given
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null
}

/**
 * Lit `latest_charge` (expandé) d'un PaymentIntent. Renvoie null si la Charge ou
 * sa BalanceTransaction n'est pas (encore) disponible sous forme d'objet.
 */
export function extractChargeAndBalanceTransaction(
  paymentIntent: unknown,
): { chargeId: string | null; balanceTransaction: StripeBalanceTransactionLike } | null {
  const charge = asObject(asObject(paymentIntent)?.latest_charge)
  if (!charge) return null
  const bt = asObject(charge.balance_transaction)
  if (!bt) return null
  return {
    chargeId: typeof charge.id === "string" ? charge.id : null,
    balanceTransaction: bt as StripeBalanceTransactionLike,
  }
}

export type StripeFinancials = {
  providerFeeAmountCents: number
  netAmountCents: number
  applicationFeeAmountCents: number
  balanceTransactionId: string | null
}

export type StripeFinancialsResult =
  | ({ ok: true } & StripeFinancials)
  | { ok: false; reason: "invalid" | "currency_mismatch" | "amount_mismatch" | "fee_details_missing" }

/**
 * Sépare frais Stripe et application fee DetailFlow depuis `fee_details`, et
 * reprend `net` tel quel. Refuse (sans rien estimer) toute donnée incohérente
 * avec le paiement local (devise / montant brut).
 */
export function computeStripeFinancials(
  bt: StripeBalanceTransactionLike,
  payment: { grossAmountCents: number; currency: string },
): StripeFinancialsResult {
  if (!isInt(bt.amount) || !isInt(bt.fee) || !isInt(bt.net) || bt.fee < 0) return { ok: false, reason: "invalid" }
  if ((bt.currency ?? "").toLowerCase() !== payment.currency.toLowerCase()) {
    return { ok: false, reason: "currency_mismatch" }
  }
  if (bt.amount !== payment.grossAmountCents) return { ok: false, reason: "amount_mismatch" }

  const details = Array.isArray(bt.fee_details) ? bt.fee_details : null
  // Frais > 0 sans détail : impossible de séparer frais Stripe / commission sans estimer.
  if (!details || (details.length === 0 && bt.fee > 0)) {
    if (bt.fee === 0) {
      return { ok: true, providerFeeAmountCents: 0, netAmountCents: bt.net, applicationFeeAmountCents: 0, balanceTransactionId: bt.id ?? null }
    }
    return { ok: false, reason: "fee_details_missing" }
  }

  let applicationFee = 0
  let providerFee = 0
  for (const d of details) {
    if (!isInt(d.amount)) return { ok: false, reason: "invalid" }
    if (d.type === "application_fee") applicationFee += d.amount
    else providerFee += d.amount // stripe_fee, tax (TVA sur frais), passthrough…
  }
  if (applicationFee + providerFee !== bt.fee || providerFee < 0) return { ok: false, reason: "invalid" }

  return {
    ok: true,
    providerFeeAmountCents: providerFee,
    netAmountCents: bt.net,
    applicationFeeAmountCents: applicationFee,
    balanceTransactionId: bt.id ?? null,
  }
}

/**
 * Idempotence : les valeurs persistées sont un snapshot. On ne complète que les
 * champs NULL ; des valeurs déjà présentes et différentes ne sont JAMAIS écrasées.
 */
export function planFinancialsUpdate(
  existing: { providerFeeAmountCents: number | null; netAmountCents: number | null },
  next: { providerFeeAmountCents: number; netAmountCents: number },
): "update" | "noop" | "conflict" {
  const feeOk = existing.providerFeeAmountCents == null || existing.providerFeeAmountCents === next.providerFeeAmountCents
  const netOk = existing.netAmountCents == null || existing.netAmountCents === next.netAmountCents
  if (!feeOk || !netOk) return "conflict"
  if (existing.providerFeeAmountCents != null && existing.netAmountCents != null) return "noop"
  return "update"
}
