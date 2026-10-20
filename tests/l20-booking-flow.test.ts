import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CLZ, multiServices } from "./helpers/promotions-fixtures"

/**
 * L20 — createBookingAction avec offres automatiques : montants, acompte,
 * lignes normalisées, code promo arbitré (consommé seulement s'il est retenu),
 * instantané, refus si la base de promotions est en erreur, isolation tenant.
 * Vrai moteur de prix (buildQuote) et vrai moteur de promotions ; base,
 * tenant et services externes simulés.
 */
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND") } }))

const { st, inserts, promo, promoStore } = vi.hoisted(() => ({
  st: {
    tenant: { id: 104, customSiteKey: "cleanyzer" as string | null },
    depositType: "percent" as string,
    depositValue: 30,
  },
  inserts: [] as { table: string; values: unknown }[],
  promo: {
    validatePromoCode: vi.fn(async (_i: unknown) => ({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000, targetServiceIds: null as number[] | null }) as Record<string, unknown>),
    consumePromoCode: vi.fn(async (_tx: unknown, _c: number, _id: number) => true),
  },
  promoStore: {
    loadPromotionData: vi.fn(async (_t: unknown) => ({ ok: true, promotions: [] as unknown[], equivalences: [] as unknown[], upsells: [] }) as Record<string, unknown>),
    getPromotionData: vi.fn(async (_t: unknown) => ({ promotions: [] as unknown[], equivalences: [] as unknown[], upsells: [] })),
    setBookingPromotionSnapshot: vi.fn(async (_tx: unknown, _c: number, _b: number, _cents: number, _s: unknown) => {}),
  },
}))

vi.mock("@/lib/promo/service", () => promo)
vi.mock("@/lib/booking/promotions-store", () => promoStore)
vi.mock("@/lib/db/schema", () => ({ bookings: { __t: "bookings", id: "b.id", reference: "b.ref" }, bookingItems: { __t: "booking_items", id: "bi.id" }, bookingItemOptions: { __t: "booking_item_options" } }))
vi.mock("drizzle-orm", () => ({ eq: () => ({}), sql: () => ({}) }))
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
  return { db: { transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
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
vi.mock("@/lib/booking/location-shared", () => ({ toPublicLocation: () => ({ workshopAddress: "1 rue de l'Atelier, Annecy" }), resolveLocationType: () => "workshop" }))
vi.mock("@/lib/booking/travel", () => ({ computeTravel: async () => ({ ok: false, error: "x" }) }))
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

import { createBookingAction, validatePromoCodeAction } from "@/app/(site)/reservation/actions"

const sel = (uid: string, serviceId: number, optionIds: number[] = []) => ({ uid, serviceId, vehicleTypeId: 1, optionIds, brand: "Peugeot", model: "208" })
const input = (selections: ReturnType<typeof sel>[], promoCode?: string) => ({
  selections,
  date: "2026-11-12",
  startTime: "09:00",
  customer: { name: "Client Test", email: "client@example.com", phone: "0600000000" },
  address: "",
  promoCode,
})
const booking = () => inserts.find((i) => i.table === "bookings")!.values as Record<string, unknown>
const items = () => inserts.filter((i) => i.table === "booking_items").map((i) => i.values as Record<string, unknown>)
const phares = { id: 1, a: { type: "service", id: CLZ.pharesService }, b: { type: "option", id: CLZ.pharesOption }, reason: "Même rénovation des phares" }
const withData = (promotions: unknown[], equivalences: unknown[] = []) => {
  promoStore.loadPromotionData.mockResolvedValue({ ok: true, promotions, equivalences, upsells: [] })
  promoStore.getPromotionData.mockResolvedValue({ promotions, equivalences, upsells: [] })
}

beforeEach(() => {
  inserts.length = 0
  vi.clearAllMocks()
  withData([])
  promo.validatePromoCode.mockResolvedValue({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000, targetServiceIds: null })
  promo.consumePromoCode.mockResolvedValue(true)
  st.tenant = { id: 104, customSiteKey: "cleanyzer" }
})

describe("L20 — sans offre : réservation strictement identique à avant", () => {
  it("montants, acompte et lignes du devis ; aucun instantané", async () => {
    const r = await createBookingAction(input([sel("a", CLZ.lavageExterieurEco, [CLZ.pharesOption]), sel("b", CLZ.lavageInterieurEco)]))
    expect(r).toMatchObject({ ok: true })
    expect(booking()).toMatchObject({ servicesCents: 7000, optionsCents: 5000, subtotalCents: 12000, discountCents: 0, totalCents: 12000, depositCents: 3600, totalDurationMin: 150 })
    expect(promoStore.setBookingPromotionSnapshot).not.toHaveBeenCalled()
  })
  it("code promo seul : appliqué et consommé comme avant", async () => {
    await createBookingAction(input([sel("a", CLZ.lavageExterieurEco)], "bienvenue"))
    expect(booking()).toMatchObject({ discountCents: 1000, totalCents: 2000, promoCodeId: 9 })
    expect(promo.consumePromoCode).toHaveBeenCalledTimes(1)
  })
})

describe("L20 — offres automatiques", () => {
  it("−10 % dès 2 prestations : total, acompte et instantané figés", async () => {
    withData([multiServices()])
    const r = await createBookingAction(input([sel("a", CLZ.lavageExterieurEco, [CLZ.pharesOption]), sel("b", CLZ.lavageInterieurEco)]))
    expect(r).toMatchObject({ ok: true })
    expect(booking()).toMatchObject({ subtotalCents: 12000, discountCents: 700, totalCents: 11300, depositCents: 3390, promoCodeId: null })
    const [, cid, , cents, snap] = promoStore.setBookingPromotionSnapshot.mock.calls[0]
    expect(cid).toBe(104)
    expect(cents).toBe(700)
    expect(snap).toMatchObject({ v: 1, promotionDiscountCents: 700, totalDiscountCents: 700, promotions: [{ id: 1, discountCents: 700 }] })
  })
  it("même traitement deux fois sur un véhicule : facturé une fois, au moins cher, durée comprise", async () => {
    withData([], [phares])
    await createBookingAction(input([sel("v:l1", CLZ.lavageExterieurEco, [CLZ.pharesOption]), sel("v:l2", CLZ.pharesService)]))
    expect(items().map((i) => i.serviceId)).toEqual([CLZ.lavageExterieurEco])
    expect(booking()).toMatchObject({ subtotalCents: 8000, totalCents: 8000, totalDurationMin: 90, endTime: "10:30" })
    expect(inserts.filter((i) => i.table === "booking_item_options")).toHaveLength(1)
  })
  it("offre plus avantageuse que le code : code ni appliqué ni consommé", async () => {
    withData([multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 2000 } }] })])
    await createBookingAction(input([sel("a", CLZ.lavageExterieurEco), sel("b", CLZ.lavageInterieurEco)], "bienvenue"))
    expect(booking()).toMatchObject({ discountCents: 1400, totalCents: 5600, promoCodeId: null, promoCodeSnapshot: null })
    expect(promo.consumePromoCode).not.toHaveBeenCalled()
  })
  it("code plus avantageux : code seul, consommé, montant du moteur", async () => {
    withData([multiServices()])
    promo.validatePromoCode.mockResolvedValue({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 30, discountCents: 3000, targetServiceIds: null })
    await createBookingAction(input([sel("a", CLZ.lavageExterieurEco), sel("b", CLZ.lavageInterieurEco)], "bienvenue"))
    expect(booking()).toMatchObject({ discountCents: 3000, totalCents: 4000, promoCodeId: 9, promoCodeSnapshot: { code: "BIENVENUE", discountCents: 3000 } })
    expect(promo.consumePromoCode).toHaveBeenCalledTimes(1)
  })
  it("code invalide : refus comme avant, même avec des offres", async () => {
    withData([multiServices()])
    promo.validatePromoCode.mockResolvedValue({ valid: false, reason: "expired" })
    expect(await createBookingAction(input([sel("a", CLZ.lavageExterieurEco)], "vieux"))).toMatchObject({ ok: false, code: "invalid" })
    expect(inserts).toHaveLength(0)
  })
})

describe("L20 — base et tenants", () => {
  it("base de promotions en erreur : réservation refusée, rien n'est écrit", async () => {
    promoStore.loadPromotionData.mockResolvedValue({ ok: false })
    expect(await createBookingAction(input([sel("a", CLZ.lavageExterieurEco)]))).toMatchObject({ ok: false })
    expect(inserts).toHaveLength(0)
  })
  it("les offres sont lues pour le tenant de la requête uniquement", async () => {
    st.tenant = { id: 22, customSiteKey: null }
    await createBookingAction(input([sel("a", CLZ.lavageExterieurEco)]))
    expect(promoStore.loadPromotionData).toHaveBeenCalledWith(expect.objectContaining({ id: 22 }))
    expect(booking()).toMatchObject({ companyId: 22 })
  })
})

describe("L20 — aperçu du code promo", () => {
  it("offre non cumulable plus avantageuse : refus « not_combinable »", async () => {
    withData([multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 2000 } }] })])
    expect(await validatePromoCodeAction({ selections: [sel("a", CLZ.lavageExterieurEco), sel("b", CLZ.lavageInterieurEco)], code: "bienvenue" })).toEqual({ ok: false, reason: "not_combinable" })
  })
  it("sans offre : réponse inchangée", async () => {
    expect(await validatePromoCodeAction({ selections: [sel("a", CLZ.lavageExterieurEco)], code: "bienvenue" })).toEqual({ ok: true, code: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000 })
  })
})

describe("L20 — structure", () => {
  const src = readFileSync(join(process.cwd(), "app/(site)/reservation/actions.ts"), "utf8")
  const body = src.slice(src.indexOf("export async function createBookingAction"))
  it("offres lues après l'anti-abus et avant toute écriture", () => {
    const load = body.indexOf("loadPromotionData(tenant)")
    expect(load).toBeGreaterThan(body.indexOf("isBookingRateLimited("))
    expect(load).toBeLessThan(body.indexOf("db.transaction"))
  })
  it("lignes enregistrées = panier normalisé ; instantané dans la transaction", () => {
    expect(body).toContain("for (const line of billedLines)")
    expect(body).not.toContain("for (const line of quote.lines)")
    expect(body.indexOf("setBookingPromotionSnapshot(tx")).toBeGreaterThan(body.indexOf("db.transaction"))
  })
})
