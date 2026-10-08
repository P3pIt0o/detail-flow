import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: async () => true }))
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ subLogin: "detailflow_t42", subApiKey: "sub-key" }],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values)
        return { where: async () => undefined }
      },
    }),
  },
}))

import { allocateCreditsToTenant } from "@/lib/sms/send"
import { allocateDeltaSerialized } from "@/lib/sms/allocation-core"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("AllMySMS manageSubAccountCredits — paramètre subAccount", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    state.updates = []
    process.env.ALLMYSMS_LOGIN = "central"
    process.env.ALLMYSMS_API_KEY = "central-key"
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ status: 200, text: async () => JSON.stringify({ status: "OK" }) })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("envoie subAccount (A majuscule) et jamais subaccount", async () => {
    const res = await allocateCreditsToTenant(42, 20)
    expect(res).toEqual({ ok: true, allocated: 20 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("manageSubAccountCredits")
    const params = new URLSearchParams(String(init.body))
    expect(params.get("subAccount")).toBe("detailflow_t42")
    expect(params.has("subaccount")).toBe(false)
    expect(String(init.body)).toContain("subAccount=detailflow_t42")
    expect(params.get("login")).toBe("central")
    expect(params.get("apiKey")).toBe("central-key")
    expect(params.get("credits")).toBe("20")
    expect(params.get("returnformat")).toBe("JSON")
  })

  it("status OK => allmysmsCreditsAllocated incrémenté + allmysmsLastAllocationAt renseigné", async () => {
    await allocateCreditsToTenant(42, 20)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toHaveProperty("allmysmsCreditsAllocated")
    expect(state.updates[0].allmysmsLastAllocationAt).toBeInstanceOf(Date)
  })

  it("rejeu avec delta 0 => aucun nouveau transfert", async () => {
    const totals = { granted: 20, purchased: 0, allocated: 0 }
    const deps = {
      withTenantLock: <T,>(_id: number, fn: () => Promise<T>) => fn(),
      readTotals: async () => ({ ...totals }),
      transfer: async (id: number, q: number) => {
        const r = await allocateCreditsToTenant(id, q)
        if (r.ok) totals.allocated += q
        return r
      },
    }
    await allocateDeltaSerialized(42, deps)
    await allocateDeltaSerialized(42, deps)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(totals.allocated).toBe(20)
  })
})

describe("Bonus bêta retiré pour les nouveaux comptes", () => {
  it("le provisioning n'appelle plus grantBetaBonus", () => {
    expect(read("lib/company/provision.ts")).not.toContain("grantBetaBonus")
  })

  it("l'UI SMS n'affiche plus le texte bonus bêta", () => {
    expect(read("components/admin/settings/sms-settings.tsx")).not.toContain("offerts avec votre compte bêta")
  })

  it("grantBetaBonus reste disponible pour l'historique", () => {
    expect(read("lib/sms/credits.ts")).toContain("export async function grantBetaBonus")
  })
})
