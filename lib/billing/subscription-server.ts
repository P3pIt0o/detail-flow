import "server-only"

/**
 * Persistance PostgreSQL des abonnements Stripe BILLING (implémente
 * SubscriptionStore). SQL paramétré, toujours filtré par companyId.
 * Ne touche QUE les colonnes Billing/licence du tenant : jamais Stripe Connect
 * (stripeAccountId, paymentsEnabled, platformFeeBps…) ni les données métier.
 */

import type { Pool, PoolClient } from "pg"
import { pool as defaultPool } from "@/lib/db"
import type { CompanyBillingState, SubscriptionStatePatch, SubscriptionStore } from "./subscription-core"

const COMPANY_COLUMNS = `"id", "billingMode", "licensePlan", "stripeCustomerId", "stripeSubscriptionId",
  "subscriptionStatus", "subscriptionPriceId", "currentPeriodEnd", "cancelAtPeriodEnd",
  "continuousSubscriptionStartedAt", "subscriptionCanceledAt", "subscriptionStartedAt"`

type Queryable = Pick<Pool, "query"> | PoolClient

async function selectCompany(db: Queryable, where: string, value: unknown, lock = false): Promise<CompanyBillingState | null> {
  const { rows } = await db.query<CompanyBillingState>(
    `SELECT ${COMPANY_COLUMNS} FROM "companies" WHERE ${where} = $1 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [value],
  )
  return rows[0] ?? null
}

export function createPgSubscriptionStore(pool: Pool = defaultPool): SubscriptionStore {
  return {
    getCompany: (companyId) => selectCompany(pool, `"id"`, companyId),

    findCompanyBySubscriptionId: (subscriptionId) => selectCompany(pool, `"stripeSubscriptionId"`, subscriptionId),

    async hasLifetimeLicense(companyId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM "lifetime_license_allocations"
          WHERE "companyId" = $1 AND "status" IN ('ACTIVE', 'RESERVED') LIMIT 1`,
        [companyId],
      )
      return rows.length > 0
    },

    async setStripeCustomerIdIfNull(companyId, customerId) {
      await pool.query(
        `UPDATE "companies" SET "stripeCustomerId" = $2, "updatedAt" = NOW()
          WHERE "id" = $1 AND "stripeCustomerId" IS NULL`,
        [companyId, customerId],
      )
      const { rows } = await pool.query<{ stripeCustomerId: string | null }>(
        `SELECT "stripeCustomerId" FROM "companies" WHERE "id" = $1`,
        [companyId],
      )
      return rows[0]?.stripeCustomerId ?? null
    },

    async applySubscriptionState(companyId, subscriptionId, patch) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const company = await selectCompany(client, `"id"`, companyId, true)
        const guardOk =
          company !== null &&
          company.billingMode !== "lifetime" &&
          (patch.terminal
            ? company.stripeSubscriptionId === subscriptionId
            : company.stripeSubscriptionId === null || company.stripeSubscriptionId === subscriptionId)
        if (!company || !guardOk) {
          await client.query("ROLLBACK")
          return false
        }
        await writePatch(client, companyId, patch)
        if (company.licensePlan !== patch.licensePlan) {
          await client.query(
            `INSERT INTO "license_audit_log" ("companyId", "actorUserId", "action", "metadata")
             VALUES ($1, NULL, 'LICENSE_CHANGED', $2::jsonb)`,
            [
              companyId,
              JSON.stringify({
                event: "SUBSCRIPTION_SYNC",
                subscriptionId,
                status: patch.subscriptionStatus,
                previousPlan: company.licensePlan,
                newPlan: patch.licensePlan,
                billingMode: patch.billingMode,
              }),
            ],
          )
        }
        await client.query("COMMIT")
        return true
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    async startContinuousSubscriptionIfNull(companyId, subscriptionId, paidAt) {
      const { rowCount } = await pool.query(
        `UPDATE "companies" SET "continuousSubscriptionStartedAt" = $3, "updatedAt" = NOW()
          WHERE "id" = $1 AND "stripeSubscriptionId" = $2 AND "continuousSubscriptionStartedAt" IS NULL`,
        [companyId, subscriptionId, paidAt],
      )
      return (rowCount ?? 0) > 0
    },

    async isEventProcessed(eventId) {
      const { rows } = await pool.query(`SELECT 1 FROM "billing_events" WHERE "eventId" = $1`, [eventId])
      return rows.length > 0
    },

    async markEventProcessed(eventId, eventType) {
      await pool.query(
        `INSERT INTO "billing_events" ("eventId", "eventType") VALUES ($1, $2) ON CONFLICT ("eventId") DO NOTHING`,
        [eventId, eventType],
      )
    },
  }
}

async function writePatch(client: PoolClient, companyId: number, patch: SubscriptionStatePatch): Promise<void> {
  if (patch.terminal) {
    // Fin EFFECTIVE : seul moment où l'ancienneté fidélité repart à zéro.
    await client.query(
      `UPDATE "companies"
          SET "billingMode" = $2, "licensePlan" = $3, "stripeSubscriptionId" = NULL,
              "subscriptionStatus" = $4, "subscriptionPriceId" = NULL, "currentPeriodEnd" = NULL,
              "cancelAtPeriodEnd" = false, "continuousSubscriptionStartedAt" = NULL,
              "subscriptionCanceledAt" = $5,
              "licenseAssignedAt" = CASE WHEN "licensePlan" IS DISTINCT FROM $3 THEN NOW() ELSE "licenseAssignedAt" END,
              "updatedAt" = NOW()
        WHERE "id" = $1`,
      [companyId, patch.billingMode, patch.licensePlan, patch.subscriptionStatus, patch.endedAt],
    )
    return
  }
  // Actif / essai / impayé / pause : ancienneté JAMAIS modifiée ici.
  await client.query(
    `UPDATE "companies"
        SET "billingMode" = $2, "licensePlan" = $3,
            "subscriptionStartedAt" = CASE WHEN "stripeSubscriptionId" IS NULL THEN NOW() ELSE "subscriptionStartedAt" END,
            "subscriptionCanceledAt" = CASE WHEN "stripeSubscriptionId" IS NULL THEN NULL ELSE "subscriptionCanceledAt" END,
            "stripeSubscriptionId" = $4, "subscriptionStatus" = $5, "subscriptionPriceId" = $6,
            "currentPeriodEnd" = $7, "cancelAtPeriodEnd" = $8,
            "licenseAssignedAt" = CASE WHEN "licensePlan" IS DISTINCT FROM $3 THEN NOW() ELSE "licenseAssignedAt" END,
            "updatedAt" = NOW()
      WHERE "id" = $1`,
    [
      companyId,
      patch.billingMode,
      patch.licensePlan,
      patch.stripeSubscriptionId,
      patch.subscriptionStatus,
      patch.subscriptionPriceId,
      patch.currentPeriodEnd,
      patch.cancelAtPeriodEnd,
    ],
  )
}
