import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

/* ----------------------- Faux magasin de données (2 tenants) ---------------------- */

import { externalBlocksForDay, type BusyBlock } from "@/lib/calendar-sync/ics-parse"

const TZ = "Europe/Paris"
const state = {
  tokens: new Map<string, number>(),
  blocks: new Map<number, BusyBlock[]>(),
  bookings: new Map<number, { id: number; reference: string }[]>(),
}
const feedFor = vi.fn(async (companyId: number) => ({
  tz: TZ,
  items: (state.bookings.get(companyId) ?? []).map((b) => ({
    id: b.id,
    reference: b.reference,
    date: "2026-11-30",
    startTime: "10:00",
    endTime: "11:00",
    customerName: `Client ${b.reference}`,
    customerPhone: "0600000000",
    address: "adresse",
    serviceNames: ["Lavage"],
  })),
}))
const storeMock = {
  findCompanyIdByFeedToken: vi.fn(async (t: string) => state.tokens.get(t) ?? null),
  getFeedBookings: feedFor,
  getExternalBusyForDate: vi.fn(async (companyId: number, date: string) => externalBlocksForDay(state.blocks.get(companyId) ?? [], date, TZ)),
  getCompanyTimezone: vi.fn(async () => TZ),
  getSyncSettings: vi.fn(async () => null),
  listDueCompanyIds: vi.fn(async () => []),
  recordSyncError: vi.fn(async () => undefined),
  replaceExternalBlocks: vi.fn(async () => true),
  markSyncAttempt: vi.fn(async () => undefined),
  saveExternalCalendar: vi.fn(async () => undefined),
}
vi.mock("@/lib/calendar-sync/store", () => storeMock)

const TOKEN_A = "A".repeat(43)
const TOKEN_B = "B".repeat(43)
const TOKEN_A2 = "C".repeat(43)

beforeEach(() => {
  state.tokens = new Map([
    [TOKEN_A, 1],
    [TOKEN_B, 2],
  ])
  state.blocks = new Map()
  state.bookings = new Map([
    [1, [{ id: 11, reference: "REF-A" }]],
    [2, [{ id: 22, reference: "REF-B" }]],
  ])
  vi.clearAllMocks()
})

/* ----------------------------------- Flux ----------------------------------- */

describe("L80 — flux privé par jeton", () => {
  it("jeton A : uniquement les rendez-vous de A (jamais ceux de B)", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route")
    const res = await GET(new Request("https://x/api/calendar/a"), { params: Promise.resolve({ token: `${TOKEN_A}.ics` }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/calendar")
    expect(res.headers.get("cache-control")).toContain("no-store")
    const body = await res.text()
    expect(body).toContain("REF-A")
    expect(body).not.toContain("REF-B")
    expect(feedFor).toHaveBeenCalledWith(1)
  })

  it("jeton régénéré : l'ancien renvoie 404, le nouveau 200", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route")
    state.tokens.delete(TOKEN_A)
    state.tokens.set(TOKEN_A2, 1)
    const old = await GET(new Request("https://x"), { params: Promise.resolve({ token: `${TOKEN_A}.ics` }) })
    const fresh = await GET(new Request("https://x"), { params: Promise.resolve({ token: `${TOKEN_A2}.ics` }) })
    expect(old.status).toBe(404)
    expect(fresh.status).toBe(200)
  })

  it("jeton inconnu ou mal formé : même 404, aucun accès base pour un jeton mal formé, aucune fuite", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route")
    const unknown = await GET(new Request("https://x"), { params: Promise.resolve({ token: `${"Z".repeat(43)}.ics` }) })
    const malformed = await GET(new Request("https://x"), { params: Promise.resolve({ token: "1" }) })
    expect(unknown.status).toBe(404)
    expect(malformed.status).toBe(404)
    expect(await unknown.text()).toBe(await malformed.text())
    expect(storeMock.findCompanyIdByFeedToken).toHaveBeenCalledTimes(1)
    expect(feedFor).not.toHaveBeenCalled()
  })

  it("erreur interne : 404 neutre (pas de détail)", async () => {
    const { GET } = await import("@/app/api/calendar/[token]/route")
    feedFor.mockRejectedValueOnce(new Error("db down: postgres://secret"))
    const res = await GET(new Request("https://x"), { params: Promise.resolve({ token: TOKEN_A }) })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain("secret")
  })
})

/* ------------------------------ getAvailability ------------------------------ */

describe("L80 — créneaux : les blocages du téléphone comptent, par tenant", () => {
  let currentTenant = 1

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T08:00:00Z"))
    currentTenant = 1
    vi.doMock("@/lib/tenant", () => ({ requireCompanyId: async () => currentTenant, getCompanyIdOrNull: async () => currentTenant }))
    vi.doMock("@/lib/booking/queries", () => ({
      getSettings: async () => ({ maxVehiclesPerDay: 4, bufferMin: 0, slotIntervalMin: 60, minNoticeHours: 0 }),
      getBusinessHours: async () => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, isOpen: true, openTime: "09:00", closeTime: "13:00" })),
      getTimeOff: async () => [],
      getActiveBookingsForDate: async () => [],
      countVehiclesForDate: async () => 0,
    }))
    vi.resetModules()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock("@/lib/tenant")
    vi.doUnmock("@/lib/booking/queries")
  })

  const block = (startIso: string, endIso: string, allDay = false): BusyBlock => ({ startsAt: new Date(startIso), endsAt: new Date(endIso), allDay })

  it("un événement externe 10:00–11:00 (Paris) retire exactement le créneau 10:00", async () => {
    state.blocks.set(1, [block("2026-11-30T09:00:00Z", "2026-11-30T10:00:00Z")])
    const { getAvailability } = await import("@/lib/booking/availability")
    const res = await getAvailability("2026-11-30", 60)
    expect(res.slots).toEqual(["09:00", "11:00", "12:00"])
  })

  it("jour entier bloqué : plus aucun créneau", async () => {
    state.blocks.set(1, [block("2026-11-29T23:00:00Z", "2026-11-30T23:00:00Z", true)])
    const { getAvailability } = await import("@/lib/booking/availability")
    const res = await getAvailability("2026-11-30", 60)
    expect(res.available).toBe(false)
    expect(res.reason).toBe("time_off")
  })

  it("les blocages de A n'affectent pas la disponibilité de B", async () => {
    state.blocks.set(1, [block("2026-11-29T23:00:00Z", "2026-11-30T23:00:00Z", true)])
    currentTenant = 2
    const { getAvailability } = await import("@/lib/booking/availability")
    const res = await getAvailability("2026-11-30", 60)
    expect(res.available).toBe(true)
    expect(res.slots).toHaveLength(4)
    expect(storeMock.getExternalBusyForDate).toHaveBeenCalledWith(2, "2026-11-30")
  })

  it("sans blocage externe : comportement inchangé", async () => {
    const { getAvailability } = await import("@/lib/booking/availability")
    expect((await getAvailability("2026-11-30", 60)).slots).toEqual(["09:00", "10:00", "11:00", "12:00"])
  })
})

/* ------------------------------ Relecture ------------------------------ */

describe("L80 — relecture : échec = anciens blocages conservés", () => {
  const ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:z\r\nDTSTART:20261130T090000Z\r\nDTEND:20261130T100000Z\r\nSUMMARY:Titre privé\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
  const mk = (fetchIcs: () => Promise<{ ok: true; text: string } | { ok: false; code: never }>) => ({
    fetchIcs: vi.fn(fetchIcs) as never,
    getExternalUrl: vi.fn(async () => "https://calendar.example.com/x.ics"),
    getTimezone: vi.fn(async () => TZ),
    markAttempt: vi.fn(async () => undefined),
    replaceBlocks: vi.fn(async () => true),
    saveCalendar: vi.fn(async () => undefined),
    recordError: vi.fn(async () => undefined),
  })

  it("succès : blocs remplacés, sans titre", async () => {
    const { syncCompany } = await import("@/lib/calendar-sync/sync")
    const deps = mk(async () => ({ ok: true, text: ICS }))
    const res = await syncCompany(1, new Date("2026-11-24T08:00:00Z"), deps)
    expect(res).toEqual({ ok: true, blocks: 1 })
    expect(deps.replaceBlocks).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(deps.replaceBlocks.mock.calls)).not.toContain("Titre")
    expect((deps.replaceBlocks.mock.calls as unknown[][])[0][0]).toBe(1)
  })

  it("échec réseau : aucun remplacement, statut d'erreur enregistré", async () => {
    const { syncCompany } = await import("@/lib/calendar-sync/sync")
    const deps = mk(async () => ({ ok: false, code: "timeout" as never }))
    const res = await syncCompany(1, new Date(), deps)
    expect(res).toEqual({ ok: false, code: "timeout" })
    expect(deps.replaceBlocks).not.toHaveBeenCalled()
    expect(deps.recordError).toHaveBeenCalledWith(1, "timeout", expect.any(Date), expect.any(String))
  })

  it("réponse qui n'est pas un agenda : anciens blocages conservés", async () => {
    const { syncCompany } = await import("@/lib/calendar-sync/sync")
    const deps = mk(async () => ({ ok: true, text: "<html>erreur</html>" }))
    expect(await syncCompany(1, new Date(), deps)).toEqual({ ok: false, code: "not_calendar" })
    expect(deps.replaceBlocks).not.toHaveBeenCalled()
    expect(deps.recordError).toHaveBeenCalledWith(1, "not_calendar", expect.any(Date), expect.any(String))
  })

  it("pas d'adresse : rien n'est lu", async () => {
    const { syncCompany } = await import("@/lib/calendar-sync/sync")
    const deps = mk(async () => ({ ok: true, text: ICS }))
    deps.getExternalUrl.mockResolvedValueOnce(null as never)
    expect(await syncCompany(1, new Date(), deps)).toEqual({ ok: false, code: "no_url" })
    expect(deps.fetchIcs).not.toHaveBeenCalled()
  })
})

/* ------------------------------ Cron ------------------------------ */

describe("L80 — cron", () => {
  const syncAllDue = vi.fn(async () => ({ checked: 0, ok: 0, failed: 0 }))
  beforeEach(() => {
    vi.doMock("@/lib/calendar-sync/sync", () => ({ syncAllDue }))
    vi.resetModules()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/calendar-sync/sync")
  })

  it("refusé sans CRON_SECRET (503) et avec un mauvais jeton (401) : aucune relecture", async () => {
    const { GET } = await import("@/app/api/cron/calendar-sync/route")
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(new Request("https://x"))).status).toBe(503)
    vi.stubEnv("CRON_SECRET", "s3cret")
    expect((await GET(new Request("https://x"))).status).toBe(401)
    expect((await GET(new Request("https://x", { headers: { authorization: "Bearer nope" } }))).status).toBe(401)
    expect(syncAllDue).not.toHaveBeenCalled()
  })

  it("accepté avec le bon jeton", async () => {
    const { GET } = await import("@/app/api/cron/calendar-sync/route")
    vi.stubEnv("CRON_SECRET", "s3cret")
    const res = await GET(new Request("https://x", { headers: { authorization: "Bearer s3cret" } }))
    expect(res.status).toBe(200)
    expect(syncAllDue).toHaveBeenCalledTimes(1)
  })

  it("planifié toutes les 15 minutes dans vercel.json", () => {
    const cfg = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"))
    expect(cfg.crons).toContainEqual({ path: "/api/cron/calendar-sync", schedule: "*/15 * * * *" })
  })
})

/* ------------------------------ Actions admin ------------------------------ */

describe("L80 — actions admin : la société vient de la session", () => {
  const calls = {
    setExternalUrl: vi.fn(async () => undefined),
    regenerateFeedToken: vi.fn(async () => undefined),
    ensureSyncSettings: vi.fn(async () => ({})),
    getSyncSettings: vi.fn(async () => null),
  }
  const syncCompany = vi.fn(async () => ({ ok: true, blocks: 0 }))
  const connectCalendar = vi.fn(async () => ({ ok: true, blocks: 0 }))
  const requireCompanyMember = vi.fn(async (_roles?: string[]) => ({ tenant: { id: 1 } }))

  beforeEach(() => {
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
    vi.doMock("@/lib/admin", () => ({ requireCompanyMember }))
    vi.doMock("@/lib/calendar-sync/store", () => calls)
    vi.doMock("@/lib/calendar-sync/sync", () => ({ syncCompany, connectCalendar }))
    vi.resetModules()
  })
  afterEach(() => {
    vi.doUnmock("next/cache")
    vi.doUnmock("@/lib/admin")
    vi.doUnmock("@/lib/calendar-sync/store")
    vi.doUnmock("@/lib/calendar-sync/sync")
  })

  it("enregistrer / régénérer / supprimer n'agissent que sur la société de la session, même si le formulaire en désigne une autre", async () => {
    const a = await import("@/app/admin/(dashboard)/mon-agenda/actions")
    const fd = new FormData()
    fd.set("address", "webcal://calendar.example.com/x.ics")
    fd.set("companyId", "2")
    expect((await a.saveExternalCalendarAction(fd)).ok).toBe(true)
    expect(connectCalendar).toHaveBeenCalledWith(1, "https://calendar.example.com/x.ics")
    await a.regenerateFeedAddressAction()
    expect(calls.regenerateFeedToken).toHaveBeenCalledWith(1)
    await a.removeExternalCalendarAction()
    expect(calls.setExternalUrl).toHaveBeenLastCalledWith(1, null)
    for (const c of [...calls.setExternalUrl.mock.calls, ...calls.regenerateFeedToken.mock.calls] as unknown[][]) expect(c[0]).not.toBe(2)
    expect(requireCompanyMember).toHaveBeenCalled()
  })

  it("adresse interdite : refusée avec un message clair, rien d'enregistré ni lu", async () => {
    const a = await import("@/app/admin/(dashboard)/mon-agenda/actions")
    for (const bad of ["http://example.com/x", "https://127.0.0.1/x", "https://169.254.169.254/", "n'importe quoi"]) {
      const fd = new FormData()
      fd.set("address", bad)
      const res = await a.saveExternalCalendarAction(fd)
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/adresse/i)
    }
    expect(calls.setExternalUrl).not.toHaveBeenCalled()
    expect(connectCalendar).not.toHaveBeenCalled()
  })

  it("un échec de lecture est remonté en message clair", async () => {
    connectCalendar.mockResolvedValueOnce({ ok: false, code: "timeout" } as never)
    const a = await import("@/app/admin/(dashboard)/mon-agenda/actions")
    const fd = new FormData()
    fd.set("address", "https://calendar.example.com/x.ics")
    const res = await a.saveExternalCalendarAction(fd)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Agenda non relié")
    expect(res.error).not.toMatch(/derniers créneaux|réessayons/i)
  })
})

/* ------------------------------ Isolation (source) ------------------------------ */

describe("L80 — toute requête sur table tenant filtre par companyId", () => {
  const src = readFileSync(path.join(process.cwd(), "lib/calendar-sync/store.ts"), "utf8")

  it("select/update/delete sur calendar_*, bookings et companies sont filtrés", () => {
    const statements = src.split(/await (?:tx|db)\s*\./).slice(1)
    expect(statements.length).toBeGreaterThan(8)
    for (const s of statements) {
      const head = s.slice(0, 700)
      if (/^(insert|transaction)/.test(head)) continue
      const isBookingItems = /from\(bookingItems\)/.test(head) // bookingId issus d'une requête filtrée par companyId
      const isListDue = /listDue/.test(head)
      const isToken = /feedToken, token/.test(head) // recherche par jeton secret (route publique)
      if (isBookingItems || isListDue || isToken) continue
      expect(head).toMatch(/companyId|companies\.id/)
    }
  })

  it("aucune adresse externe ni jeton dans les logs", () => {
    for (const f of ["lib/calendar-sync/store.ts", "lib/calendar-sync/sync.ts", "lib/calendar-sync/safe-fetch.ts", "app/api/calendar/[token]/route.ts"]) {
      expect(readFileSync(path.join(process.cwd(), f), "utf8")).not.toMatch(/console\.(log|error|warn)/)
    }
  })

  it("les actions ne lisent jamais companyId dans le formulaire", () => {
    const actions = readFileSync(path.join(process.cwd(), "app/admin/(dashboard)/mon-agenda/actions.ts"), "utf8")
    expect(actions).not.toMatch(/formData\.get\(["']company/i)
    expect(actions).toMatch(/requireCompanyMember/)
  })

  it("aucune restriction par plan (décision de Clément)", () => {
    for (const f of ["app/admin/(dashboard)/mon-agenda/actions.ts", "app/admin/(dashboard)/mon-agenda/page.tsx", "lib/calendar-sync/sync.ts"]) {
      expect(readFileSync(path.join(process.cwd(), f), "utf8")).not.toMatch(/canUseFeature|PLAN_MATRIX/)
    }
  })
})
