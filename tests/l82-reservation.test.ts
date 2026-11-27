import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L82 — createBookingAction revérifie l'agenda du téléphone dans sa transaction
 * (créneau occupé → `slot_taken`, rien n'est écrit), tenant A / B compris.
 * Bouton « Relier à mon téléphone » dans l'en-tête du calendrier.
 */
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND") } }))

type Busy = { fullDay: boolean; ranges: { start: number; end: number }[] }
const FREE: Busy = { fullDay: false, ranges: [] }

const { st, inserts, busyByCompany, externalBusy } = vi.hoisted(() => {
  const busyByCompany = new Map<number, { fullDay: boolean; ranges: { start: number; end: number }[] }>()
  return {
    st: { tenantId: 1 },
    inserts: [] as { table: string; values: unknown }[],
    busyByCompany,
    externalBusy: vi.fn(async (companyId: number, _date: string) => busyByCompany.get(companyId) ?? { fullDay: false, ranges: [] }),
  }
})

vi.mock("@/lib/calendar-sync/store", () => ({ getExternalBusyForDate: externalBusy }))
vi.mock("@/lib/db/schema", () => ({ bookings: { __t: "bookings" }, bookingItems: { __t: "booking_items" }, bookingItemOptions: { __t: "booking_item_options" } }))
vi.mock("drizzle-orm", () => ({ eq: () => ({}), sql: () => ({}) }))
vi.mock("@/lib/db", () => {
  const tx = {
    execute: async () => ({ rows: [] }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: (t: { __t: string }) => ({
      values: (values: unknown) => {
        inserts.push({ table: t.__t, values })
        return Object.assign(Promise.resolve(), { returning: async () => [{ id: 1, reference: "R" }] })
      },
    }),
  }
  return { db: { transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})
vi.mock("@/lib/booking/queries", () => ({
  getSettings: async () => ({ vacationMode: false, bufferMin: 30, maxVehiclesPerDay: 10 }),
  getActiveBookingsForDate: async () => [],
  countVehiclesForDate: async () => 0,
  getBookingByReference: async () => null,
  getServices: async () => [],
  getOptions: async () => [],
  getServicePrices: async () => [],
}))
const LINE = { uid: "a", serviceId: 1, serviceName: "Lavage", vehicleTypeId: 1, vehicleTypeName: "Citadine", priceCents: 3000, durationMin: 60, options: [] }
vi.mock("@/lib/booking/pricing", () => ({ buildQuote: async () => ({ lines: [LINE], travelFeeCents: 0 }), computeDeposit: () => 0 }))
vi.mock("@/lib/booking/promotions-apply", () => ({
  MAX_BOOKING_LINES: 10,
  trustedVehicleKeys: () => [],
  priceBooking: () => ({ lines: [LINE], subtotalCents: 3000, discountCents: 0, totalDurationMin: 60, snapshot: null }),
  billedQuote: () => ({}),
  bookingSuggestions: () => [],
  quoteToCart: () => [],
}))
vi.mock("@/lib/booking/promotions-store", () => ({
  loadPromotionData: async () => ({ ok: true, promotions: [], equivalences: [], upsells: [] }),
  getPromotionData: async () => ({ promotions: [], equivalences: [], upsells: [] }),
  setBookingPromotionSnapshot: async () => {},
}))
vi.mock("@/lib/promo/service", () => ({ validatePromoCode: vi.fn(), consumePromoCode: vi.fn(), normalizePromoCode: (c: string) => c }))
vi.mock("@/lib/booking/location", () => ({ getLocationConfig: async () => ({}), setBookingLocationType: async () => {}, getBookingLocationType: async () => "workshop" }))
vi.mock("@/lib/booking/location-shared", () => ({ toPublicLocation: () => ({ workshopAddress: "1 rue de l'Atelier" }), resolveLocationType: () => "workshop" }))
vi.mock("@/lib/booking/travel", () => ({ computeTravel: vi.fn() }))
vi.mock("@/lib/booking/availability", () => ({
  getAvailability: async () => [],
  timeToMinutes: (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)),
  minutesToTime: (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
}))
vi.mock("@/lib/tenant", () => ({
  resolvePublicRequestTenant: async () => ({ id: st.tenantId, customSiteKey: null }),
  resolveRequestTenant: async () => ({ id: st.tenantId, customSiteKey: null }),
  tenantAcceptsBookings: () => true,
}))
vi.mock("@/lib/email/notifications", () => ({ sendBookingCreatedEmails: async () => {} }))
vi.mock("@/lib/analytics/queries", () => ({ recordBookingCompleted: async () => {} }))
vi.mock("@/lib/payments/queries", () => ({ getCompanyPaymentConfig: async () => null }))
vi.mock("@/lib/payments/mode", () => ({ willRequireOnlinePayment: () => false }))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: async () => true }))
vi.mock("@/lib/booking/rate-limit", () => ({ isBookingRateLimited: async () => false, isPromoRateLimited: async () => false, BOOKING_RATE_LIMITED_MESSAGE: "Trop de demandes." }))

import { createBookingAction } from "@/app/(site)/reservation/actions"

const book = () =>
  createBookingAction({
    selections: [{ uid: "a", serviceId: 1, vehicleTypeId: 1, optionIds: [], brand: "Peugeot", model: "208" }],
    date: "2027-03-10",
    startTime: "09:00",
    customer: { name: "Client Test", email: "client@example.com", phone: "0600000000" },
    address: "",
  })
const range = (start: number, end: number): Busy => ({ fullDay: false, ranges: [{ start, end }] })

beforeEach(() => {
  inserts.length = 0
  busyByCompany.clear()
  externalBusy.mockClear()
  st.tenantId = 1
})

describe("L82 — réservation et agenda du téléphone", () => {
  it("créneau occupé dans le téléphone : slot_taken, rien n'est écrit", async () => {
    busyByCompany.set(1, range(9 * 60 + 30, 11 * 60))
    expect(await book()).toMatchObject({ ok: false, code: "slot_taken" })
    expect(inserts).toHaveLength(0)
    expect(externalBusy).toHaveBeenCalledWith(1, "2027-03-10")
  })

  it("journée entière occupée : refusé", async () => {
    busyByCompany.set(1, { fullDay: true, ranges: [] })
    expect(await book()).toMatchObject({ ok: false, code: "slot_taken" })
    expect(inserts).toHaveLength(0)
  })

  it("occupation qui touche le créneau sans le chevaucher : accepté (même règle que les créneaux proposés)", async () => {
    busyByCompany.set(1, range(10 * 60, 11 * 60))
    expect(await book()).toMatchObject({ ok: true })
    busyByCompany.set(1, range(8 * 60, 9 * 60))
    expect(await book()).toMatchObject({ ok: true })
  })

  it("agenda libre : accepté", async () => {
    busyByCompany.set(1, FREE)
    expect(await book()).toMatchObject({ ok: true })
  })

  it("isolation : l'agenda du tenant A ne bloque pas le tenant B", async () => {
    busyByCompany.set(1, { fullDay: true, ranges: [] })
    st.tenantId = 2
    expect(await book()).toMatchObject({ ok: true })
    expect(externalBusy.mock.calls.map((c) => c[0])).toEqual([2])
    expect(inserts.find((i) => i.table === "bookings")!.values).toMatchObject({ companyId: 2 })
  })
})

describe("L82 — bouton du calendrier", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

  it("dans l'en-tête d'AdminCalendar, absent des captures marketing", () => {
    const calendar = read("components/admin/admin-calendar.tsx")
    expect(calendar).toContain("Relier à mon téléphone")
    expect(calendar).toContain("{phoneSync && (")
    expect(read("app/admin/(dashboard)/calendrier/page.tsx")).toContain("<AdminCalendar bookings={bookings} phoneSync />")
    expect(read("app/marketing/capture/[scene]/scenes.tsx")).not.toContain("phoneSync")
  })
})
