import "server-only"
import type { Pool, PoolClient } from "pg"
import { pool as defaultPool } from "@/lib/db"
import {
  computeCappedPlatformFeeCents,
  getBusinessMonthKey,
  resolveCommercialCommission,
  type ResolvedCommission,
} from "@/lib/billing/commercial-rules"
import { buildCheckoutAttemptKey, computeRefundReleaseDeltaCents } from "./platform-fee-ledger-logic"

/**
 * Registre des commissions Stripe Connect plafonnées par mois civil.
 *
 * Invariants :
 *   - toute réservation verrouille la ligne (companyId, monthKey) du compteur
 *     (SELECT ... FOR UPDATE) → deux paiements concurrents d'un même tenant
 *     sont sérialisés et le plafond n'est jamais dépassé ;
 *   - chaque réservation est tracée dans platform_fee_reservations avec son
 *     mois ORIGINAL ; toute libération s'y rattache ;
 *   - libérer = transition `reserved → released` gardée par le statut → une
 *     seule décrémentation, jamais sous 0 ;
 *   - ordre des verrous : réservation puis compteur (jamais l'inverse sur une
 *     réservation existante) → aucun interblocage.
 *
 * `companyId` provient TOUJOURS du contexte serveur (tenant résolu).
 */

export type LedgerDeps = { pool?: Pool }

export type PlatformFeeLedgerErrorCode =
  | "INVALID_INPUT"
  | "COMPANY_NOT_FOUND"
  | "INCOHERENT_COMMISSION"
  | "ATTEMPT_ALREADY_CONSUMED"
  | "ATTACH_REJECTED"

export class PlatformFeeLedgerError extends Error {
  constructor(public readonly code: PlatformFeeLedgerErrorCode) {
    super(code)
    this.name = "PlatformFeeLedgerError"
  }
}

async function withTransaction<T>(deps: LedgerDeps | undefined, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (deps?.pool ?? defaultPool).connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505"
}

/* -------------------------------------------------------------------------- */
/*  Réservation                                                               */
/* -------------------------------------------------------------------------- */

export type PlatformFeeReservation = {
  reservationId: number
  monthKey: string
  feeBps: number
  /** Montant EXACT à envoyer comme application_fee_amount (jamais recalculé). */
  feeCents: number
  monthlyCapCents: number | null
  source: ResolvedCommission["source"]
  /** false = tentative logique déjà réservée (double clic) : réutilisée. */
  created: boolean
  externalPaymentId: string | null
}

type ReservationRow = {
  id: number
  monthKey: string
  feeBps: number
  reservedCents: number
  monthlyCapCents: number | null
  feeSource: ResolvedCommission["source"]
  status: string
  externalPaymentId: string | null
}

function toReservation(row: ReservationRow, created: boolean): PlatformFeeReservation {
  return {
    reservationId: row.id,
    monthKey: row.monthKey,
    feeBps: row.feeBps,
    feeCents: row.reservedCents,
    monthlyCapCents: row.monthlyCapCents,
    source: row.feeSource,
    created,
    externalPaymentId: row.externalPaymentId,
  }
}

export async function reservePlatformFee(
  input: {
    companyId: number
    bookingId: number
    type: string
    grossAmountCents: number
    /** Commission globale historique (platform_settings), lue côté serveur. */
    fallbackFeeBps: number
    now?: Date
  },
  deps?: LedgerDeps,
): Promise<PlatformFeeReservation> {
  if (!isPositiveInt(input.companyId) || !isPositiveInt(input.bookingId) || !isPositiveInt(input.grossAmountCents)) {
    throw new PlatformFeeLedgerError("INVALID_INPUT")
  }
  const now = input.now ?? new Date()
  const attemptKey = buildCheckoutAttemptKey({
    companyId: input.companyId,
    bookingId: input.bookingId,
    type: input.type,
    grossAmountCents: input.grossAmountCents,
    now,
  })

  const attempt = () =>
    withTransaction(deps, async (client) => {
      const { rows: companyRows } = await client.query<{
        billingMode: string | null
        licensePlan: string | null
        platformFeeBps: number | null
        timezone: string | null
      }>(
        `SELECT "billingMode", "licensePlan", "platformFeeBps", "timezone" FROM "companies" WHERE "id" = $1`,
        [input.companyId],
      )
      const company = companyRows[0]
      if (!company) throw new PlatformFeeLedgerError("COMPANY_NOT_FOUND")

      const commission = resolveCommercialCommission(company, input.fallbackFeeBps)
      if (
        !Number.isInteger(commission.feeBps) ||
        commission.feeBps < 0 ||
        commission.feeBps > 10_000 ||
        (commission.monthlyFeeCapCents != null && commission.monthlyFeeCapCents < 0)
      ) {
        throw new PlatformFeeLedgerError("INCOHERENT_COMMISSION")
      }

      const monthKey = getBusinessMonthKey(now, company.timezone)

      await client.query(
        `INSERT INTO "platform_fee_monthly_counters" ("companyId", "monthKey")
         VALUES ($1, $2) ON CONFLICT ("companyId", "monthKey") DO NOTHING`,
        [input.companyId, monthKey],
      )
      const { rows: counterRows } = await client.query<{ consumedCents: number }>(
        `SELECT "consumedCents" FROM "platform_fee_monthly_counters"
          WHERE "companyId" = $1 AND "monthKey" = $2 FOR UPDATE`,
        [input.companyId, monthKey],
      )
      const consumedCents = Number(counterRows[0]?.consumedCents ?? 0)

      const { rows: existing } = await client.query<ReservationRow>(
        `SELECT "id", "monthKey", "feeBps", "reservedCents", "monthlyCapCents", "feeSource", "status", "externalPaymentId"
           FROM "platform_fee_reservations"
          WHERE "attemptKey" = $1 AND "companyId" = $2 AND "status" IN ('reserved', 'consumed')
          LIMIT 1`,
        [attemptKey, input.companyId],
      )
      if (existing[0]) {
        if (existing[0].status !== "reserved") throw new PlatformFeeLedgerError("ATTEMPT_ALREADY_CONSUMED")
        return toReservation(existing[0], false)
      }

      const feeCents = computeCappedPlatformFeeCents({
        grossAmountCents: input.grossAmountCents,
        feeBps: commission.feeBps,
        monthlyCapCents: commission.monthlyFeeCapCents,
        alreadyConsumedCents: consumedCents,
      })

      await client.query(
        `UPDATE "platform_fee_monthly_counters"
            SET "consumedCents" = "consumedCents" + $3, "updatedAt" = now()
          WHERE "companyId" = $1 AND "monthKey" = $2`,
        [input.companyId, monthKey, feeCents],
      )
      const { rows: inserted } = await client.query<ReservationRow>(
        `INSERT INTO "platform_fee_reservations"
           ("companyId", "bookingId", "monthKey", "attemptKey", "grossAmountCents", "feeBps",
            "monthlyCapCents", "feeSource", "reservedCents")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING "id", "monthKey", "feeBps", "reservedCents", "monthlyCapCents", "feeSource", "status", "externalPaymentId"`,
        [
          input.companyId,
          input.bookingId,
          monthKey,
          attemptKey,
          input.grossAmountCents,
          commission.feeBps,
          commission.monthlyFeeCapCents,
          commission.source,
          feeCents,
        ],
      )
      return toReservation(inserted[0], true)
    })

  try {
    return await attempt()
  } catch (e) {
    // Seule course possible hors verrou compteur : deux requêtes de la même
    // tentative à cheval sur deux mois civils. L'index unique tranche ; on relit.
    if (isUniqueViolation(e)) return attempt()
    throw e
  }
}

/**
 * Rattache la session Stripe créée à la réservation. Refusé si la réservation
 * n'est plus `reserved` (ex. libérée entre-temps) : l'appelant ne doit alors
 * PAS transmettre la session au client (elle expirera sans être payable).
 */
export async function attachExternalPaymentId(
  input: { reservationId: number; companyId: number; externalPaymentId: string },
  deps?: LedgerDeps,
): Promise<void> {
  if (!input.externalPaymentId) throw new PlatformFeeLedgerError("INVALID_INPUT")
  const { rowCount } = await (deps?.pool ?? defaultPool).query(
    `UPDATE "platform_fee_reservations"
        SET "externalPaymentId" = $3, "updatedAt" = now()
      WHERE "id" = $1 AND "companyId" = $2 AND "status" = 'reserved'
        AND ("externalPaymentId" IS NULL OR "externalPaymentId" = $3)`,
    [input.reservationId, input.companyId, input.externalPaymentId],
  )
  if (!rowCount) throw new PlatformFeeLedgerError("ATTACH_REJECTED")
}

/* -------------------------------------------------------------------------- */
/*  Libération (échec Stripe / session expirée) — IDEMPOTENTE                 */
/* -------------------------------------------------------------------------- */

export type ReleaseResult = { released: boolean; releasedCents: number; monthKey: string | null }

async function releaseWhere(
  client: PoolClient,
  where: { column: "id" | "externalPaymentId"; value: number | string; companyId: number },
  reason: string,
): Promise<ReleaseResult> {
  const { rows } = await client.query<{ monthKey: string; amount: number }>(
    `UPDATE "platform_fee_reservations"
        SET "status" = 'released', "releaseReason" = $3, "releasedAt" = now(), "updatedAt" = now()
      WHERE "${where.column}" = $1 AND "companyId" = $2 AND "status" = 'reserved'
      RETURNING "monthKey", ("reservedCents" - "refundReleasedCents") AS amount`,
    [where.value, where.companyId, reason],
  )
  const row = rows[0]
  if (!row) return { released: false, releasedCents: 0, monthKey: null }
  const amount = Number(row.amount)
  await client.query(
    `UPDATE "platform_fee_monthly_counters"
        SET "consumedCents" = GREATEST(0, "consumedCents" - $3), "updatedAt" = now()
      WHERE "companyId" = $1 AND "monthKey" = $2`,
    [where.companyId, row.monthKey, amount],
  )
  return { released: true, releasedCents: amount, monthKey: row.monthKey }
}

export function releasePlatformFeeReservation(
  input: { reservationId: number; companyId: number; reason: string },
  deps?: LedgerDeps,
): Promise<ReleaseResult> {
  return withTransaction(deps, (client) =>
    releaseWhere(client, { column: "id", value: input.reservationId, companyId: input.companyId }, input.reason),
  )
}

export function releasePlatformFeeByExternalId(
  input: { externalPaymentId: string; companyId: number; reason: string },
  deps?: LedgerDeps,
): Promise<ReleaseResult> {
  return withTransaction(deps, (client) =>
    releaseWhere(
      client,
      { column: "externalPaymentId", value: input.externalPaymentId, companyId: input.companyId },
      input.reason,
    ),
  )
}

/* -------------------------------------------------------------------------- */
/*  Paiement encaissé — consommation définitive (aucun second incrément)      */
/* -------------------------------------------------------------------------- */

export type ConsumeResult = "consumed" | "already_consumed" | "reapplied" | "not_found"

export function consumePlatformFeeReservation(
  input: { externalPaymentId: string; companyId: number },
  deps?: LedgerDeps,
): Promise<ConsumeResult> {
  return withTransaction(deps, async (client) => {
    const { rows } = await client.query<{ status: string; monthKey: string; amount: number }>(
      `SELECT "status", "monthKey", ("reservedCents" - "refundReleasedCents") AS amount
         FROM "platform_fee_reservations"
        WHERE "externalPaymentId" = $1 AND "companyId" = $2
        FOR UPDATE`,
      [input.externalPaymentId, input.companyId],
    )
    const row = rows[0]
    if (!row) return "not_found"
    if (row.status === "consumed") return "already_consumed"

    await client.query(
      `UPDATE "platform_fee_reservations"
          SET "status" = 'consumed', "consumedAt" = now(), "updatedAt" = now()
        WHERE "externalPaymentId" = $1 AND "companyId" = $2`,
      [input.externalPaymentId, input.companyId],
    )
    if (row.status === "reserved") return "consumed"

    // Libérée puis finalement encaissée (cas anormal) : la commission a bien
    // été prélevée par Stripe → on la recompte sur son mois ORIGINAL.
    await client.query(
      `INSERT INTO "platform_fee_monthly_counters" ("companyId", "monthKey", "consumedCents")
       VALUES ($1, $2, $3)
       ON CONFLICT ("companyId", "monthKey")
       DO UPDATE SET "consumedCents" = "platform_fee_monthly_counters"."consumedCents" + EXCLUDED."consumedCents",
                     "updatedAt" = now()`,
      [input.companyId, row.monthKey, Number(row.amount)],
    )
    return "reapplied"
  })
}

/* -------------------------------------------------------------------------- */
/*  Remboursement — restitution RÉELLE de l'application fee                   */
/* -------------------------------------------------------------------------- */

/**
 * Libère du plafond (mois ORIGINAL) la part de commission RÉELLEMENT
 * restituée. `applicationFeeRefundedTotalCents` = cumul Stripe
 * (ApplicationFee.amount_refunded), jamais une estimation.
 * Idempotent : un rejeu du même cumul libère 0 ; jamais plus que la
 * commission initialement réservée.
 *
 * Non branché au webhook dans ce lot : l'endpoint Connect actuel ne reçoit pas
 * les événements `application_fee.refunded` (compte plateforme).
 */
export function releaseRefundedApplicationFee(
  input: { externalPaymentId: string; companyId: number; applicationFeeRefundedTotalCents: number },
  deps?: LedgerDeps,
): Promise<{ releasedCents: number }> {
  if (!Number.isInteger(input.applicationFeeRefundedTotalCents) || input.applicationFeeRefundedTotalCents < 0) {
    return Promise.reject(new PlatformFeeLedgerError("INVALID_INPUT"))
  }
  return withTransaction(deps, async (client) => {
    const { rows } = await client.query<{ monthKey: string; reservedCents: number; refundReleasedCents: number }>(
      `SELECT "monthKey", "reservedCents", "refundReleasedCents"
         FROM "platform_fee_reservations"
        WHERE "externalPaymentId" = $1 AND "companyId" = $2 AND "status" = 'consumed'
        FOR UPDATE`,
      [input.externalPaymentId, input.companyId],
    )
    const row = rows[0]
    if (!row) return { releasedCents: 0 }
    const delta = computeRefundReleaseDeltaCents({
      reservedCents: Number(row.reservedCents),
      alreadyReleasedCents: Number(row.refundReleasedCents),
      refundedTotalCents: input.applicationFeeRefundedTotalCents,
    })
    if (delta === 0) return { releasedCents: 0 }
    await client.query(
      `UPDATE "platform_fee_reservations"
          SET "refundReleasedCents" = "refundReleasedCents" + $3, "updatedAt" = now()
        WHERE "externalPaymentId" = $1 AND "companyId" = $2`,
      [input.externalPaymentId, input.companyId, delta],
    )
    await client.query(
      `UPDATE "platform_fee_monthly_counters"
          SET "consumedCents" = GREATEST(0, "consumedCents" - $3), "updatedAt" = now()
        WHERE "companyId" = $1 AND "monthKey" = $2`,
      [input.companyId, row.monthKey, delta],
    )
    return { releasedCents: delta }
  })
}

/* -------------------------------------------------------------------------- */
/*  Lecture — « Commission ce mois : X € / Y € »                              */
/* -------------------------------------------------------------------------- */

export async function getMonthlyPlatformFeeUsage(
  input: { companyId: number; timezone: string | null | undefined; now?: Date },
  deps?: LedgerDeps,
): Promise<{ monthKey: string; consumedCents: number }> {
  const monthKey = getBusinessMonthKey(input.now ?? new Date(), input.timezone)
  const { rows } = await (deps?.pool ?? defaultPool).query<{ consumedCents: number }>(
    `SELECT "consumedCents" FROM "platform_fee_monthly_counters" WHERE "companyId" = $1 AND "monthKey" = $2`,
    [input.companyId, monthKey],
  )
  return { monthKey, consumedCents: Number(rows[0]?.consumedCents ?? 0) }
}
