import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L82 — le VRAI `store.ts` face à une fausse base à deux sociétés qui évalue les
 * conditions : retirer un filtre `companyId` fait échouer ces tests.
 */
vi.mock("server-only", () => ({}))

type Row = Record<string, unknown>
type Cond = (row: Row) => boolean

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: null as unknown,
}))

vi.mock("@/lib/db/schema", () => {
  const table = (name: string, cols: string[]) => ({ __t: name, ...Object.fromEntries(cols.map((c) => [c, c])) })
  return {
    bookings: table("bookings", ["id", "reference", "date", "startTime", "endTime", "customerName", "customerPhone", "address", "companyId", "status"]),
    bookingItems: table("bookingItems", ["bookingId", "serviceName"]),
    calendarExternalBlocks: table("blocks", ["companyId", "startsAt", "endsAt", "allDay"]),
    calendarSyncSettings: table("settings", ["companyId", "feedToken", "externalUrl", "lastSyncAt", "lastError"]),
    companies: table("companies", ["id", "timezone"]),
  }
})

vi.mock("drizzle-orm", () => {
  const cmp = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number | string))
  return {
    eq: (c: string, v: unknown): Cond => (r) => r[c] === v,
    gte: (c: string, v: unknown): Cond => (r) => cmp(r[c]) >= cmp(v),
    lte: (c: string, v: unknown): Cond => (r) => cmp(r[c]) <= cmp(v),
    lt: (c: string, v: unknown): Cond => (r) => cmp(r[c]) < cmp(v),
    inArray: (c: string, v: unknown[]): Cond => (r) => v.includes(r[c]),
    isNull: (c: string): Cond => (r) => r[c] == null,
    isNotNull: (c: string): Cond => (r) => r[c] != null,
    and: (...cs: Cond[]): Cond => (r) => cs.every((c) => c(r)),
    or: (...cs: Cond[]): Cond => (r) => cs.some((c) => c(r)),
    count: () => "count",
    sql: () => ({}),
  }
})

vi.mock("@/lib/db", () => {
  type T = { __t: string }
  const query = (rows: () => Row[]) => {
    const q = {
      where: (c: Cond) => query(() => rows().filter(c)),
      limit: (n: number) => query(() => rows().slice(0, n)),
      orderBy: () => q,
      for: () => q,
      then: (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) =>
        (h.fail ? Promise.reject(h.fail) : Promise.resolve(rows())).then(res, rej),
    }
    return q
  }
  const db = {
    select: (fields?: Record<string, string>) => ({
      from: (t: T) => {
        const project = (r: Row) => (fields ? Object.fromEntries(Object.entries(fields).map(([k, c]) => [k, r[c]])) : { ...r })
        const q = query(() => h.tables[t.__t])
        const wrap = (inner: ReturnType<typeof query>): ReturnType<typeof query> => ({
          where: (c) => wrap(inner.where(c)),
          limit: (n) => wrap(inner.limit(n)),
          orderBy: () => wrap(inner),
          for: () => wrap(inner),
          then: (res, rej) => inner.then((rows) => res(rows.map(project)), rej),
        })
        return wrap(q)
      },
    }),
    insert: (t: T) => ({
      values: (v: Row | Row[]) => {
        const add = async () => void h.tables[t.__t].push(...(Array.isArray(v) ? v : [v]))
        return { onConflictDoNothing: add, then: (res: () => void, rej: (e: unknown) => void) => add().then(res, rej) }
      },
    }),
    update: (t: T) => ({
      set: (v: Row) => ({
        where: async (c: Cond) => void h.tables[t.__t].filter(c).forEach((r) => Object.assign(r, v)),
      }),
    }),
    delete: (t: T) => ({
      where: async (c: Cond) => {
        h.tables[t.__t] = h.tables[t.__t].filter((r) => !c(r))
      },
    }),
    transaction: async (cb: (tx: unknown) => unknown): Promise<unknown> => cb(db),
  }
  return { db }
})

import {
  findCompanyIdByFeedToken,
  getExternalBusyForDate,
  getFeedBookings,
  regenerateFeedToken,
  replaceExternalBlocks,
  setExternalUrl,
} from "@/lib/calendar-sync/store"

const NOW = new Date("2026-11-26T12:00:00Z")
const DAY = "2026-11-30"
const block = (companyId: number, from: string, to: string) => ({
  companyId,
  startsAt: new Date(`${DAY}T${from}:00Z`),
  endsAt: new Date(`${DAY}T${to}:00Z`),
  allDay: false,
})
const booking = (id: number, companyId: number, customerName: string) => ({
  id,
  companyId,
  reference: `R${id}`,
  date: DAY,
  startTime: "09:00",
  endTime: "10:00",
  customerName,
  customerPhone: "0600000000",
  address: "",
  status: "confirmed",
})
const blocksOf = (companyId: number) => h.tables.blocks.filter((b) => b.companyId === companyId)

beforeEach(() => {
  h.fail = null
  h.tables = {
    companies: [
      { id: 1, timezone: "Europe/Paris" },
      { id: 2, timezone: "Europe/Paris" },
    ],
    settings: [
      { companyId: 1, feedToken: "jeton-a", externalUrl: "https://a.example.com/a.ics" },
      { companyId: 2, feedToken: "jeton-b", externalUrl: "https://b.example.com/b.ics" },
    ],
    blocks: [block(1, "08:00", "09:00"), block(2, "13:00", "14:00")],
    bookings: [booking(10, 1, "Client A"), booking(20, 2, "Client B")],
    bookingItems: [
      { bookingId: 10, serviceName: "Lavage A" },
      { bookingId: 20, serviceName: "Lavage B" },
    ],
  }
})

describe("L82 — store réel : isolation tenant A / B", () => {
  it("blocages : B ne voit que les siens", async () => {
    expect((await getExternalBusyForDate(2, DAY)).ranges).toEqual([{ start: 14 * 60, end: 15 * 60 }])
  })

  it("flux : le jeton de A ne donne que les rendez-vous de A", async () => {
    const companyId = await findCompanyIdByFeedToken("jeton-a")
    expect(companyId).toBe(1)
    const { items } = await getFeedBookings(companyId!, NOW)
    expect(items.map((i) => i.customerName)).toEqual(["Client A"])
    expect(items[0].serviceNames).toEqual(["Lavage A"])
  })

  it("délier A ne touche ni l'adresse ni les blocages de B", async () => {
    await setExternalUrl(1, null)
    expect(blocksOf(1)).toHaveLength(0)
    expect(blocksOf(2)).toHaveLength(1)
    expect(h.tables.settings[1].externalUrl).toBe("https://b.example.com/b.ics")
  })

  it("relecture de A : les blocages de B restent", async () => {
    expect(await replaceExternalBlocks(1, [], NOW, "https://a.example.com/a.ics")).toBe(true)
    expect(blocksOf(1)).toHaveLength(0)
    expect(blocksOf(2)).toHaveLength(1)
  })

  it("régénérer le jeton de A laisse celui de B", async () => {
    await regenerateFeedToken(1)
    expect(await findCompanyIdByFeedToken("jeton-a")).toBeNull()
    expect(await findCompanyIdByFeedToken("jeton-b")).toBe(2)
  })
})

describe("L82 — erreur de base pendant la lecture des blocages", () => {
  it("table absente (migration non appliquée), code direct ou en cause : aucun blocage, rien au journal", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    for (const err of [Object.assign(new Error("x"), { code: "42P01" }), new Error("query", { cause: { code: "42P01" } })]) {
      h.fail = err
      expect(await getExternalBusyForDate(1, DAY)).toEqual({ fullDay: false, ranges: [] })
    }
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it("toute autre erreur : réservation non bloquée, journalisée sans détail de la requête", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    h.fail = Object.assign(new Error("params: secret-prive"), { code: "08006" })
    expect(await getExternalBusyForDate(1, DAY)).toEqual({ fullDay: false, ranges: [] })
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).toContain("08006")
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-prive")
    log.mockRestore()
  })
})
