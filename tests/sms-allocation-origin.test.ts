import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { grantMonthlyAndAllocate } from "@/lib/sms/allocation-core"
import { BillingOriginError, resolveBillingOrigin } from "@/lib/billing/billing-origin"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Simule allocateDeltaToTenant : transfert du delta (granted − alloué). */
function ledger(opts: { sub: boolean; failAlloc?: boolean }) {
  const s = { balance: 0, granted: 0, allocated: 0, grantKey: null as string | null, transfers: 0 }
  const deps = {
    grant: vi.fn(async () => {
      if (s.grantKey === "2026-10") return false
      s.grantKey = "2026-10"
      s.balance += 20
      s.granted += 20
      return true
    }),
    hasSubAccount: vi.fn(async () => opts.sub),
    allocate: vi.fn(async () => {
      if (opts.failAlloc) return { ok: false, error: "AllMySMS down" }
      const delta = s.granted - s.allocated
      if (delta > 0) {
        s.allocated += delta
        s.transfers += 1
      }
      return { ok: true }
    }),
  }
  return { s, deps }
}

describe("grant mensuel PRO → allocation AllMySMS", () => {
  it("sous-compte existant : delta alloué", async () => {
    const { s, deps } = ledger({ sub: true })
    expect(await grantMonthlyAndAllocate(1, deps)).toEqual({ granted: true, allocated: true })
    expect(s.allocated).toBe(20)
  })

  it("deuxième exécution : aucun double transfert", async () => {
    const { s, deps } = ledger({ sub: true })
    await grantMonthlyAndAllocate(1, deps)
    await grantMonthlyAndAllocate(1, deps)
    expect(s.granted).toBe(20)
    expect(s.transfers).toBe(1)
    expect(deps.allocate).toHaveBeenCalledTimes(1)
  })

  it("pas de sous-compte : aucun crash, crédits en attente", async () => {
    const { s, deps } = ledger({ sub: false })
    await expect(grantMonthlyAndAllocate(1, deps)).resolves.toEqual({ granted: true, allocated: false })
    expect(deps.allocate).not.toHaveBeenCalled()
    expect(s.balance).toBe(20)
  })

  it("échec AllMySMS : crédits DB conservés", async () => {
    const { s, deps } = ledger({ sub: true, failAlloc: true })
    expect(await grantMonthlyAndAllocate(1, deps)).toEqual({ granted: true, allocated: false })
    expect(s.balance).toBe(20)
    expect(s.granted).toBe(20)
  })

  it("exception AllMySMS : ne remonte pas (cron continue)", async () => {
    const { deps } = ledger({ sub: true })
    deps.allocate.mockRejectedValueOnce(new Error("boom"))
    await expect(grantMonthlyAndAllocate(1, deps)).resolves.toEqual({ granted: true, allocated: false })
  })

  it("cron et activation SMS appellent allocateDeltaToTenant", () => {
    const cron = read("app/api/cron/reminders/route.ts")
    expect(cron).toContain("grantMonthlyAndAllocate(")
    expect(cron).toContain("allocate: allocateDeltaToTenant")
    const actions = read("app/admin/(dashboard)/parametres/sms-actions.ts")
    const save = actions.slice(actions.indexOf("export async function saveSmsReminderSettings"), actions.indexOf("export type CreateRechargeResult"))
    expect(save.indexOf("allocateDeltaToTenant(tenant.id)")).toBeGreaterThan(save.indexOf("ensureTenantSubAccount("))
  })
})

describe("Checkout SMS : origine Billing contrôlée", () => {
  const actions = read("app/admin/(dashboard)/parametres/sms-actions.ts")

  it("ne lit ni Host ni x-forwarded-host", () => {
    expect(actions).not.toMatch(/from "next\/headers"/)
    expect(actions).not.toMatch(/x-forwarded-host|x-forwarded-proto|get\("host"\)/)
  })

  it("utilise resolveBillingOrigin() et gère BillingOriginError", () => {
    const fn = actions.slice(actions.indexOf("export async function startSmsPackCheckoutAction"))
    expect(fn).toContain("resolveBillingOrigin()")
    expect(fn).toContain("e instanceof BillingOriginError")
  })

  it("origine invalide en production : échec propre", () => {
    expect(() =>
      resolveBillingOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://evil.example" } as never),
    ).toThrow(BillingOriginError)
  })
})
