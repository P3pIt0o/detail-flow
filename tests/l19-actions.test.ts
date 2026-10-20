import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L19 — actions admin : droits (propriétaire / administrateur), companyId de
 * session, anti-IDOR, validation par le moteur. Base et session simulées.
 */
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

// vi.hoisted : ces objets existent AVANT l'exécution des fabriques vi.mock (hissées).
const { session, owned, last, store } = vi.hoisted(() => ({
  session: { role: "OWNER" as "OWNER" | "ADMIN" | "EMPLOYEE", tenant: { id: 11, timezone: "Europe/Paris" } },
  /** Ids appartenant au tenant 11 : prestations 1, 2 ; options 98. */
  owned: { services: [1, 2], options: [98] } as Record<"services" | "options", number[]>,
  last: { table: "" },
  store: {
    insertPromotion: vi.fn(async (_companyId: number, _p: unknown) => 42 as number | null),
    updatePromotion: vi.fn(async (_companyId: number, _id: number, _p: unknown) => true),
    duplicatePromotion: vi.fn(async (_companyId: number, _id: number) => 43 as number | null),
    setActive: vi.fn(async (_t: string, _companyId: number, _id: number, _a: boolean) => true),
    deleteRow: vi.fn(async (_t: string, _companyId: number, _id: number) => true),
    insertEquivalence: vi.fn(async (_companyId: number, _r: unknown) => 7 as number | null),
    insertUpsell: vi.fn(async (_companyId: number, _u: unknown) => 8 as number | null),
    listForAdmin: vi.fn(async (_companyId: number) => ({ ready: true, promotions: [] as { id: number }[], equivalences: [], upsells: [] })),
    zonedDayBoundary: (d: string, _tz: string, e: string) => (e === "start" ? `${d}T00:00:00.000Z` : `${d}T23:59:59.999Z`),
  },
}))
vi.mock("@/lib/admin", () => ({
  requireCompanyMember: async () => ({ tenant: session.tenant, role: session.role }),
  requireCompanyRole: async (roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("NEXT_NOT_FOUND")
    return { tenant: session.tenant, role: session.role }
  },
}))

vi.mock("@/lib/db/schema", () => ({ services: { id: "s.id", companyId: "s.companyId", __t: "services" }, options: { id: "o.id", companyId: "o.companyId", __t: "options" } }))
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (c: unknown, v: unknown) => ({ c, v }),
  inArray: (c: unknown, v: number[]) => ({ c, v }),
}))
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (t: { __t: string }) => ({
        where: async (w: [{ v: number }, { v: number[] }]) => {
          last.table = t.__t
          const [{ v: companyId }, { v: wanted }] = w
          const pool = companyId === 11 ? owned[t.__t as "services" | "options"] : ([] as number[])
          return wanted.filter((id) => pool.includes(id)).map((id) => ({ id }))
        },
      }),
    }),
  },
}))

vi.mock("@/lib/booking/promotions-store", () => store)

import * as actions from "@/app/admin/(dashboard)/offres/actions"
const valid = { name: "2 prestations", kind: "multi_services" as const, tiers: [{ minQuantity: 2, value: { type: "percent" as const, bps: 1000 } }], eligibleServiceIds: [1, 2] }

beforeEach(() => {
  session.role = "OWNER"
  vi.clearAllMocks()
})

describe("L19 — droits", () => {
  it("un employé ne peut ni créer, ni modifier, ni dupliquer, ni activer, ni supprimer", async () => {
    session.role = "EMPLOYEE"
    const calls = [
      () => actions.savePromotion(valid),
      () => actions.duplicatePromotionAction(1),
      () => actions.setPromotionActiveAction(1, true),
      () => actions.deletePromotionAction(1),
      () => actions.saveEquivalence({ a: { type: "service", id: 1 }, b: { type: "option", id: 98 }, reason: "r" }),
      () => actions.saveUpsell({ whenServiceId: 1, suggest: [{ type: "option", id: 98 }] }),
    ]
    for (const c of calls) await expect(c()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(store.insertPromotion).not.toHaveBeenCalled()
    expect(store.deleteRow).not.toHaveBeenCalled()
    expect(store.setActive).not.toHaveBeenCalled()
  })
  it("administrateur autorisé ; offre créée DÉSACTIVÉE pour le tenant de la session", async () => {
    session.role = "ADMIN"
    const r = await actions.savePromotion(valid)
    expect(r).toMatchObject({ ok: true, id: 42 })
    expect(store.insertPromotion).toHaveBeenCalledWith(11, expect.objectContaining({ active: false, name: "2 prestations" }))
  })
  it("un employé peut consulter la liste", async () => {
    session.role = "EMPLOYEE"
    await expect(actions.listOffers()).resolves.toMatchObject({ ready: true })
  })
})

describe("L19 — anti-IDOR et validation", () => {
  it("prestation d'un autre tenant refusée, rien n'est écrit", async () => {
    const r = await actions.savePromotion({ ...valid, eligibleServiceIds: [1, 999] })
    expect(r).toEqual({ ok: false, error: "Une prestation sélectionnée est invalide." })
    expect(store.insertPromotion).not.toHaveBeenCalled()
  })
  it("option d'un autre tenant refusée (équivalence)", async () => {
    const r = await actions.saveEquivalence({ a: { type: "service", id: 1 }, b: { type: "option", id: 555 }, reason: "Même traitement" })
    expect(r).toMatchObject({ ok: false })
    expect(store.insertEquivalence).not.toHaveBeenCalled()
    expect(last.table).toBe("options")
  })
  it("offre invalide refusée avec les messages du moteur", async () => {
    const r = await actions.savePromotion({ ...valid, tiers: [] })
    expect(r).toMatchObject({ ok: false, error: "Offre invalide." })
    if (!r.ok) expect(r.errors).toContain("Ajoutez au moins un palier.")
  })
  it("équivalence sans motif refusée", async () => {
    const r = await actions.saveEquivalence({ a: { type: "service", id: 1 }, b: { type: "option", id: 98 }, reason: "  " })
    expect(r).toMatchObject({ ok: false, error: "Règle invalide." })
  })
  it("alertes de paliers renvoyées sans bloquer", async () => {
    const r = await actions.savePromotion({ ...valid, tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }, { minQuantity: 3, value: { type: "percent", bps: 500 } }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings?.[0]?.code).toBe("not_more_advantageous")
  })
  it("dates converties avec le fuseau de l'entreprise (fin de journée incluse)", async () => {
    await actions.savePromotion({ ...valid, startDate: "2026-11-01", endDate: "2026-11-30" })
    expect(store.insertPromotion).toHaveBeenCalledWith(11, expect.objectContaining({ startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-30T23:59:59.999Z" }))
  })
  it("modification d'une offre absente du tenant : refusée", async () => {
    expect(await actions.savePromotion(valid, 77)).toEqual({ ok: false, error: "Offre introuvable." })
    expect(store.updatePromotion).not.toHaveBeenCalled()
  })
})

describe("L19 — structure", () => {
  const src = readFileSync(join(process.cwd(), "app/admin/(dashboard)/offres/actions.ts"), "utf8")
  it("chaque action d'écriture exige OWNER/ADMIN ; seule la liste est ouverte aux membres", () => {
    const fns = src.split("export async function ").slice(1)
    for (const f of fns) {
      const name = f.slice(0, f.indexOf("("))
      if (name === "listOffers") expect(f).toContain("await requireCompanyMember()")
      else expect(f).toContain("await requireCompanyRole([...WRITE_ROLES])")
    }
    expect(src).toContain('const WRITE_ROLES = ["OWNER", "ADMIN"] as const')
  })
  it("aucun companyId lu depuis l'entrée", () => {
    expect(src).not.toMatch(/input\??\.companyId|companyId:\s*input/)
  })
})
