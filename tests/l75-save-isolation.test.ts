import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const src = readFileSync(join(process.cwd(), "app/admin/(dashboard)/parametres/actions.ts"), "utf8")
const start = src.indexOf("export async function saveBusinessHours")
const end = src.indexOf("/* ------------------------ Congés", start)
const fn = src.slice(start, end)

describe("L75 — saveBusinessHours : isolation tenant (analyse du source)", () => {
  it("companyId vient uniquement de requireCompanyMember()", () => {
    expect(fn).toContain("requireCompanyMember()")
    expect(fn).not.toMatch(/requireCompanyId|resolvePublicRequestTenant/)
    expect(fn).not.toMatch(/d\.companyId|input\.companyId|days\[[^\]]*\]\.companyId/)
    expect(fn).toContain("companyId: tenant.id")
  })
  it("la recherche et la mise à jour filtrent par companyId", () => {
    expect(fn).toMatch(/\.select\([\s\S]*?eq\(businessHours\.companyId, tenant\.id\)/)
    expect(fn).toMatch(/\.update\(businessHours\)[\s\S]*?eq\(businessHours\.companyId, tenant\.id\)/)
  })
  it("aucune mise à jour par id seul", () => {
    expect(fn).not.toMatch(/\.where\(eq\(businessHours\.id,[^)]*\)\)/)
  })
  it("le jour est validé avant écriture", () => {
    expect(fn.indexOf("isValidDayOfWeek")).toBeGreaterThan(-1)
    expect(fn.indexOf("isValidDayOfWeek")).toBeLessThan(fn.indexOf("db\n"))
  })
})
