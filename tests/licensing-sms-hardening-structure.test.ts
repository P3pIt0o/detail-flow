import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Garde-fous structurels du hardening SMS : ces tests lisent le code source pour
 * garantir qu'aucune régression future ne retire les contrôles de licence sur
 * les chemins critiques (allocation / recharge / provisioning), et que la route
 * centrale sms-test reste exemptée. Aucun accès DB.
 */
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("hardening SMS — chokepoints protégés (structure)", () => {
  const send = read("lib/sms/send.ts")
  const credits = read("lib/sms/credits.ts")

  it("ensureTenantSubAccount vérifie canUseFeature", () => {
    const fn = send.slice(send.indexOf("export async function ensureTenantSubAccount"))
    expect(fn.slice(0, 1500)).toContain('canUseFeature(input.companyId, "sms")')
  })

  it("allocateCreditsToTenant vérifie canUseFeature", () => {
    const fn = send.slice(send.indexOf("export async function allocateCreditsToTenant"))
    expect(fn.slice(0, 1200)).toContain('canUseFeature(companyId, "sms")')
  })

  it("allocateDeltaToTenant vérifie canUseFeature", () => {
    const fn = send.slice(send.indexOf("export async function allocateDeltaToTenant"))
    expect(fn.slice(0, 1000)).toContain('canUseFeature(companyId, "sms")')
  })

  it("creditFromRecharge vérifie canUseFeature et fait un rollback (throw) si non licencié", () => {
    const fn = credits.slice(credits.indexOf("export async function creditFromRecharge"))
    expect(fn).toContain('canUseFeature(companyId, "sms")')
    expect(fn).toContain("throw FEATURE_LOCKED")
    // Le contrôle doit se situer AVANT le crédit du solde (insert/update smsCredits).
    const idxCheck = fn.indexOf("canUseFeature(companyId")
    const idxCredit = fn.indexOf("insert(smsCredits)")
    expect(idxCheck).toBeGreaterThan(0)
    expect(idxCredit).toBeGreaterThan(idxCheck)
  })

  it("la route centrale /api/admin/sms-test n'introduit aucune garde de licence tenant", () => {
    const route = read("app/api/admin/sms-test/route.ts")
    expect(route).not.toContain("canUseFeature")
    expect(route).not.toContain("hasFeature")
  })
})
