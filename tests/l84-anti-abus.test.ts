import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L84 — anti-abus de la recherche publique de première date (règle Vercel Firewall
 * `booking-search`) et lecture unique des réglages, horaires et congés.
 * Vraie action, vrai moteur de disponibilité ; base, tenant et Firewall simulés.
 */
const { st, firewall, q } = vi.hoisted(() => {
  const st = {
    tenant: { id: 1 } as { id: number } | null,
    ip: "203.0.113.1",
    /** Dernier jour de congés par pro (clé "YYYY-MM-DD"). */
    offUntil: {} as Record<number, string>,
  }
  return {
    st,
    firewall: vi.fn(async (_id: string, _opts: { headers: Headers; rateLimitKey?: string }) => ({ rateLimited: false }) as { rateLimited: boolean; error?: string }),
    q: {
      getSettings: vi.fn(async () => ({ maxVehiclesPerDay: 4, bufferMin: 0, slotIntervalMin: 30, minNoticeHours: 0 })),
      getBusinessHours: vi.fn(async () =>
        [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, isOpen: true, openTime: "09:00", closeTime: "18:00", fixedStartTimes: null })),
      ),
      getTimeOff: vi.fn(async () => {
        const end = st.offUntil[st.tenant!.id]
        return end ? [{ startDate: "2000-01-01", endDate: end, startTime: null, endTime: null, publicLabel: null }] : []
      }),
      getActiveBookingsForDate: vi.fn(async (_date: string) => [] as { startTime: string; endTime: string }[]),
      countVehiclesForDate: vi.fn(async (_date: string) => 0),
    },
  }
})

vi.mock("@vercel/firewall", () => ({ checkRateLimit: firewall }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": st.ip }) }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND") } }))
vi.mock("@/lib/tenant", () => ({ resolvePublicRequestTenant: async () => st.tenant, resolveRequestTenant: async () => st.tenant, tenantAcceptsBookings: () => true }))
vi.mock("@/lib/booking/queries", () => ({ ...q, getServices: async () => [], getOptions: async () => [], getServicePrices: async () => [], getBookingByReference: async () => null }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/booking/pricing", () => ({ buildQuote: async () => ({}), computeDeposit: () => 0 }))
vi.mock("@/lib/booking/travel", () => ({ computeTravel: async () => ({}) }))
vi.mock("@/lib/promo/service", () => ({ validatePromoCode: async () => ({}), consumePromoCode: async () => true, normalizePromoCode: (c: string) => c }))
vi.mock("@/lib/booking/promotions-store", () => ({ getPromotionData: async () => ({}), loadPromotionData: async () => ({}), setBookingPromotionSnapshot: async () => {} }))
vi.mock("@/lib/booking/location", () => ({ getLocationConfig: async () => ({}), setBookingLocationType: async () => {}, getBookingLocationType: async () => null }))
vi.mock("@/lib/email/notifications", () => ({ sendBookingCreatedEmails: async () => {} }))
vi.mock("@/lib/analytics/queries", () => ({ recordBookingCompleted: async () => {} }))
vi.mock("@/lib/payments/queries", () => ({ getCompanyPaymentConfig: async () => null }))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: async () => true }))

import { findFirstAvailableDateAction } from "@/app/(site)/reservation/actions"
import { createAvailabilityContext, getAvailability } from "@/lib/booking/availability"
import { SEARCH_MAX_DAYS, SEARCH_RATE_LIMITED_MESSAGE } from "@/lib/booking/first-available"
import { SEARCH_RATE_LIMIT_ID, isSearchRateLimited } from "@/lib/booking/rate-limit"
import { dateWindow } from "@/lib/booking/v2"

const keyAt = (n: number) => dateWindow(new Date(), n, 1)[0]
const reads = () => [q.getSettings, q.getBusinessHours, q.getTimeOff, q.getActiveBookingsForDate, q.countVehiclesForDate]
const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

beforeEach(() => {
  vi.clearAllMocks()
  firewall.mockImplementation(async () => ({ rateLimited: false }))
  st.tenant = { id: 1 }
  st.ip = "203.0.113.1"
  st.offUntil = {}
})

describe("L84 — limite booking-search", () => {
  it.each([
    ["rateLimited", { rateLimited: true }],
    ["blocked", { rateLimited: false, error: "blocked" }],
  ])("au-delà de la limite (%s) : refus propre, aucune disponibilité lue", async (_n, answer) => {
    firewall.mockImplementation(async () => answer)
    expect(await findFirstAvailableDateAction(61, 1)).toEqual({ rateLimited: true })
    for (const r of reads()) expect(r).not.toHaveBeenCalled()
  })

  it("usage normal : même date qu'avant", async () => {
    st.offUntil[1] = keyAt(50)
    expect(await findFirstAvailableDateAction(62, 1)).toBe(keyAt(51))
    expect(firewall).toHaveBeenCalledWith(SEARCH_RATE_LIMIT_ID, expect.anything())
    expect(SEARCH_RATE_LIMIT_ID).toBe("booking-search")
  })

  it("limite vérifiée à chaque appel, même quand le résultat est en mémoire", async () => {
    expect(await findFirstAvailableDateAction(63, 1)).toBe(keyAt(await firstOpenOffset()))
    firewall.mockImplementation(async () => ({ rateLimited: true }))
    expect(await findFirstAvailableDateAction(63, 1)).toEqual({ rateLimited: true })
    expect(firewall).toHaveBeenCalledTimes(2)
  })

  it.each(["not-found", "unknown"])("règle indisponible (%s) : la recherche passe, même en production", async (error) => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    firewall.mockImplementation(async () => ({ rateLimited: false, error }))
    expect(await isSearchRateLimited(new Headers(), 1)).toBe(false)
    vi.unstubAllEnvs()
  })

  it("panne du service : la recherche passe", async () => {
    firewall.mockImplementation(async () => { throw new Error("down") })
    st.offUntil[1] = keyAt(20)
    expect(await findFirstAvailableDateAction(64, 1)).toBe(keyAt(21))
  })

  it("paramètres invalides ou tenant introuvable : null, sans consulter la limite", async () => {
    expect(await findFirstAvailableDateAction(0, 1)).toBeNull()
    st.tenant = null
    expect(await findFirstAvailableDateAction(65, 1)).toBeNull()
    expect(firewall).not.toHaveBeenCalled()
  })
})

/** Aujourd'hui s'il reste un créneau d'une heure environ, sinon demain. */
async function firstOpenOffset() {
  return (await getAvailability(keyAt(0), 63, 1)).available ? 0 : 1
}

describe("L84 — isolation entre pros", () => {
  it("clé de limite différente par pro et par IP", async () => {
    await findFirstAvailableDateAction(66, 1)
    st.tenant = { id: 2 }
    await findFirstAvailableDateAction(66, 1)
    st.ip = "198.51.100.7"
    await findFirstAvailableDateAction(66, 1)
    expect(firewall.mock.calls.map((c) => c[1].rateLimitKey)).toEqual(["1|203.0.113.1", "2|203.0.113.1", "2|198.51.100.7"])
  })

  it("pro A limité, pro B servi", async () => {
    firewall.mockImplementation(async (_id, o) => ({ rateLimited: o.rateLimitKey!.startsWith("1|") }))
    st.offUntil[2] = keyAt(20)
    expect(await findFirstAvailableDateAction(67, 1)).toEqual({ rateLimited: true })
    st.tenant = { id: 2 }
    expect(await findFirstAvailableDateAction(67, 1)).toBe(keyAt(21))
  })

  it("le contexte et la mémoire du pro A ne servent jamais au pro B", async () => {
    st.offUntil = { 1: keyAt(50), 2: keyAt(20) }
    expect(await findFirstAvailableDateAction(68, 1)).toBe(keyAt(51))
    st.tenant = { id: 2 }
    expect(await findFirstAvailableDateAction(68, 1)).toBe(keyAt(21))
    expect(q.getTimeOff).toHaveBeenCalledTimes(2)
  })
})

describe("L84 — lecture unique par recherche", () => {
  it("180 jours : réglages, horaires et congés lus une fois, relus à la recherche suivante", async () => {
    st.offUntil[1] = keyAt(400)
    expect(await findFirstAvailableDateAction(69, 1)).toBeNull()
    expect(q.getActiveBookingsForDate).toHaveBeenCalledTimes(SEARCH_MAX_DAYS)
    expect(q.countVehiclesForDate).toHaveBeenCalledTimes(SEARCH_MAX_DAYS)
    for (const r of [q.getSettings, q.getBusinessHours, q.getTimeOff]) expect(r).toHaveBeenCalledTimes(1)
    expect(await findFirstAvailableDateAction(70, 1)).toBeNull()
    for (const r of [q.getSettings, q.getBusinessHours, q.getTimeOff]) expect(r).toHaveBeenCalledTimes(2)
  })

  it("résultat en mémoire : rien n'est relu", async () => {
    await findFirstAvailableDateAction(71, 1)
    vi.clearAllMocks()
    await findFirstAvailableDateAction(71, 1)
    for (const r of reads()) expect(r).not.toHaveBeenCalled()
  })

  it("avec ou sans contexte : mêmes créneaux ; sans contexte, tout est relu à chaque appel", async () => {
    q.getActiveBookingsForDate.mockResolvedValue([{ startTime: "10:00", endTime: "11:00" }])
    const context = createAvailabilityContext()
    expect(q.getSettings).not.toHaveBeenCalled()
    const withContext = await getAvailability(keyAt(3), 60, 1, context)
    expect(withContext.slots.length).toBeGreaterThan(0)
    expect(await getAvailability(keyAt(3), 60, 1)).toEqual(withContext)
    await getAvailability(keyAt(3), 60, 1)
    expect(q.getSettings).toHaveBeenCalledTimes(3)
    q.getActiveBookingsForDate.mockResolvedValue([])
  })
})

describe("L84 — écran (contrôle sur le source)", () => {
  const screen = code("components/booking-v2/step-datetime.tsx")
  it("message exact, à la place de « Aucune disponibilité »", () => {
    expect(SEARCH_RATE_LIMITED_MESSAGE).toBe("Trop de demandes, réessayez dans un instant.")
    expect(screen).toMatch(/refused && offset === 0\s*\?\s*SEARCH_RATE_LIMITED_MESSAGE\s*:\s*nothingFound/)
    expect(screen).toMatch(/const nothingFound = [^\n]*!refused/)
  })
  it("un refus gardé par le navigateur est ignoré à la prochaine ouverture", () => {
    expect(screen).toContain("found.openId !== openId")
    expect(screen).toContain("dedupingInterval: 0")
  })
})
