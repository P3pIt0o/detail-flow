import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CLZ, multiServices } from "./helpers/promotions-fixtures"

/**
 * L22 — non-régression par tenant avec le VRAI stockage des promotions
 * (lib/booking/promotions-store, base simulée) :
 *  - Spirit ACS et Rozan (ancien tunnel) : aucune offre lue, aucune requête sur
 *    les tables de promotions, montants strictement historiques ;
 *  - Cleanyzer (Booking V2) : offres et équivalence 158 ↔ 98 appliquées ;
 *    sans offre active : montants historiques.
 */
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND") } }))

const { st, inserts, promo, dbState } = vi.hoisted(() => ({
  dbState: {
    queried: [] as { table: string; companyId: unknown }[],
    rows: { promotions: [] as unknown[], cart_rules: [] as unknown[], upsell_suggestions: [] as unknown[] },
  },
  st: {
    tenant: { id: 104, customSiteKey: "cleanyzer" as string | null },
    depositType: "percent" as string,
    depositValue: 30,
    /** Lieu : atelier (sans frais) ou domicile (déplacement facturé). */
    workshop: true,
  },
  inserts: [] as { table: string; values: unknown }[],
  promo: {
    validatePromoCode: vi.fn(async (_i: unknown) => ({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000, targetServiceIds: null as number[] | null }) as Record<string, unknown>),
    consumePromoCode: vi.fn(async (_tx: unknown, _c: number, _id: number) => true),
  },
}))

vi.mock("@/lib/promo/service", () => promo)
vi.mock("@/lib/db/schema", () => ({ bookings: { __t: "bookings", id: "b.id", reference: "b.ref" }, bookingItems: { __t: "booking_items", id: "bi.id" }, bookingItemOptions: { __t: "booking_item_options" } }))
vi.mock("drizzle-orm", () => {
  // sql minimal : texte + paramètres, suffisant pour la base simulée ci-dessous.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.reduce((acc, s, i) => acc + s + (i < values.length ? (values[i] && typeof values[i] === "object" && "text" in (values[i] as object) ? (values[i] as { text: string }).text : "$") : ""), ""),
    values: values.filter((v) => !(v && typeof v === "object" && "text" in (v as object))),
  })
  sql.raw = (t: string) => ({ text: t, values: [] })
  return { eq: () => ({}), sql }
})
vi.mock("@/lib/db", () => {
  let id = 100
  const tx = {
    execute: async () => ({ rows: [] }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: (t: { __t: string }) => ({
      values: (values: unknown) => {
        inserts.push({ table: t.__t, values })
        const ret = async () => [{ id: ++id, reference: (values as { reference?: string }).reference }]
        return Object.assign(Promise.resolve(), { returning: ret })
      },
    }),
  }
  const execute = async (q: { text: string; values: unknown[] }) => {
    if (q.text.includes("information_schema.tables")) return { rows: [{ table_name: "promotions" }, { table_name: "cart_rules" }, { table_name: "upsell_suggestions" }] }
    if (q.text.includes("information_schema.columns")) return { rows: [{ column_name: "promotionDiscountCents" }, { column_name: "promotionSnapshot" }] }
    const m = /FROM "(promotions|cart_rules|upsell_suggestions)"/.exec(q.text)
    if (m) {
      dbState.queried.push({ table: m[1], companyId: q.values[0] })
      return { rows: dbState.rows[m[1] as "promotions" | "cart_rules" | "upsell_suggestions"] }
    }
    return { rows: [] }
  }
  return { db: { execute, transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})
vi.mock("@/lib/booking/queries", () => ({
  getSettings: async () => ({ vacationMode: false, bufferMin: 0, maxVehiclesPerDay: 10, depositType: st.depositType, depositValue: st.depositValue }),
  getActiveBookingsForDate: async () => [],
  countVehiclesForDate: async () => 0,
  getBookingByReference: async () => null,
  getServices: async () => [
    { id: CLZ.lavageExterieurEco, name: "Lavage extérieur", basePriceCents: 3000, durationMin: 60 },
    { id: CLZ.lavageInterieurEco, name: "Lavage intérieur", basePriceCents: 4000, durationMin: 60 },
    { id: CLZ.pharesService, name: "Rénovation des phares", basePriceCents: 6500, durationMin: 45 },
  ],
  getVehicleTypes: async () => [{ id: 1, name: "Citadine" }],
  getOptions: async () => [{ id: CLZ.pharesOption, name: "Phares (avec un lavage)", priceCents: 5000, durationMin: 30 }],
  getServicePrices: async () => [],
}))
vi.mock("@/lib/booking/location", () => ({ getLocationConfig: async () => ({}), setBookingLocationType: async () => {}, getBookingLocationType: async () => "workshop" }))
vi.mock("@/lib/booking/location-shared", () => ({ toPublicLocation: () => ({ workshopAddress: "1 rue de l'Atelier, Annecy" }), resolveLocationType: () => (st.workshop ? "workshop" : "client") }))
vi.mock("@/lib/booking/travel", () => ({
  computeTravel: async (address: string) => ({ ok: true, address, lat: 45.9, lng: 6.1, distanceKm: 12, billedDistanceKm: 12, feeCents: 1500 }),
}))
vi.mock("@/lib/booking/availability", () => ({
  getAvailability: async () => [],
  timeToMinutes: (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)),
  minutesToTime: (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
}))
vi.mock("@/lib/tenant", () => ({ resolvePublicRequestTenant: async () => st.tenant, resolveRequestTenant: async () => st.tenant, tenantAcceptsBookings: () => true }))
vi.mock("@/lib/email/notifications", () => ({ sendBookingCreatedEmails: async () => {} }))
vi.mock("@/lib/analytics/queries", () => ({ recordBookingCompleted: async () => {} }))
vi.mock("@/lib/payments/queries", () => ({ getCompanyPaymentConfig: async () => null }))
vi.mock("@/lib/payments/mode", () => ({ willRequireOnlinePayment: () => false }))
vi.mock("@/lib/licensing/enforce", () => ({ canUseFeature: async () => true }))
vi.mock("@/lib/booking/rate-limit", () => ({ isBookingRateLimited: async () => false, BOOKING_RATE_LIMITED_MESSAGE: "Trop de demandes." }))


import { createBookingAction, getQuoteAction } from "@/app/(site)/reservation/actions"

const line = (uid: string, serviceId: number, optionIds: number[] = [], over: Record<string, unknown> = {}) => ({ uid, serviceId, vehicleTypeId: 1, optionIds, brand: "Peugeot", model: "208", ...over })
const input = (selections: ReturnType<typeof line>[]) => ({
  selections,
  date: "2026-11-12",
  startTime: "09:00",
  customer: { name: "Client Test", email: "client@example.com", phone: "0600000000" },
  address: "",
})
const booking = () => inserts.find((i) => i.table === "bookings")!.values as Record<string, unknown>
const offerRow = { id: 1, name: "2 prestations = −10 %", kind: "multi_services", active: true, startsAt: null, endsAt: null, priority: 0, stackable: false, stackableWithPromoCode: false, scope: { eligibleServiceIds: null, includeOptions: false }, tiers: [{ minQuantity: 2, value: { type: "percent", bps: 1000 } }] }
const pharesRow = { id: 2, kind: "equivalence", itemA: { type: "service", id: CLZ.pharesService }, itemB: { type: "option", id: CLZ.pharesOption }, reason: "Même rénovation des phares", active: true }
const promoTables = () => dbState.queried.filter((q) => ["promotions", "cart_rules", "upsell_suggestions"].includes(q.table))

beforeEach(() => {
  inserts.length = 0
  dbState.queried.length = 0
  dbState.rows = { promotions: [offerRow], cart_rules: [pharesRow], upsell_suggestions: [] }
  vi.clearAllMocks()
  st.depositType = "percent"
  st.depositValue = 30
  st.workshop = true
})

// Ancien tunnel : lignes « véhicule:ligne », plusieurs prestations par véhicule.
const legacyCart = () => [line("v1:l1", CLZ.lavageExterieurEco, [CLZ.pharesOption]), line("v1:l2", CLZ.pharesService), line("v2:l1", CLZ.lavageInterieurEco)]

describe("L22 — Spirit ACS et Rozan : aucun effet des promotions", () => {
  for (const key of ["spirit-acs", "rozan"]) {
    it(`${key} : aucune requête sur les promotions, montants historiques (3000 + 5000 + 6500 + 4000)`, async () => {
      st.tenant = { id: 7, customSiteKey: key }
      const r = await createBookingAction(input(legacyCart()))
      expect(r).toMatchObject({ ok: true })
      expect(promoTables()).toEqual([])
      expect(booking()).toMatchObject({ subtotalCents: 18500, discountCents: 0, totalCents: 18500, depositCents: 5550, totalDurationMin: 60 + 30 + 45 + 60 })
      expect(inserts.filter((i) => i.table === "booking_items")).toHaveLength(3)
    })
  }
})

describe("L22 — Cleanyzer (Booking V2)", () => {
  it("offre et équivalence 158 ↔ 98 appliquées pour SON tenant uniquement (immatriculation fournie)", async () => {
    st.tenant = { id: CLZ.companyId, customSiteKey: "cleanyzer" }
    const car = [line("a:main", CLZ.lavageExterieurEco, [CLZ.pharesOption], { plate: "AB-123-CD" }), line(`a:x${CLZ.pharesService}`, CLZ.pharesService, [], { plate: "AB-123-CD" }), line("b:main", CLZ.lavageInterieurEco, [], { brand: "Renault", model: "Clio" })]
    const q = await getQuoteAction(car)
    await createBookingAction(input(car))
    expect(new Set(promoTables().map((x) => x.companyId))).toEqual(new Set([CLZ.companyId]))
    // Phares facturés une fois (option 50 €), −10 % sur les 2 lavages : 3000 + 4000 → 700.
    expect(booking()).toMatchObject({ subtotalCents: 12000, discountCents: 700, totalCents: 11300 })
    expect(q.pricing.totalCents).toBe(11300)
  })
  it("sans offre ni équivalence actives : montants strictement historiques", async () => {
    st.tenant = { id: CLZ.companyId, customSiteKey: "cleanyzer" }
    dbState.rows = { promotions: [], cart_rules: [], upsell_suggestions: [] }
    await createBookingAction(input([line("a:main", CLZ.lavageExterieurEco, [CLZ.pharesOption]), line("b:main", CLZ.pharesService, [], { brand: "Renault" })]))
    expect(booking()).toMatchObject({ subtotalCents: 3000 + 5000 + 6500, discountCents: 0, totalCents: 14500 })
  })
  it("réservation classique (une prestation, sans immatriculation) : seule l'offre s'applique, rien n'est regroupé", async () => {
    st.tenant = { id: CLZ.companyId, customSiteKey: "cleanyzer" }
    await createBookingAction(input([line("a:main", CLZ.lavageExterieurEco), line("b:main", CLZ.lavageInterieurEco)]))
    expect(booking()).toMatchObject({ subtotalCents: 7000, discountCents: 700, totalCents: 6300 })
  })
})
