import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { companies } from "@/lib/db/schema"
import { resolveDashboardPrimaryMode, isBookingDistributionMode } from "@/lib/admin/primary-action"

const migration = readFileSync(join(process.cwd(), "scripts/booking-distribution-mode-migration.sql"), "utf8")
const config = getTableConfig(companies)
const column = config.columns.find((c) => c.name === "bookingDistributionMode")

describe("schéma Drizzle : companies.bookingDistributionMode", () => {
  it("colonne déclarée, text, nullable, sans default", () => {
    expect(column).toBeDefined()
    expect(column!.getSQLType()).toBe("text")
    expect(column!.notNull).toBe(false)
    expect(column!.hasDefault).toBe(false)
  })

  it("CHECK link | widget portant le même nom que la migration", () => {
    const chk = config.checks.find((c) => c.name === "companies_booking_distribution_mode_check")
    expect(chk).toBeDefined()
    expect(migration).toContain("companies_booking_distribution_mode_check")
    expect(migration).toMatch(/IN \('link', 'widget'\)/)
  })
})

describe("migration : additive, idempotente, ciblée", () => {
  it("ADD COLUMN IF NOT EXISTS, text, sans DEFAULT ni NOT NULL", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "bookingDistributionMode" text;/)
    expect(migration).not.toMatch(/"bookingDistributionMode"[^;]*DEFAULT/i)
    expect(migration).not.toMatch(/"bookingDistributionMode"[^;]*NOT NULL/i)
  })

  it("aucune suppression de données", () => {
    const code = migration.replace(/--.*$/gm, "")
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i)
  })

  it("un seul UPDATE, limité à Cleanyzer encore NULL → 'widget'", () => {
    const updates = migration.match(/UPDATE companies[\s\S]*?;/g) ?? []
    expect(updates).toHaveLength(1)
    const u = updates[0]
    expect(u).toContain(`SET "bookingDistributionMode" = 'widget'`)
    expect(u).toContain("id = 104")
    expect(u).toContain("slug = 'cleanyzer'")
    expect(u).toContain(`"customSiteKey" = 'cleanyzer'`)
    expect(u).toContain(`"bookingDistributionMode" IS NULL`)
    expect(u).not.toMatch(/spirit|rozan/i)
  })
})

describe("fallback NULL / link / widget", () => {
  it("NULL → historique", () => {
    expect(resolveDashboardPrimaryMode(null)).not.toBe("widget")
  })
  it("link → historique", () => {
    expect(resolveDashboardPrimaryMode("link")).toBe(resolveDashboardPrimaryMode(null))
  })
  it("widget → nouveau panneau", () => {
    expect(resolveDashboardPrimaryMode("widget")).toBe("widget")
  })
  it("valeur inconnue rejetée", () => {
    expect(isBookingDistributionMode("iframe")).toBe(false)
    expect(isBookingDistributionMode(null)).toBe(false)
  })
})
