import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Autorisation multi-tenant des actions clients admin :
 * le companyId provient UNIQUEMENT de requireCompanyMember (session +
 * appartenance), jamais de l'URL, du FormData ou du navigateur.
 */

const TENANT_A = 101
const TENANT_B = 202

type Filter = { op: string; col?: string; val?: unknown; parts?: Filter[] }

const state = vi.hoisted(() => ({
  member: null as null | { tenantId: number } | "unauthenticated" | "not-member",
  selectResults: [] as unknown[][],
  selectWheres: [] as unknown[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { set: Record<string, unknown>; where: unknown }[],
}))

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>()
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }),
    and: (...parts: unknown[]) => ({ op: "and", parts }),
  }
})

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: vi.fn(async () => {
    if (state.member === "unauthenticated") throw new Error("NEXT_REDIRECT:/admin/login")
    if (state.member === "not-member" || state.member === null) throw new Error("NEXT_NOT_FOUND")
    return {
      user: { id: "u", email: "a@a.fr", name: "A" },
      tenant: { id: state.member.tenantId },
      role: "OWNER",
      isSuperAdmin: false,
    }
  }),
}))

vi.mock("@/lib/tenant", () => ({
  requireCompanyId: vi.fn(async () => {
    throw new Error("requireCompanyId must not be used by admin client actions")
  }),
}))

vi.mock("@/lib/db", () => {
  const query = (where: { current: unknown }) => {
    const q: Record<string, unknown> = {}
    q.from = () => q
    q.where = (w: unknown) => {
      where.current = w
      state.selectWheres.push(w)
      return q
    }
    q.limit = () => q
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(state.selectResults.shift() ?? []).then(res, rej)
    return q
  }
  return {
    db: {
      select: vi.fn(() => query({ current: null })),
      insert: vi.fn(() => ({
        values: vi.fn(async (v: Record<string, unknown>) => {
          state.inserts.push(v)
        }),
      })),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            state.updates.push({ set, where })
          },
        }),
      })),
    },
  }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/licensing/enforce", () => ({
  canCreateWithinLimit: vi.fn(async () => true),
  LIMIT_REACHED_MESSAGE: "Limite atteinte",
}))

import { db } from "@/lib/db"
import { createClientAction, updateClientAction } from "@/app/admin/(dashboard)/clients/actions"

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const VALID_CLIENT = { name: "Jean Dupont", email: "jean@client.fr", phone: "0601020304", customerType: "individual" }

function flatten(f: unknown): Filter[] {
  const node = f as Filter
  if (!node) return []
  if (node.op === "and") return (node.parts ?? []).flatMap(flatten)
  return [node]
}

beforeEach(() => {
  state.member = null
  state.selectResults = []
  state.selectWheres = []
  state.inserts = []
  state.updates = []
  vi.mocked(db.select).mockClear()
  vi.mocked(db.insert).mockClear()
  vi.mocked(db.update).mockClear()
})

describe("createClientAction — autorisation tenant", () => {
  it("utilisateur non connecté : refus, aucune requête DB", async () => {
    state.member = "unauthenticated"
    await expect(createClientAction(form(VALID_CLIENT))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("membre de A sous ?tenant=B (non membre de B) : refus neutre, aucune ligne de B créée", async () => {
    state.member = "not-member"
    await expect(createClientAction(form(VALID_CLIENT))).rejects.toThrow(/NEXT_NOT_FOUND/)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("aucune énumération email/téléphone de B : le refus précède tout contrôle de doublon", async () => {
    state.member = "not-member"
    state.selectResults = [[{ id: 9, email: "jean@client.fr", phone: null }]]
    const outcome = await createClientAction(form(VALID_CLIENT)).then(
      (r) => r.message,
      (e: Error) => e.message,
    )
    expect(outcome).not.toMatch(/existe déjà/)
    expect(state.selectWheres).toHaveLength(0)
  })

  it("membre légitime de A : création scopée à A même si le FormData contient companyId=B", async () => {
    state.member = { tenantId: TENANT_A }
    state.selectResults = [[]]
    const r = await createClientAction(form({ ...VALID_CLIENT, companyId: String(TENANT_B) }))
    expect(r.success).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].companyId).toBe(TENANT_A)
    const dupFilter = flatten(state.selectWheres[0])
    expect(dupFilter).toContainEqual({ op: "eq", col: "companyId", val: TENANT_A })
  })

  it("doublon détecté uniquement parmi les clients du tenant courant", async () => {
    state.member = { tenantId: TENANT_A }
    state.selectResults = [[{ id: 1, email: "jean@client.fr", phone: null }]]
    const r = await createClientAction(form(VALID_CLIENT))
    expect(r.success).toBe(false)
    expect(flatten(state.selectWheres[0])).toEqual([{ op: "eq", col: "companyId", val: TENANT_A }])
    expect(state.inserts).toHaveLength(0)
  })
})

describe("updateClientAction — autorisation tenant", () => {
  it("utilisateur non connecté : modification impossible", async () => {
    state.member = "unauthenticated"
    await expect(updateClientAction(5, form(VALID_CLIENT))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it("membre de A sous ?tenant=B : refus neutre, client de B non modifié", async () => {
    state.member = "not-member"
    await expect(updateClientAction(77, form(VALID_CLIENT))).rejects.toThrow(/NEXT_NOT_FOUND/)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it("membre de A ciblant l'id d'un client de B : introuvable (contrôle id + companyId=A), aucune écriture", async () => {
    state.member = { tenantId: TENANT_A }
    state.selectResults = [[]]
    const r = await updateClientAction(77, form(VALID_CLIENT))
    expect(r).toEqual({ success: false, message: "Client introuvable." })
    expect(flatten(state.selectWheres[0])).toEqual([
      { op: "eq", col: "id", val: 77 },
      { op: "eq", col: "companyId", val: TENANT_A },
    ])
    expect(db.update).not.toHaveBeenCalled()
  })

  it("membre légitime de A : mise à jour scopée id + companyId=A", async () => {
    state.member = { tenantId: TENANT_A }
    state.selectResults = [[{ id: 5 }], [{ id: 5, email: "jean@client.fr", phone: null }]]
    const r = await updateClientAction(5, form(VALID_CLIENT))
    expect(r.success).toBe(true)
    expect(state.updates).toHaveLength(1)
    expect(flatten(state.updates[0].where)).toEqual([
      { op: "eq", col: "id", val: 5 },
      { op: "eq", col: "companyId", val: TENANT_A },
    ])
    expect(state.updates[0].set).not.toHaveProperty("companyId")
  })
})
