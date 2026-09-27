import "server-only"

/**
 * DetailFlow — Service SERVEUR de l'inventaire Lifetime (LOT S2.5A).
 *
 * Aucune route HTTP n'expose ces fonctions dans ce lot. Elles prennent un
 * `companyId` résolu CÔTÉ SERVEUR (jamais une valeur navigateur) : un futur
 * appelant devra l'obtenir depuis la session authentifiée.
 *
 * Aucun appel Stripe. Chaque écriture s'exécute dans une transaction READ
 * COMMITTED qui prend d'abord le verrou pg_advisory_xact_lock du stock, puis
 * les verrous de lignes (ordre constant => pas d'interblocage). Le trigger DB
 * revérifie le plafond : même un appel SQL direct ne peut créer la 51e licence.
 */

import type { Pool, PoolClient } from "pg"
import { pool as defaultPool } from "@/lib/db"
import {
  LIFETIME_BILLING_MODE,
  LIFETIME_INVENTORY_LOCK_KEY,
  LIFETIME_LICENSE_PLAN,
  LIFETIME_MAX_LICENSES,
  LIFETIME_PLATFORM_FEE_BPS,
  LIFETIME_RESERVATION_TTL_MINUTES,
  LifetimeError,
  assertCompanyEligibleForLifetime,
  assertValidCompanyId,
  computeLifetimeAvailability,
  parseLifetimePaymentPlan,
  type LifetimeAllocationStatus,
  type LifetimeAvailability,
  type LifetimePaymentPlanType,
} from "./lifetime"

export interface LifetimeDeps {
  /** Injectable pour les tests d'intégration (schéma isolé). */
  pool?: Pool
}

export interface LifetimeAllocation {
  id: number
  companyId: number | null
  companyNameSnapshot: string | null
  status: LifetimeAllocationStatus
  paymentPlan: LifetimePaymentPlanType
  reservedAt: Date
  reservationExpiresAt: Date | null
  activatedAt: Date | null
  releasedAt: Date | null
}

const ALLOCATION_COLUMNS = `"id", "companyId", "companyNameSnapshot", "status", "paymentPlan",
  "reservedAt", "reservationExpiresAt", "activatedAt", "releasedAt"`

const CONSUMING_PREDICATE = `("status" = 'ACTIVE' OR ("status" = 'RESERVED' AND "reservationExpiresAt" > NOW()))`

/* -------------------------------- Transactions ---------------------------- */

function mapDbError(error: unknown): unknown {
  if (error instanceof LifetimeError) return error
  const pgError = error as { code?: string; message?: string; constraint?: string }
  if (pgError?.code === "23514" && pgError.message?.includes("LIFETIME_CAP_REACHED")) {
    return new LifetimeError("SOLD_OUT", "Toutes les licences Lifetime ont été attribuées.")
  }
  if (pgError?.code === "23505" && pgError.constraint === "lifetime_license_allocations_company_open_key") {
    return new LifetimeError("ALREADY_ALLOCATED", "Cette entreprise a déjà une licence Lifetime active ou réservée.")
  }
  return error
}

async function withInventoryTransaction<T>(
  deps: LifetimeDeps | undefined,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (deps?.pool ?? defaultPool).connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LIFETIME_INVENTORY_LOCK_KEY])
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw mapDbError(error)
  } finally {
    client.release()
  }
}

async function countConsumed(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "lifetime_license_allocations" WHERE ${CONSUMING_PREDICATE}`,
  )
  return rows[0].n
}

interface CompanyRow {
  id: number
  name: string
  billingMode: string | null
  licensePlan: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
}

async function lockCompany(client: PoolClient, companyId: number): Promise<CompanyRow> {
  const { rows } = await client.query<CompanyRow>(
    `SELECT "id", "name", "billingMode", "licensePlan", "stripeSubscriptionId", "subscriptionStatus"
       FROM "companies" WHERE "id" = $1 FOR UPDATE`,
    [companyId],
  )
  if (rows.length === 0) {
    throw new LifetimeError("COMPANY_NOT_FOUND", "Entreprise introuvable.")
  }
  return rows[0]
}

/* -------------------------------- Disponibilité --------------------------- */

/** Lecture serveur uniquement : non exposée sur la landing dans ce lot. */
export async function getLifetimeAvailability(deps?: LifetimeDeps): Promise<LifetimeAvailability> {
  const { rows } = await (deps?.pool ?? defaultPool).query<{ active: number; reserved: number }>(
    `SELECT
       count(*) FILTER (WHERE "status" = 'ACTIVE')::int AS active,
       count(*) FILTER (WHERE "status" = 'RESERVED' AND "reservationExpiresAt" > NOW())::int AS reserved
     FROM "lifetime_license_allocations"`,
  )
  return computeLifetimeAvailability(rows[0].active, rows[0].reserved)
}

/* --------------------------------- Réservation ---------------------------- */

export async function reserveLifetimeSlot(
  input: { companyId: number; paymentPlan: unknown },
  deps?: LifetimeDeps,
): Promise<LifetimeAllocation> {
  assertValidCompanyId(input.companyId)
  const plan = parseLifetimePaymentPlan(input.paymentPlan)
  const companyId = input.companyId

  return withInventoryTransaction(deps, async (client) => {
    const company = await lockCompany(client, companyId)
    assertCompanyEligibleForLifetime(company)

    const { rows: open } = await client.query<{ id: number; status: string; valid: boolean }>(
      `SELECT "id", "status", ("reservationExpiresAt" > NOW()) AS valid
         FROM "lifetime_license_allocations"
        WHERE "companyId" = $1 AND "status" IN ('RESERVED', 'ACTIVE')
        FOR UPDATE`,
      [companyId],
    )
    for (const row of open) {
      if (row.status === "ACTIVE" || row.valid) {
        throw new LifetimeError("ALREADY_ALLOCATED", "Cette entreprise a déjà une licence Lifetime active ou réservée.")
      }
      // Réservation expirée : conservée pour audit, simplement libérée.
      await client.query(
        `UPDATE "lifetime_license_allocations"
            SET "status" = 'RELEASED', "releasedAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = $1`,
        [row.id],
      )
    }

    if ((await countConsumed(client)) >= LIFETIME_MAX_LICENSES) {
      throw new LifetimeError("SOLD_OUT", "Toutes les licences Lifetime ont été attribuées.")
    }

    const { rows } = await client.query<LifetimeAllocation>(
      `INSERT INTO "lifetime_license_allocations"
         ("companyId", "companyNameSnapshot", "status", "paymentPlan", "reservedAt", "reservationExpiresAt")
       VALUES ($1, $2, 'RESERVED', $3, NOW(), NOW() + make_interval(mins => $4))
       RETURNING ${ALLOCATION_COLUMNS}`,
      [companyId, company.name, plan.type, LIFETIME_RESERVATION_TTL_MINUTES],
    )
    return rows[0]
  })
}

/* --------------------------------- Activation ----------------------------- */

export interface LifetimeActivationResult {
  allocation: LifetimeAllocation
  alreadyActive: boolean
}

/**
 * RESERVED → ACTIVE et bascule du tenant en Lifetime, atomiquement.
 * Idempotente : une allocation déjà ACTIVE est renvoyée sans rien modifier.
 */
export async function activateLifetimeSlot(
  input: { companyId: number; allocationId: number; actorUserId?: string | null },
  deps?: LifetimeDeps,
): Promise<LifetimeActivationResult> {
  assertValidCompanyId(input.companyId)
  const { companyId, allocationId } = input

  return withInventoryTransaction(deps, async (client) => {
    const { rows } = await client.query<LifetimeAllocation & { valid: boolean }>(
      `SELECT ${ALLOCATION_COLUMNS}, ("reservationExpiresAt" > NOW()) AS valid
         FROM "lifetime_license_allocations"
        WHERE "id" = $1 AND "companyId" = $2
        FOR UPDATE`,
      [allocationId, companyId],
    )
    if (rows.length === 0) {
      throw new LifetimeError("ALLOCATION_NOT_FOUND", "Allocation Lifetime introuvable pour cette entreprise.")
    }
    const { valid, ...allocation } = rows[0]

    if (allocation.status === "ACTIVE") {
      return { allocation, alreadyActive: true }
    }
    if (allocation.status === "RELEASED") {
      throw new LifetimeError("RESERVATION_RELEASED", "Cette réservation Lifetime a été libérée.")
    }
    if (!valid) {
      throw new LifetimeError("RESERVATION_EXPIRED", "Cette réservation Lifetime a expiré.")
    }

    const company = await lockCompany(client, companyId)
    assertCompanyEligibleForLifetime(company)

    const { rows: activated } = await client.query<LifetimeAllocation>(
      `UPDATE "lifetime_license_allocations"
          SET "status" = 'ACTIVE', "activatedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = $1
        RETURNING ${ALLOCATION_COLUMNS}`,
      [allocationId],
    )

    // Uniquement les colonnes licence/billing du tenant concerné : Stripe
    // Connect (stripeAccountId, paymentsEnabled…) et données métier intacts.
    await client.query(
      `UPDATE "companies"
          SET "billingMode" = $2,
              "licensePlan" = $3,
              "licenseAssignedAt" = NOW(),
              "licenseAssignedByUserId" = $4,
              "platformFeeBps" = $5,
              "stripeSubscriptionId" = NULL,
              "subscriptionStatus" = NULL,
              "subscriptionPriceId" = NULL,
              "currentPeriodEnd" = NULL,
              "cancelAtPeriodEnd" = false,
              "updatedAt" = NOW()
        WHERE "id" = $1`,
      [companyId, LIFETIME_BILLING_MODE, LIFETIME_LICENSE_PLAN, input.actorUserId ?? null, LIFETIME_PLATFORM_FEE_BPS],
    )

    await client.query(
      `INSERT INTO "license_audit_log" ("companyId", "actorUserId", "action", "metadata")
       VALUES ($1, $2, 'LICENSE_CHANGED', $3::jsonb)`,
      [
        companyId,
        input.actorUserId ?? null,
        JSON.stringify({
          event: "LIFETIME_ACTIVATED",
          allocationId,
          paymentPlan: allocation.paymentPlan,
          previousPlan: company.licensePlan,
          previousBillingMode: company.billingMode,
          newPlan: LIFETIME_LICENSE_PLAN,
          billingMode: LIFETIME_BILLING_MODE,
          platformFeeBps: LIFETIME_PLATFORM_FEE_BPS,
        }),
      ],
    )

    return { allocation: activated[0], alreadyActive: false }
  })
}

/* ---------------------------------- Libération ---------------------------- */

/** RESERVED → RELEASED uniquement. Une ACTIVE est refusée ; RELEASED = no-op. */
export async function releaseLifetimeReservation(
  input: { companyId: number; allocationId: number },
  deps?: LifetimeDeps,
): Promise<LifetimeAllocation> {
  assertValidCompanyId(input.companyId)

  return withInventoryTransaction(deps, async (client) => {
    const { rows } = await client.query<LifetimeAllocation>(
      `SELECT ${ALLOCATION_COLUMNS} FROM "lifetime_license_allocations"
        WHERE "id" = $1 AND "companyId" = $2
        FOR UPDATE`,
      [input.allocationId, input.companyId],
    )
    if (rows.length === 0) {
      throw new LifetimeError("ALLOCATION_NOT_FOUND", "Allocation Lifetime introuvable pour cette entreprise.")
    }
    const allocation = rows[0]
    if (allocation.status === "ACTIVE") {
      throw new LifetimeError("ACTIVE_NOT_RELEASABLE", "Une licence Lifetime ACTIVE ne peut pas être libérée.")
    }
    if (allocation.status === "RELEASED") return allocation

    const { rows: released } = await client.query<LifetimeAllocation>(
      `UPDATE "lifetime_license_allocations"
          SET "status" = 'RELEASED', "releasedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = $1
        RETURNING ${ALLOCATION_COLUMNS}`,
      [input.allocationId],
    )
    return released[0]
  })
}
