import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { allocateDeltaSerialized, grantMonthlyAndAllocate } from "@/lib/sms/allocation-core"
import {
  handleSmsPackWebhookEvent,
  isManualRechargeProvider,
  SMS_CHECKOUT_COMPLETE_ERROR,
  startSmsPackCheckoutCore,
  type SmsCheckoutStartDeps,
  type SmsPackWebhookDeps,
} from "@/lib/sms/checkout-core"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Ledger in-memory + mutex simulant pg_advisory_xact_lock. */
function ledger(opts: { sub?: boolean; failFirstTransfer?: boolean; transferDelayMs?: number } = {}) {
  const s = { granted: 0, purchased: 0, allocated: 0, grantKey: null as string | null, sent: 0, transfers: 0, sub: opts.sub ?? true }
  let chain: Promise<unknown> = Promise.resolve()
  let failNext = !!opts.failFirstTransfer
  const alloc = (id: number) =>
    allocateDeltaSerialized(id, {
      withTenantLock: (_id, fn) => {
        const run = chain.then(fn)
        chain = run.catch(() => {})
        return run
      },
      readTotals: async () => ({ granted: s.granted, purchased: s.purchased, allocated: s.allocated }),
      transfer: async (_id, q) => {
        if (opts.transferDelayMs) await new Promise((r) => setTimeout(r, opts.transferDelayMs))
        if (failNext) {
          failNext = false
          return { ok: false, allocated: 0, error: "AllMySMS down" }
        }
        s.sent += q
        s.allocated += q
        s.transfers += 1
        return { ok: true, allocated: q }
      },
    })
  const grant = async () => {
    if (s.grantKey === "2026-10") return false
    s.grantKey = "2026-10"
    s.granted += 20
    return true
  }
  return { s, alloc, grant, hasSub: async () => s.sub }
}

describe("1. retry du delta AllMySMS", () => {
  it("grant déjà fait mais allocation précédente échouée → retentée, delta transféré une seule fois", async () => {
    const l = ledger({ failFirstTransfer: true })
    const deps = { grant: l.grant, hasSubAccount: l.hasSub, allocate: l.alloc }
    expect(await grantMonthlyAndAllocate(1, deps)).toEqual({ granted: true, allocated: false })
    expect(l.s.sent).toBe(0)
    expect(l.s.granted).toBe(20)
    expect(await grantMonthlyAndAllocate(1, deps)).toEqual({ granted: false, allocated: true })
    expect(l.s.sent).toBe(20)
    await grantMonthlyAndAllocate(1, deps)
    expect(l.s.sent).toBe(20)
    expect(l.s.transfers).toBe(1)
  })
})

describe("4. sérialisation allocateDeltaToTenant", () => {
  it("2 appels concurrents, delta 20 → 20 transférés, jamais 40", async () => {
    const l = ledger({ transferDelayMs: 10 })
    l.s.granted = 20
    const [a, b] = await Promise.all([l.alloc(1), l.alloc(1)])
    expect(l.s.sent).toBe(20)
    expect(l.s.allocated).toBe(20)
    expect([a.allocated, b.allocated].sort()).toEqual([0, 20])
  })

  it("allocateDeltaToTenant utilise pg_advisory_xact_lock et relit après verrou", () => {
    const src = read("lib/sms/send.ts")
    expect(src).toContain("pg_advisory_xact_lock")
    expect(src).toContain("allocateDeltaSerialized(")
  })
})

const session = {
  id: "cs_1",
  mode: "payment",
  payment_status: "paid",
  currency: "eur",
  amount_total: 300,
  payment_intent: "pi_1",
  metadata: { detailflow_kind: "sms_pack", company_id: "7", sms_recharge_request_id: "11", sms_reference: "R", sms_quantity: "20" },
}

describe("2. pack payé sans sous-compte", () => {
  it("HTTP 200, crédit unique, aucune allocation, puis delta transféré à l'activation", async () => {
    const l = ledger({ sub: false })
    let status = "pending"
    const deps: SmsPackWebhookDeps = {
      getRecharge: async () => ({ id: 11, companyId: 7, quantity: 20, amountCents: 300, status, paymentProvider: "stripe", stripeCheckoutSessionId: "cs_1" }),
      credit: vi.fn(async () => {
        const already = status === "paid"
        if (!already) {
          status = "paid"
          l.s.purchased += 20
        }
        return { ok: true as const, already, quantity: 20, newBalance: l.s.purchased }
      }),
      cancel: async () => false,
      allocate: vi.fn(l.alloc),
      hasSubAccount: l.hasSub,
    }
    const r1 = await handleSmsPackWebhookEvent("checkout.session.completed", session, deps)
    expect(r1.status).toBe(200)
    expect(r1.body).toMatchObject({ credited: true, allocationPending: true })
    const r2 = await handleSmsPackWebhookEvent("checkout.session.completed", session, deps)
    expect(r2.status).toBe(200)
    expect(l.s.purchased).toBe(20)
    expect(deps.allocate).not.toHaveBeenCalled()

    l.s.sub = true // activation : ensureTenantSubAccount puis allocateDeltaToTenant
    await l.alloc(7)
    expect(l.s.sent).toBe(20)
  })

  it("le webhook réel fournit hasSubAccount", () => {
    expect(read("lib/sms/checkout.ts")).toContain("hasSubAccount: tenantHasSmsSubAccount")
  })
})

describe("3. super-admin : manuel uniquement", () => {
  it("seul le provider manual est pilotable", () => {
    expect(isManualRechargeProvider("manual")).toBe(true)
    expect(isManualRechargeProvider("stripe")).toBe(false)
    expect(isManualRechargeProvider(null)).toBe(false)
  })

  it("liste filtrée et actions refusées côté serveur pour Stripe", () => {
    expect(read("lib/super-admin/queries.ts")).toMatch(/eq\(smsRechargeRequests\.paymentProvider, "manual"\)/)
    const actions = read("app/super-admin/actions.ts")
    const confirm = actions.slice(actions.indexOf("export async function confirmSmsRechargeAction"))
    expect(confirm.indexOf("isManualRecharge(requestId)")).toBeLessThan(confirm.indexOf("creditFromRecharge(requestId)"))
    const cancel = actions.slice(actions.indexOf("export async function cancelSmsRechargeAction"))
    expect(cancel.indexOf("isManualRecharge(requestId)")).toBeLessThan(cancel.indexOf(".update(smsRechargeRequests)"))
  })
})

function checkoutDeps(over: Partial<SmsCheckoutStartDeps> = {}) {
  const calls = { cancelled: [] as number[], expired: [] as string[], created: 0, attached: [] as number[] }
  const deps: SmsCheckoutStartDeps = {
    findLatestPending: async () => null,
    retrieveSession: async (id) => ({ id, url: "https://checkout/old", status: "open" }),
    cancelPending: async (id) => void calls.cancelled.push(id),
    insertRecharge: async () => ({ id: 99 }),
    createSession: async () => {
      calls.created += 1
      return { id: "cs_new", url: "https://checkout/new", status: "open" }
    },
    attachSession: async (id) => void calls.attached.push(id),
    expireSession: async (id) => void calls.expired.push(id),
    ...over,
  }
  return { deps, calls }
}

describe("5. cycle de vie Checkout", () => {
  it("session open → même Checkout réutilisé", async () => {
    const { deps, calls } = checkoutDeps({ findLatestPending: async () => ({ id: 5, sessionId: "cs_old" }) })
    expect(await startSmsPackCheckoutCore(deps)).toEqual({ url: "https://checkout/old" })
    expect(calls.created).toBe(0)
  })

  it("session complete → aucun nouveau Checkout", async () => {
    const { deps, calls } = checkoutDeps({
      findLatestPending: async () => ({ id: 5, sessionId: "cs_old" }),
      retrieveSession: async (id) => ({ id, url: null, status: "complete" }),
    })
    await expect(startSmsPackCheckoutCore(deps)).rejects.toThrow(SMS_CHECKOUT_COMPLETE_ERROR)
    expect(calls.created).toBe(0)
    expect(calls.cancelled).toEqual([])
  })

  it("session expired → ancienne recharge annulée + nouveau Checkout", async () => {
    const { deps, calls } = checkoutDeps({
      findLatestPending: async () => ({ id: 5, sessionId: "cs_old" }),
      retrieveSession: async (id) => ({ id, url: null, status: "expired" }),
    })
    expect(await startSmsPackCheckoutCore(deps)).toEqual({ url: "https://checkout/new" })
    expect(calls.cancelled).toEqual([5])
    expect(calls.attached).toEqual([99])
  })

  it("pending sans session → orpheline annulée", async () => {
    const { deps, calls } = checkoutDeps({ findLatestPending: async () => ({ id: 6, sessionId: null }) })
    await startSmsPackCheckoutCore(deps)
    expect(calls.cancelled).toEqual([6])
  })

  it("création Stripe échouée → recharge annulée", async () => {
    const { deps, calls } = checkoutDeps({
      createSession: async () => {
        throw new Error("stripe down")
      },
    })
    await expect(startSmsPackCheckoutCore(deps)).rejects.toThrow("stripe down")
    expect(calls.cancelled).toEqual([99])
  })

  it("rattachement DB échoué → session expirée, aucune URL", async () => {
    const { deps, calls } = checkoutDeps({
      attachSession: async () => {
        throw new Error("db down")
      },
    })
    await expect(startSmsPackCheckoutCore(deps)).rejects.toThrow("db down")
    expect(calls.expired).toEqual(["cs_new"])
    expect(calls.cancelled).toEqual([99])
  })

  it("la recharge la plus récente est utilisée", () => {
    expect(read("lib/sms/checkout.ts")).toContain("orderBy(desc(smsRechargeRequests.id))")
  })
})
