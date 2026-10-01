/**
 * Calculs de dates PURS, exclusivement en UTC.
 *  - week/N = N × 7 jours exacts (4 semaines = 28 jours, JAMAIS « 1 mois ») ;
 *  - month/N = N mois calendaires, jour borné à la fin du mois (31/01 + 1 mois = 28 ou 29/02).
 * Les frontières sont toujours recalculées depuis l'ANCRE (pas d'additions
 * successives) : aucune dérive après un mois court.
 */

export type BillingIntervalUnit = "week" | "month"
export type CommitmentUnit = "none" | "month" | "billing_cycle"
export type RenewalMode = "none" | "same_term" | "open_ended"

export type BillingInterval = { unit: BillingIntervalUnit; count: number }
export type Commitment = { unit: CommitmentUnit; count: number }

const DAY_MS = 86_400_000
const MAX_BOUNDARY_INDEX = 10_000

function assertDate(d: Date): void {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new RangeError("INVALID_DATE")
}

function assertInterval(interval: BillingInterval): void {
  if ((interval.unit !== "week" && interval.unit !== "month") || !Number.isInteger(interval.count) || interval.count <= 0) {
    throw new RangeError("INVALID_INTERVAL")
  }
}

function daysInMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Ajoute `months` mois calendaires (UTC), jour borné à la fin du mois cible. */
export function addMonthsUTC(date: Date, months: number): Date {
  assertDate(date)
  const total = date.getUTCMonth() + months
  const year = date.getUTCFullYear() + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonthUTC(year, month))
  return new Date(
    Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  )
}

/** k-ième frontière de facturation depuis l'ancre (k = 0 → l'ancre). */
export function billingBoundary(anchor: Date, interval: BillingInterval, k: number): Date {
  assertDate(anchor)
  assertInterval(interval)
  if (!Number.isInteger(k) || k < 0) throw new RangeError("INVALID_INDEX")
  if (interval.unit === "week") return new Date(anchor.getTime() + k * interval.count * 7 * DAY_MS)
  return addMonthsUTC(anchor, k * interval.count)
}

/** Ajoute `periods` périodes de facturation à `date`. */
export function addBillingInterval(date: Date, interval: BillingInterval, periods = 1): Date {
  return billingBoundary(date, interval, periods)
}

/** Plus petit index k tel que boundary(k) >= at (k >= 0). */
export function boundaryIndexAtOrAfter(anchor: Date, interval: BillingInterval, at: Date): number {
  assertDate(at)
  if (at.getTime() <= anchor.getTime()) return 0
  let k: number
  if (interval.unit === "week") {
    k = Math.ceil((at.getTime() - anchor.getTime()) / (interval.count * 7 * DAY_MS))
  } else {
    const months =
      (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (at.getUTCMonth() - anchor.getUTCMonth())
    k = Math.max(0, Math.floor(months / interval.count) - 1)
  }
  // Ajustement exact (bornes de fin de mois, arrondis) ; au plus quelques itérations.
  while (k > 0 && billingBoundary(anchor, interval, k - 1).getTime() >= at.getTime()) k--
  while (billingBoundary(anchor, interval, k).getTime() < at.getTime()) {
    k++
    if (k > MAX_BOUNDARY_INDEX) throw new RangeError("BOUNDARY_OUT_OF_RANGE")
  }
  return k
}

/** Première frontière de facturation >= `at`. */
export function nextBillingBoundary(anchor: Date, interval: BillingInterval, at: Date): Date {
  return billingBoundary(anchor, interval, boundaryIndexAtOrAfter(anchor, interval, at))
}

/** Première frontière STRICTEMENT postérieure à `at`. */
export function nextBillingBoundaryAfter(anchor: Date, interval: BillingInterval, at: Date): Date {
  return nextBillingBoundary(anchor, interval, new Date(at.getTime() + 1))
}

/**
 * Fin MINIMALE d'engagement (null = sans engagement).
 *  - month/N : N mois calendaires ;
 *  - billing_cycle/N : N périodes de facturation.
 */
export function computeMinimumCommitmentEnd(
  termStart: Date,
  interval: BillingInterval,
  commitment: Commitment,
): Date | null {
  assertDate(termStart)
  if (commitment.unit === "none") return null
  if (!Number.isInteger(commitment.count) || commitment.count <= 0) throw new RangeError("INVALID_COMMITMENT")
  if (commitment.unit === "month") return addMonthsUTC(termStart, commitment.count)
  return billingBoundary(termStart, interval, commitment.count)
}

export type TermComputation = {
  termStart: Date
  /** Fin minimale contractuelle (ex. +6 mois calendaires). */
  minimumEnd: Date
  /** Fin réelle = 1ʳᵉ frontière de facturation >= fin minimale. */
  termEnd: Date
  /** Nombre d'échéances dans le terme (6 mois en 4 semaines → 7). */
  billingCycles: number
}

/**
 * Terme réel aligné sur une frontière de facturation : on ne coupe jamais une
 * période déjà facturée au milieu. null = sans engagement.
 */
export function computeActualTermEnd(
  termStart: Date,
  interval: BillingInterval,
  commitment: Commitment,
): TermComputation | null {
  const minimumEnd = computeMinimumCommitmentEnd(termStart, interval, commitment)
  if (!minimumEnd) return null
  const billingCycles = boundaryIndexAtOrAfter(termStart, interval, minimumEnd)
  return { termStart, minimumEnd, termEnd: billingBoundary(termStart, interval, billingCycles), billingCycles }
}

export type NextRenewal =
  | { kind: "none" }
  | { kind: "open_ended"; startsAt: Date }
  | { kind: "same_term"; term: TermComputation }

/** Terme suivant à la fin du terme courant, selon le mode de renouvellement figé. */
export function computeNextRenewalTerm(input: {
  currentTermEndsAt: Date
  interval: BillingInterval
  commitment: Commitment
  renewalMode: RenewalMode
}): NextRenewal {
  if (input.renewalMode === "none") return { kind: "none" }
  if (input.renewalMode === "open_ended") return { kind: "open_ended", startsAt: input.currentTermEndsAt }
  const term = computeActualTermEnd(input.currentTermEndsAt, input.interval, input.commitment)
  if (!term) return { kind: "none" }
  return { kind: "same_term", term }
}

/** Nombre moyen d'échéances par an (affichage : « environ 13 par an »). */
export function approximateBillingsPerYear(interval: BillingInterval): number {
  assertInterval(interval)
  return interval.unit === "week" ? Math.round(52.1775 / interval.count) : Math.round(12 / interval.count)
}
