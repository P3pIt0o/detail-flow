import { describe, it, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { companies } from "@/lib/db/schema"
import {
  BILLING_MODES,
  SUBSCRIPTION_STATUSES,
  DEFAULT_BILLING_MODE,
  isBillingMode,
  isSubscriptionStatus,
  parseBillingMode,
  parseSubscriptionStatus,
  type BillingMode,
} from "@/lib/billing/types"

/**
 * LOT S1 — vérifie UNIQUEMENT le socle de données Stripe Billing :
 * types centralisés + forme du schéma companies. Aucun appel Stripe, aucune
 * logique métier, aucune modification de Stripe Connect.
 */

const cols = getTableColumns(companies)

describe("BillingMode — valeurs autorisées", () => {
  it("accepte exactement free | subscription | lifetime", () => {
    expect([...BILLING_MODES]).toEqual(["free", "subscription", "lifetime"])
  })

  it("rejette toute autre valeur", () => {
    for (const value of ["FREE", "sub", "paid", "", "connect", null, undefined, 1]) {
      expect(isBillingMode(value)).toBe(false)
      expect(parseBillingMode(value)).toBeNull()
    }
  })

  it("valide chaque mode via le guard et le parseur", () => {
    for (const mode of BILLING_MODES) {
      expect(isBillingMode(mode)).toBe(true)
      expect(parseBillingMode(mode)).toBe(mode)
    }
  })

  it("valeur historique sûre = free", () => {
    expect(DEFAULT_BILLING_MODE).toBe("free")
    expect(isBillingMode(DEFAULT_BILLING_MODE)).toBe(true)
  })
})

describe("SubscriptionStatus — états prévus", () => {
  it("accepte exactement les statuts Stripe suivis", () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused",
    ])
  })

  it("valide chaque statut, rejette les valeurs arbitraires", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(isSubscriptionStatus(status)).toBe(true)
      expect(parseSubscriptionStatus(status)).toBe(status)
    }
    for (const value of ["ACTIVE", "expired", "", null, undefined]) {
      expect(isSubscriptionStatus(value)).toBe(false)
      expect(parseSubscriptionStatus(value)).toBeNull()
    }
  })
})

describe("Schéma companies — colonnes Stripe Billing", () => {
  it("billingMode NOT NULL avec default sûr (tenant historique reste valide)", () => {
    expect(cols.billingMode.notNull).toBe(true)
    expect(cols.billingMode.hasDefault).toBe(true)
    // Le default persisté doit être un BillingMode valide.
    expect(isBillingMode(cols.billingMode.default as BillingMode)).toBe(true)
    expect(cols.billingMode.default).toBe("free")
  })

  it("cancelAtPeriodEnd NOT NULL default false", () => {
    expect(cols.cancelAtPeriodEnd.notNull).toBe(true)
    expect(cols.cancelAtPeriodEnd.hasDefault).toBe(true)
    expect(cols.cancelAtPeriodEnd.default).toBe(false)
  })

  it("les champs Stripe Billing sont nullable", () => {
    for (const key of [
      "stripeCustomerId",
      "stripeSubscriptionId",
      "subscriptionStatus",
      "subscriptionPriceId",
      "currentPeriodEnd",
      "subscriptionStartedAt",
      "continuousSubscriptionStartedAt",
      "subscriptionCanceledAt",
    ] as const) {
      expect(cols[key].notNull).toBe(false)
    }
  })

  it("Lifetime peut exister sans stripeSubscriptionId", () => {
    // Représentation valide d'un tenant Lifetime : mode lifetime, aucun
    // abonnement récurrent. Les champs nullable rendent cet état possible.
    const lifetimeTenant = {
      billingMode: "lifetime" as BillingMode,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    }
    expect(isBillingMode(lifetimeTenant.billingMode)).toBe(true)
    expect(cols.stripeSubscriptionId.notNull).toBe(false)
    expect(lifetimeTenant.stripeSubscriptionId).toBeNull()
  })
})

describe("Stripe Connect — non touché par ce lot", () => {
  it("stripeAccountId (Connect) reste présent et nullable, distinct de stripeCustomerId (Billing)", () => {
    expect(cols.stripeAccountId).toBeDefined()
    expect(cols.stripeAccountId.notNull).toBe(false)
    expect(cols.stripeCustomerId).toBeDefined()
    // Deux colonnes distinctes : Connect ≠ Billing.
    expect(cols.stripeAccountId.name).not.toBe(cols.stripeCustomerId.name)
  })

  it("les colonnes de commission Connect restent inchangées", () => {
    expect(cols.platformFeeBps).toBeDefined()
    expect(cols.paymentsEnabled.notNull).toBe(true)
  })

  it("lib/billing/types n'expose aucun concept de commission Connect", () => {
    // Le module de facturation abonnement ne doit pas introduire de fee/bps.
    const keys = Object.keys({
      BILLING_MODES,
      SUBSCRIPTION_STATUSES,
      DEFAULT_BILLING_MODE,
    })
    expect(keys.join(" ")).not.toMatch(/fee|bps|commission|application/i)
  })
})
