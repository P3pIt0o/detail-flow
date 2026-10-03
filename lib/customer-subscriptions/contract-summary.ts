import { computeEarliestCancellationAt, computePrepaidTotalCents, type SubscriptionTimeline } from "./contract"
import { nextBillingBoundaryAfter, type BillingInterval, type RenewalMode } from "./dates"

/**
 * INVARIANT SNAPSHOTS : après création, les modalités d'un contrat viennent
 * EXCLUSIVEMENT des colonnes *Snapshot du contrat. Ce module ne lit jamais
 * maintenance_plans : modifier une formule ne change pas un ancien abonnement.
 * Aucune commission DetailFlow ni frais Stripe : objet destiné au client.
 */
export type ContractSubscriptionInput = SubscriptionTimeline & {
  id: number
  planNameSnapshot: string
  priceCentsSnapshot: number
  currency: string
  includedUsesPerCycleSnapshot: number
  commitmentUnitSnapshot: string
  commitmentCountSnapshot: number
  renewalNoticeDaysSnapshot: number | null
  prepaidBillingCyclesSnapshot: number | null
  includedServiceNameSnapshot: string | null
  initialCleaningRequiredSnapshot: boolean
  initialServiceNameSnapshot: string | null
  initialServicePriceCentsSnapshot: number | null
  currentTermStartedAt: Date | null
  activatedAt?: Date | null
}

export type StopRule =
  | { kind: "next_billing_date"; earliestAt: Date | null }
  | { kind: "end_of_commitment"; commitmentEndsAt: Date | null }
  | { kind: "end_of_prepaid_period"; prepaidUntil: Date | null }
  | { kind: "ends_automatically"; endsAt: Date | null }

export type SubscriptionContractSummary = {
  subscriptionId: number
  planName: string
  includedServiceName: string | null
  usesPerCycle: number
  price: { amountCents: number; currency: string }
  interval: BillingInterval
  paymentMode: "recurring" | "prepaid"
  /** Paiement initial du parcours (nettoyage initial et/ou première échéance / prépayé). */
  dueToday: { amountCents: number; parts: Array<{ label: "initial_cleaning" | "first_period" | "prepaid"; amountCents: number }> }
  /** Montant des échéances suivantes ; null si aucune échéance automatique ultérieure. */
  followingPaymentCents: number | null
  commitment: { unit: string; count: number; endsAt: Date | null; inProgress: boolean }
  renewal: { mode: RenewalMode; optedOut: boolean; noticeDays: number | null }
  initialCleaning: { required: boolean; serviceName: string | null; priceCents: number | null }
  activatedAt: Date | null
  nextBillingAt: Date | null
  /** Fin de la période couverte par la prochaine échéance. */
  nextBillingCoversUntil: Date | null
  termEndsAt: Date | null
  prepaidUntil: Date | null
  cancelAt: Date | null
  /** Le contrat s'arrête-t-il sans action supplémentaire ? */
  endsAutomatically: boolean
  stop: StopRule
  status: string
}

function intervalOf(s: SubscriptionTimeline): BillingInterval {
  return { unit: s.billingIntervalUnitSnapshot as BillingInterval["unit"], count: s.billingIntervalCountSnapshot }
}

/** Prochaine échéance automatique réelle (null si prépayé, terminé, ou après la fin programmée). */
export function computeNextBillingAt(s: SubscriptionTimeline, now: Date): Date | null {
  if (s.paymentMode !== "recurring" || !s.billingAnchorAt) return null
  if (!["active", "cancel_scheduled", "past_due"].includes(s.status)) return null
  const next = nextBillingBoundaryAfter(s.billingAnchorAt, intervalOf(s), now)
  const finalTerm = s.renewalModeSnapshot === "none" || s.renewalOptOutAt !== null
  const hardStop = [s.cancelAt, finalTerm ? s.currentTermEndsAt : null].filter((d): d is Date => d instanceof Date)
  if (hardStop.some((d) => next.getTime() >= d.getTime())) return null
  return next
}

export function buildSubscriptionContractSummary(s: ContractSubscriptionInput, now: Date = new Date()): SubscriptionContractSummary {
  const interval = intervalOf(s)
  const paymentMode = s.paymentMode === "prepaid" ? "prepaid" : "recurring"
  const prepaidTotal =
    paymentMode === "prepaid" && s.prepaidBillingCyclesSnapshot ? computePrepaidTotalCents(s.priceCentsSnapshot, s.prepaidBillingCyclesSnapshot) : null
  const parts: SubscriptionContractSummary["dueToday"]["parts"] = []
  if (s.initialCleaningRequiredSnapshot && s.initialServicePriceCentsSnapshot != null) {
    parts.push({ label: "initial_cleaning", amountCents: s.initialServicePriceCentsSnapshot })
  }
  if (prepaidTotal != null) parts.push({ label: "prepaid", amountCents: prepaidTotal })
  else parts.push({ label: "first_period", amountCents: s.priceCentsSnapshot })

  const nextBillingAt = computeNextBillingAt(s, now)
  const commitmentEndsAt = s.commitmentUnitSnapshot === "none" ? null : s.currentTermEndsAt
  const inProgress = !!commitmentEndsAt && commitmentEndsAt.getTime() > now.getTime()
  const optedOut = s.renewalOptOutAt !== null
  const endsAutomatically = paymentMode === "prepaid" || s.renewalModeSnapshot === "none" || optedOut || s.cancelAt !== null

  let stop: StopRule
  if (paymentMode === "prepaid") stop = { kind: "end_of_prepaid_period", prepaidUntil: s.prepaidUntil }
  else if (s.renewalModeSnapshot === "none" && s.commitmentUnitSnapshot !== "none") stop = { kind: "ends_automatically", endsAt: s.currentTermEndsAt }
  else if (inProgress) stop = { kind: "end_of_commitment", commitmentEndsAt }
  else {
    let earliest: Date | null = null
    try {
      earliest = computeEarliestCancellationAt(s, now)
    } catch {
      earliest = null
    }
    stop = { kind: "next_billing_date", earliestAt: earliest }
  }

  return {
    subscriptionId: s.id,
    planName: s.planNameSnapshot,
    includedServiceName: s.includedServiceNameSnapshot,
    usesPerCycle: s.includedUsesPerCycleSnapshot,
    price: { amountCents: s.priceCentsSnapshot, currency: s.currency },
    interval,
    paymentMode,
    dueToday: { amountCents: parts.reduce((a, p) => a + p.amountCents, 0), parts },
    followingPaymentCents: paymentMode === "recurring" ? s.priceCentsSnapshot : null,
    commitment: { unit: s.commitmentUnitSnapshot, count: s.commitmentCountSnapshot, endsAt: commitmentEndsAt, inProgress },
    renewal: { mode: s.renewalModeSnapshot as RenewalMode, optedOut, noticeDays: s.renewalNoticeDaysSnapshot },
    initialCleaning: {
      required: s.initialCleaningRequiredSnapshot,
      serviceName: s.initialServiceNameSnapshot,
      priceCents: s.initialServicePriceCentsSnapshot,
    },
    activatedAt: s.activatedAt ?? null,
    nextBillingAt,
    nextBillingCoversUntil: nextBillingAt ? nextBillingBoundaryAfter(nextBillingAt, interval, nextBillingAt) : null,
    termEndsAt: s.currentTermEndsAt,
    prepaidUntil: s.prepaidUntil,
    cancelAt: s.cancelAt,
    endsAutomatically,
    stop,
    status: s.status,
  }
}

/* ------------------------------ Libellés FR ------------------------------ */

export function formatMoney(cents: number, currency = "eur"): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
}

export function formatIntervalFr(i: BillingInterval): string {
  if (i.unit === "month") return i.count === 1 ? "par mois" : `tous les ${i.count} mois`
  return i.count === 1 ? "par semaine" : `toutes les ${i.count} semaines`
}

export function formatDateFr(d: Date | null | undefined, timeZone = "Europe/Paris"): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone }).format(d)
}

export function formatCommitmentFr(unit: string, count: number): string {
  if (unit === "none" || count <= 0) return "Sans engagement"
  if (unit === "month") return `Engagement : ${count} mois`
  return `Engagement : ${count} échéance${count > 1 ? "s" : ""}`
}

export function formatRenewalFr(mode: string, optedOut = false): string {
  if (optedOut) return "Ne sera pas renouvelée"
  if (mode === "same_term") return "Renouvellement pour la même durée"
  if (mode === "open_ended") return "Puis sans engagement"
  return "Se termine automatiquement"
}

const STATUS_FR: Record<string, string> = {
  pending_initial_cleaning: "Nettoyage initial en attente",
  pending_payment: "Paiement en attente",
  active: "Actif",
  cancel_scheduled: "Arrêt programmé",
  past_due: "Paiement à régulariser",
  suspended: "Suspendu",
  cancelled: "Terminé",
  expired: "Terminé",
  ended: "Terminé",
}
export function formatStatusFr(status: string): string {
  return STATUS_FR[status] ?? "En cours de traitement"
}
