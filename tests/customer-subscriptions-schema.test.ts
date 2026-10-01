import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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
      "planNameSnapshot", "priceCentsSnapshot", "includedUsesPerCycleSnapshot", "minimumCommitmentMonthsSnapshot",
      "cancelRequestedAt", "cancelAt", "cancelledAt", "minimumCommitmentEndsAt", "manageTokenHash",
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
