import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core"
import * as schema from "@/lib/db/schema"

const migration = readFileSync(join(process.cwd(), "scripts/customer-subscriptions-schema-migration.sql"), "utf8")
const migrationCode = migration.replace(/--.*$/gm, "")

const moduleTables = {
  maintenance_plans: schema.maintenancePlans,
  maintenance_subscriptions: schema.maintenanceSubscriptions,
  maintenance_subscription_vehicles: schema.maintenanceSubscriptionVehicles,
  maintenance_cycles: schema.maintenanceCycles,
  maintenance_uses: schema.maintenanceUses,
  maintenance_payments: schema.maintenancePayments,
  maintenance_audit_log: schema.maintenanceAuditLog,
} as const

const configOf = (t: PgTable) => getTableConfig(t)
const columnNames = (t: PgTable) => configOf(t).columns.map((c) => c.name)

const isPgTable = (v: unknown): v is PgTable =>
  typeof v === "object" && v !== null && Symbol.for("drizzle:IsDrizzleTable") in v
const allTables: PgTable[] = (Object.values(schema) as unknown[]).filter(isPgTable)

describe("schéma Drizzle : module abonnements clients", () => {
  it("les 7 tables existent avec le nom attendu, sans collision", () => {
    for (const [name, table] of Object.entries(moduleTables)) {
      expect(configOf(table).name).toBe(name)
    }
    const names = allTables.map((t) => configOf(t).name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("chaque table porte un companyId NOT NULL lié à companies en RESTRICT", () => {
    for (const table of Object.values(moduleTables)) {
      const cfg = configOf(table)
      const col = cfg.columns.find((c) => c.name === "companyId")
      expect(col?.notNull).toBe(true)
      const fk = cfg.foreignKeys.find((f) => f.reference().foreignTable === schema.companies)
      expect(fk?.onDelete).toBe("restrict")
    }
  })

  it("aucun ON DELETE CASCADE dans le module", () => {
    for (const table of Object.values(moduleTables)) {
      for (const fk of configOf(table).foreignKeys) expect(fk.onDelete).not.toBe("cascade")
    }
    expect(migrationCode).not.toMatch(/CASCADE/i)
  })

  it("FK internes composites (companyId, …) → isolation tenant", () => {
    const composite = (t: PgTable, name: string) => {
      const fk = configOf(t).foreignKeys.find((f) => f.getName() === name)
      expect(fk).toBeDefined()
      const cols = fk!.reference().columns.map((c) => c.name)
      expect(cols[0]).toBe("companyId")
      return cols
    }
    expect(composite(schema.maintenanceSubscriptions, "maintenance_subscriptions_plan_fk")).toEqual(["companyId", "planId"])
    composite(schema.maintenanceSubscriptionVehicles, "maintenance_subscription_vehicles_subscription_fk")
    composite(schema.maintenanceCycles, "maintenance_cycles_subscription_fk")
    expect(composite(schema.maintenanceUses, "maintenance_uses_cycle_fk")).toEqual(["companyId", "subscriptionId", "cycleId"])
    composite(schema.maintenancePayments, "maintenance_payments_subscription_fk")
    composite(schema.maintenancePayments, "maintenance_payments_cycle_fk")
    composite(schema.maintenanceAuditLog, "maintenance_audit_log_subscription_fk")
  })

  it("contrat : snapshots, annulation en 3 temps, hash du token (jamais en clair)", () => {
    const cols = columnNames(schema.maintenanceSubscriptions)
    for (const c of [
      "customerName", "customerEmail", "customerPhone",
      "planNameSnapshot", "priceCentsSnapshot", "includedUsesPerCycleSnapshot",
      "billingIntervalUnitSnapshot", "billingIntervalCountSnapshot",
      "commitmentUnitSnapshot", "commitmentCountSnapshot",
      "renewalModeSnapshot", "renewalNoticeDaysSnapshot", "prepaidBillingCyclesSnapshot",
      "billingAnchorAt", "currentTermStartedAt", "currentTermEndsAt", "renewalNoticeSentAt", "renewalOptOutAt",
      "cancelRequestedAt", "cancelAt", "cancelledAt", "manageTokenHash",
    ]) expect(cols).toContain(c)
    expect(cols).not.toContain("manageToken")
    expect(cols).not.toContain("isCancelled")
  })

  it("paiement : montants/commission entiers, aucune dépendance au booking", () => {
    const cfg = configOf(schema.maintenancePayments)
    for (const c of ["grossAmountCents", "platformFeeBps", "platformFeeAmountCents", "refundedAmountCents"]) {
      expect(cfg.columns.find((col) => col.name === c)?.getSQLType()).toBe("integer")
    }
    expect(columnNames(schema.maintenancePayments)).not.toContain("bookingId")
  })

  it("providerAccountId (snapshot du compte provider) sur contrats et paiements", () => {
    for (const t of [schema.maintenanceSubscriptions, schema.maintenancePayments]) {
      const cols = columnNames(t)
      expect(cols).toContain("providerAccountId")
      expect(cols).not.toContain("stripeAccountId")
    }
  })

  it("IDs externes uniques scopés par (provider, providerAccountId)", () => {
    const idxCols = (t: PgTable, name: string) => {
      const idx = configOf(t).indexes.find((i) => i.config.name === name)
      expect(idx?.config.unique).toBe(true)
      expect(idx?.config.where).toBeDefined()
      return idx!.config.columns.map((c) => ("name" in c ? c.name : ""))
    }
    expect(idxCols(schema.maintenanceSubscriptions, "maintenance_subscriptions_external_subscription_key")).toEqual([
      "provider", "providerAccountId", "externalSubscriptionId",
    ])
    expect(idxCols(schema.maintenanceSubscriptions, "maintenance_subscriptions_checkout_session_key")).toEqual([
      "provider", "providerAccountId", "externalCheckoutSessionId",
    ])
    expect(idxCols(schema.maintenancePayments, "maintenance_payments_external_payment_key")).toEqual([
      "provider", "providerAccountId", "externalPaymentId",
    ])
    const customerIdx = configOf(schema.maintenanceSubscriptions).indexes.find(
      (i) => i.config.name === "maintenance_subscriptions_external_customer_idx",
    )
    expect(customerIdx?.config.unique).toBe(false)
    for (const [cols, sqlCols] of [
      ['provider, "providerAccountId", "externalSubscriptionId"', "subscriptions"],
      ['provider, "providerAccountId", "externalCheckoutSessionId"', "subscriptions"],
      ['provider, "providerAccountId", "externalPaymentId"', "payments"],
      ['"providerAccountId", "externalCustomerId"', "subscriptions"],
    ]) expect(migrationCode, sqlCols).toContain(cols)
  })

  it("ID externe interdit sans providerAccountId (checks)", () => {
    const checkNames = (t: PgTable) => configOf(t).checks.map((c) => c.name)
    expect(checkNames(schema.maintenanceSubscriptions)).toContain("maintenance_subscriptions_external_ids_need_account")
    expect(checkNames(schema.maintenancePayments)).toContain("maintenance_payments_external_ids_need_account")
    expect(migrationCode).toMatch(
      /"providerAccountId" IS NOT NULL\s+OR \("externalCustomerId" IS NULL AND "externalSubscriptionId" IS NULL AND "externalCheckoutSessionId" IS NULL\)/,
    )
    expect(migrationCode).toMatch(/"providerAccountId" IS NOT NULL OR \("externalPaymentId" IS NULL AND "externalInvoiceId" IS NULL\)/)
  })

  it("snapshots du nettoyage initial et preuve d'acceptation des conditions", () => {
    const cfg = configOf(schema.maintenanceSubscriptions)
    const col = (n: string) => cfg.columns.find((c) => c.name === n)
    expect(col("initialCleaningRequiredSnapshot")?.getSQLType()).toBe("boolean")
    expect(col("initialCleaningRequiredSnapshot")?.notNull).toBe(true)
    expect(col("initialCleaningRequiredSnapshot")?.default).toBe(false)
    expect(col("initialServiceNameSnapshot")?.notNull).toBe(false)
    expect(col("initialServicePriceCentsSnapshot")?.getSQLType()).toBe("integer")
    expect(col("initialServicePriceCentsSnapshot")?.notNull).toBe(false)
    expect(col("termsAcceptedAt")?.notNull).toBe(false)
    expect(col("termsVersion")?.notNull).toBe(false)
    expect(migrationCode).toMatch(/"initialServicePriceCentsSnapshot" IS NULL OR "initialServicePriceCentsSnapshot" >= 0/)
    expect(migrationCode).toMatch(/"termsAcceptedAt" IS NULL OR "termsVersion" IS NOT NULL/)
    expect(migrationCode).toMatch(/"initialCleaningRequiredSnapshot" boolean NOT NULL DEFAULT false/)
  })

  it("aucun type flottant/numeric dans le module", () => {
    for (const table of Object.values(moduleTables)) {
      for (const col of configOf(table).columns) expect(col.getSQLType()).not.toMatch(/numeric|real|double|float/)
    }
  })
})

describe("schéma ↔ migration : mêmes noms d'index et de contraintes", () => {
  it("chaque index / unique / check / FK Drizzle est déclaré dans la migration", () => {
    for (const table of Object.values(moduleTables)) {
      const cfg = configOf(table)
      const names = [
        ...cfg.indexes.map((i) => i.config.name),
        ...cfg.uniqueConstraints.map((u) => u.getName()),
        ...cfg.checks.map((c) => c.name),
        ...cfg.foreignKeys.filter((f) => f.reference().columns.length > 1).map((f) => f.getName()),
      ]
      for (const n of names) expect(migration, n).toContain(n)
    }
  })

  it("statuts du contrat identiques des deux côtés", () => {
    for (const s of [
      "pending_initial_cleaning", "pending_payment", "active", "past_due",
      "cancel_scheduled", "suspended", "cancelled", "expired", "ended",
    ]) expect(migration).toContain(`'${s}'`)
  })
})

describe("facturation flexible : anciens concepts « mensuels » absents", () => {
  const legacy = [
    "minimumCommitmentMonths", "minimumCommitmentMonthsSnapshot", "minimumCommitmentEndsAt",
    "allowMonthlyPayment", "prepaidMonths", "prepaidMonthsSnapshot",
  ]

  it("ni dans Drizzle ni dans la migration", () => {
    const cols = [...columnNames(schema.maintenancePlans), ...columnNames(schema.maintenanceSubscriptions)]
    for (const c of legacy) {
      expect(cols).not.toContain(c)
      expect(migrationCode).not.toContain(`"${c}"`)
    }
    expect(migrationCode).not.toContain("'monthly'")
  })

  it("nouveaux champs de formule présents, prix toujours en centimes entiers", () => {
    const cfg = configOf(schema.maintenancePlans)
    for (const c of [
      "billingIntervalUnit", "billingIntervalCount", "commitmentUnit", "commitmentCount",
      "renewalMode", "renewalNoticeDays", "allowRecurringPayment", "allowPrepaidPayment", "prepaidBillingCycles",
    ]) expect(cfg.columns.map((col) => col.name)).toContain(c)
    for (const t of [schema.maintenancePlans, schema.maintenanceSubscriptions]) {
      const price = configOf(t).columns.find((c) => c.name === "priceCents" || c.name === "priceCentsSnapshot")
      expect(price?.getSQLType()).toBe("integer")
    }
  })

  it("index scheduler sur (status, currentTermEndsAt)", () => {
    const idx = configOf(schema.maintenanceSubscriptions).indexes.find(
      (i) => i.config.name === "maintenance_subscriptions_status_term_end_idx",
    )
    expect(idx?.config.columns.map((c) => ("name" in c ? c.name : ""))).toEqual(["status", "currentTermEndsAt"])
    expect(migrationCode).toContain('(status, "currentTermEndsAt") WHERE "currentTermEndsAt" IS NOT NULL')
  })
})

describe("CHECK exécutés sur Postgres en mémoire (PGlite, aucune base distante)", () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE companies (id serial PRIMARY KEY);
      CREATE TABLE clients (id serial PRIMARY KEY);
      CREATE TABLE services (id serial PRIMARY KEY);
      CREATE TABLE bookings (id serial PRIMARY KEY);
      INSERT INTO companies DEFAULT VALUES;
    `)
    await db.exec(migration)
  })
  afterAll(async () => {
    await db.close()
  })

  type Row = Record<string, string | number | boolean | null>
  const insert = async (table: string, row: Row) => {
    const keys = Object.keys(row)
    await db.query(
      `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    )
  }
  const plan = (overrides: Row): Row => ({ companyId: 1, name: "Entretien", priceCents: 3490, ...overrides })
  const subscription = (overrides: Row): Row => ({
    companyId: 1,
    paymentMode: "recurring",
    customerName: "Client",
    customerEmail: "client@example.com",
    planNameSnapshot: "Entretien",
    priceCentsSnapshot: 3490,
    billingIntervalUnitSnapshot: "week",
    billingIntervalCountSnapshot: 4,
    includedUsesPerCycleSnapshot: 1,
    commitmentUnitSnapshot: "month",
    commitmentCountSnapshot: 6,
    renewalModeSnapshot: "same_term",
    ...overrides,
  })

  it.each([
    ["mensuel sans engagement (month/1, none/0)", { billingIntervalUnit: "month", billingIntervalCount: 1 }],
    ["toutes les 4 semaines (week/4)", { billingIntervalUnit: "week", billingIntervalCount: 4 }],
    ["6 mois calendaires renouvelés", { commitmentUnit: "month", commitmentCount: 6, renewalMode: "same_term", renewalNoticeDays: 30 }],
    ["12 mois sans renouvellement", { commitmentUnit: "month", commitmentCount: 12, renewalMode: "none" }],
    ["6 échéances exactes", { commitmentUnit: "billing_cycle", commitmentCount: 6, renewalMode: "open_ended" }],
    ["prépayé 3 périodes", { allowPrepaidPayment: true, prepaidBillingCycles: 3 }],
  ])("formule acceptée : %s", async (_label, row) => {
    await expect(insert("maintenance_plans", plan(row))).resolves.toBeUndefined()
  })

  it.each([
    ["billingIntervalCount = 0", { billingIntervalCount: 0 }, "maintenance_plans_billing_interval_valid"],
    ["billingIntervalCount < 0", { billingIntervalCount: -1 }, "maintenance_plans_billing_interval_valid"],
    ["unité 'day'", { billingIntervalUnit: "day" }, "maintenance_plans_billing_interval_valid"],
    ["none / 6", { commitmentUnit: "none", commitmentCount: 6 }, "maintenance_plans_commitment_valid"],
    ["month / 0", { commitmentUnit: "month", commitmentCount: 0 }, "maintenance_plans_commitment_valid"],
    ["same_term sans engagement", { renewalMode: "same_term" }, "maintenance_plans_renewal_mode_valid"],
    ["préavis négatif", { renewalNoticeDays: -1 }, "maintenance_plans_renewal_notice_days_valid"],
    ["prépayé sans nombre de périodes", { allowPrepaidPayment: true }, "maintenance_plans_prepaid_cycles_valid"],
    ["aucun mode de paiement", { allowRecurringPayment: false }, "maintenance_plans_payment_mode_allowed"],
  ])("formule rejetée : %s", async (_label, row, constraint) => {
    await expect(insert("maintenance_plans", plan(row))).rejects.toThrow(constraint)
  })

  it.each([
    ["récurrent 4 semaines, 6 mois renouvelable", {}],
    ["récurrent sans engagement", { commitmentUnitSnapshot: "none", commitmentCountSnapshot: 0, renewalModeSnapshot: "open_ended" }],
    ["prépayé expirant", { paymentMode: "prepaid", prepaidBillingCyclesSnapshot: 3, renewalModeSnapshot: "none" }],
    ["non-renouvellement demandé sans résiliation", { renewalOptOutAt: "2026-03-01", currentTermStartedAt: "2026-01-01", currentTermEndsAt: "2026-07-01" }],
  ])("contrat accepté : %s", async (_label, row) => {
    await expect(insert("maintenance_subscriptions", subscription(row))).resolves.toBeUndefined()
  })

  it.each([
    ["paymentMode 'monthly'", { paymentMode: "monthly" }, "maintenance_subscriptions_payment_mode_valid"],
    ["intervalle snapshot = 0", { billingIntervalCountSnapshot: 0 }, "maintenance_subscriptions_billing_interval_valid"],
    ["none / 6", { commitmentUnitSnapshot: "none", commitmentCountSnapshot: 6, renewalModeSnapshot: "open_ended" }, "maintenance_subscriptions_commitment_valid"],
    ["month / 0", { commitmentCountSnapshot: 0 }, "maintenance_subscriptions_commitment_valid"],
    ["same_term sans engagement", { commitmentUnitSnapshot: "none", commitmentCountSnapshot: 0 }, "maintenance_subscriptions_renewal_mode_valid"],
    ["prépayé auto-renouvelé", { paymentMode: "prepaid", prepaidBillingCyclesSnapshot: 3 }, "maintenance_subscriptions_prepaid_cycles_valid"],
    ["prépayé sans périodes", { paymentMode: "prepaid", renewalModeSnapshot: "none" }, "maintenance_subscriptions_prepaid_cycles_valid"],
    ["terme incohérent", { currentTermStartedAt: "2026-07-01", currentTermEndsAt: "2026-01-01" }, "maintenance_subscriptions_current_term_valid"],
  ])("contrat rejeté : %s", async (_label, row, constraint) => {
    await expect(insert("maintenance_subscriptions", subscription(row))).rejects.toThrow(constraint)
  })
})

describe("migration : strictement additive", () => {
  it("aucune instruction destructive ni modification de données", () => {
    const statements = migrationCode.replace(/ON DELETE (RESTRICT|SET NULL)/gi, "")
    expect(statements).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER)\b/i)
  })

  it("crée uniquement les 7 nouvelles tables", () => {
    const created = [...migrationCode.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1])
    expect(created.sort()).toEqual(Object.keys(moduleTables).sort())
  })
})
