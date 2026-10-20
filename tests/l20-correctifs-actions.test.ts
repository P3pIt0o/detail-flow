import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L20 — correctifs de la revue L19 sur les actions admin : activation
 * revérifiée, objets reconstruits, plafonds, message neutre. Base et session simulées.
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

const offer = (over: Record<string, unknown> = {}) => ({
  id: 5, name: "Offre", kind: "multi_services", active: false, priority: 0, stackable: false, stackableWithPromoCode: false,
  startsAt: null, endsAt: null, eligibleServiceIds: [1, 2], includeOptions: false,
  tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }],
  ...over,
})

beforeEach(() => {
  session.role = "OWNER"
  owned.services = [1, 2]
  owned.options = [98]
  vi.clearAllMocks()
})

describe("L20 — activation revérifiée", () => {
  it("prestation supprimée (ou d'un autre tenant) depuis la création : activation refusée, rien n'est écrit", async () => {
    store.listForAdmin.mockResolvedValueOnce({ ready: true, promotions: [offer({ eligibleServiceIds: [1, 999] })], equivalences: [], upsells: [] } as never)
    const r = await actions.setPromotionActiveAction(5, true)
    expect(r).toMatchObject({ ok: false })
    expect(store.setActive).not.toHaveBeenCalled()
  })
  it("offre dont tous les éléments existent : activée", async () => {
    store.listForAdmin.mockResolvedValueOnce({ ready: true, promotions: [offer()], equivalences: [], upsells: [] } as never)
    expect(await actions.setPromotionActiveAction(5, true)).toEqual({ ok: true, id: 5 })
    expect(store.setActive).toHaveBeenCalledWith("promotions", 11, 5, true)
  })
  it("désactivation : jamais bloquée par la revérification", async () => {
    owned.services = []
    expect(await actions.setPromotionActiveAction(5, false)).toEqual({ ok: true, id: 5 })
  })
})

describe("L20 — droits (OWNER / ADMIN uniquement)", () => {
  it("administrateur : activation et complément autorisés", async () => {
    session.role = "ADMIN"
    store.listForAdmin.mockResolvedValueOnce({ ready: true, promotions: [offer()], equivalences: [], upsells: [] } as never)
    expect(await actions.setPromotionActiveAction(5, true)).toEqual({ ok: true, id: 5 })
    expect(await actions.saveUpsell({ whenServiceId: 1, suggest: [{ type: "option", id: 98 }] })).toMatchObject({ ok: true })
  })
  it("employé : toute écriture refusée, y compris équivalences et compléments (activation, suppression)", async () => {
    session.role = "EMPLOYEE"
    for (const c of [
      () => actions.setEquivalenceActiveAction(1, true),
      () => actions.deleteEquivalenceAction(1),
      () => actions.setUpsellActiveAction(1, true),
      () => actions.deleteUpsellAction(1),
      () => actions.savePromotion({ name: "x", kind: "multi_services", tiers: [], eligibleServiceIds: null }, 5),
    ]) await expect(c()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(store.setActive).not.toHaveBeenCalled()
    expect(store.deleteRow).not.toHaveBeenCalled()
    expect(store.updatePromotion).not.toHaveBeenCalled()
  })
})

describe("L20 — données du navigateur reconstruites et plafonnées", () => {
  it("paliers : seuls minQuantity et value sont conservés", async () => {
    const tiers = [{ minQuantity: 2, value: { type: "percent", bps: 1000, junk: "x" }, junk: "y" }]
    await actions.savePromotion({ name: "2 prestations", kind: "multi_services", tiers: tiers as never, eligibleServiceIds: [1, 2] })
    expect(store.insertPromotion).toHaveBeenCalledWith(11, expect.objectContaining({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }] }))
  })
  it("plus de 10 paliers : refusé avec le message du moteur", async () => {
    const tiers = Array.from({ length: 12 }, (_, k) => ({ minQuantity: k + 1, value: { type: "percent" as const, bps: 100 + k } }))
    const r = await actions.savePromotion({ name: "Trop", kind: "multi_services", tiers, eligibleServiceIds: null })
    expect(r).toMatchObject({ ok: false, error: "Offre invalide." })
    if (!r.ok) expect(r.errors).toContain("Une offre compte au plus 10 paliers.")
  })
  it("équivalence : éléments reconstruits, clés superflues retirées", async () => {
    await actions.saveEquivalence({ a: { type: "service", id: 1, junk: 1 } as never, b: { type: "option", id: 98 }, reason: "Même traitement" })
    expect(store.insertEquivalence).toHaveBeenCalledWith(11, { a: { type: "service", id: 1 }, b: { type: "option", id: 98 }, reason: "Même traitement" })
  })
  it("compléments : dédoublonnés, reconstruits, 5 au plus", async () => {
    owned.options = [91, 92, 93, 94, 95, 96, 98]
    await actions.saveUpsell({ whenServiceId: 1, suggest: [{ type: "option", id: 98, junk: 1 } as never, { type: "option", id: 98 }] })
    expect(store.insertUpsell).toHaveBeenCalledWith(11, { whenServiceId: 1, suggest: [{ type: "option", id: 98 }], message: null })
    const six = [91, 92, 93, 94, 95, 96].map((id) => ({ type: "option" as const, id }))
    expect(await actions.saveUpsell({ whenServiceId: 1, suggest: six })).toEqual({ ok: false, error: "Choisissez au plus 5 compléments." })
  })
  it("base non migrée : message neutre pour le pro", async () => {
    store.insertPromotion.mockResolvedValueOnce(null)
    expect(await actions.savePromotion({ name: "2 prestations", kind: "multi_services", tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }], eligibleServiceIds: null })).toEqual({
      ok: false,
      error: "Cette fonctionnalité sera bientôt disponible.",
    })
  })
})
