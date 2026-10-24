import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CLZ, multiServices } from "./helpers/promotions-fixtures"

/**
 * L22 — aperçu serveur du panier (getQuoteAction) = montant enregistré par
 * createBookingAction, pour des véhicules à plusieurs prestations.
 * (Mise en place reprise de l20-booking-flow.) Ancien en-tête :
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
    /** Lieu : atelier (sans frais) ou domicile (déplacement facturé). */
    workshop: true,
  },
  inserts: [] as { table: string; values: unknown }[],
  promo: {
    validatePromoCode: vi.fn(async (_i: unknown) => ({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000, targetServiceIds: null as number[] | null }) as Record<string, unknown>),
    consumePromoCode: vi.fn(async (_tx: unknown, _c: number, _id: number) => true),
    normalizePromoCode: (c: string) => (c ?? "").trim().toUpperCase(),
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
vi.mock("@/lib/booking/rate-limit", () => ({ isBookingRateLimited: async () => false, isPromoRateLimited: async () => false, BOOKING_RATE_LIMITED_MESSAGE: "Trop de demandes." }))

import { createBookingAction, getQuoteAction, validatePromoCodeAction } from "@/app/(site)/reservation/actions"

const line = (uid: string, serviceId: number, optionIds: number[] = [], over: Record<string, unknown> = {}) => ({ uid, serviceId, vehicleTypeId: 1, optionIds, brand: "Peugeot", model: "208", plate: "AB-123-CD" as string | undefined, ...over })
const input = (selections: ReturnType<typeof line>[], promoCode?: string) => ({
  selections,
  date: "2026-11-12",
  startTime: "09:00",
  customer: { name: "Client Test", email: "client@example.com", phone: "0600000000" },
  address: "",
  promoCode,
})
const booking = () => inserts.find((i) => i.table === "bookings")!.values as Record<string, unknown>
const phares = { id: 1, a: { type: "service", id: CLZ.pharesService }, b: { type: "option", id: CLZ.pharesOption }, reason: "Même rénovation des phares" }
const withData = (promotions: unknown[], equivalences: unknown[] = [], upsells: unknown[] = []) => {
  promoStore.loadPromotionData.mockResolvedValue({ ok: true, promotions, equivalences, upsells })
  promoStore.getPromotionData.mockResolvedValue({ promotions, equivalences, upsells } as never)
}
// Une voiture : lavage extérieur + option phares, et la prestation phares ajoutée (même identité).
const oneCar = () => [line("a:main", CLZ.lavageExterieurEco, [CLZ.pharesOption]), line(`a:x${CLZ.pharesService}`, CLZ.pharesService), line("b:main", CLZ.lavageInterieurEco, [], { brand: "Renault", model: "Clio", plate: undefined })]

beforeEach(() => {
  inserts.length = 0
  vi.clearAllMocks()
  withData([])
  promo.validatePromoCode.mockResolvedValue({ valid: true, promoCodeId: 9, normalizedCode: "BIENVENUE", discountType: "fixed", discountValue: 10, discountCents: 1000, targetServiceIds: null })
  promo.consumePromoCode.mockResolvedValue(true)
  st.tenant = { id: 104, customSiteKey: "cleanyzer" }
  st.depositType = "percent"
  st.depositValue = 30
  st.workshop = true
})

describe("L22 — aperçu serveur = réservation (véhicule à plusieurs prestations)", () => {
  it("équivalence sur la même voiture + offre : total, acompte, durée et explication identiques à l'enregistrement", async () => {
    withData([multiServices()], [phares])
    const q = await getQuoteAction(oneCar())
    await createBookingAction(input(oneCar()))
    const b = booking()
    expect(q.pricing).toMatchObject({ totalCents: b.totalCents, depositCents: b.depositCents, totalDurationMin: b.totalDurationMin, discountCents: b.discountCents })
    // Phares facturés une seule fois (option 50 € gardée) ; −10 % sur les 2 prestations restantes (3000 + 4000).
    expect(b).toMatchObject({ subtotalCents: 12000, discountCents: 700, totalCents: 11300 })
    expect(q.pricing.applied).toEqual([{ name: "Plusieurs prestations", discountCents: 700 }])
    expect(q.pricing.notes.join(" ")).toMatch(/même traitement/)
  })
  it("code cumulable avec l'offre : même total à l'aperçu et à la réservation", async () => {
    withData([multiServices({ stackableWithPromoCode: true })], [phares])
    const q = await getQuoteAction(oneCar(), undefined, "bienvenue")
    await createBookingAction(input(oneCar(), "bienvenue"))
    expect(q.pricing.code).toMatchObject({ code: "BIENVENUE", status: "applied", discountCents: 1000 })
    expect(q.pricing.totalCents).toBe(booking().totalCents)
    expect(booking()).toMatchObject({ discountCents: 1700, totalCents: 10300 })
  })
  it("code non cumulable moins avantageux : l'aperçu l'annonce non appliqué, la réservation avec code est refusée", async () => {
    withData([multiServices({ tiers: [{ minQuantity: 2, value: { type: "percent", bps: 2000 } }] })])
    const q = await getQuoteAction(oneCar(), undefined, "bienvenue")
    expect(q.pricing.code).toMatchObject({ status: "rejected_not_combinable", discountCents: 0 })
    expect(q.pricing.discountCents).toBe(Math.floor((3000 + 6500 + 4000) * 0.2))
    expect(await createBookingAction(input(oneCar(), "bienvenue"))).toMatchObject({ ok: false })
  })
  it("sans offre : aperçu au prix normal, aucune suggestion, aucune requête de catalogue superflue", async () => {
    const q = await getQuoteAction(oneCar())
    expect(q.pricing).toMatchObject({ discountCents: 0, applied: [], notes: [] })
    expect(q.suggestions).toEqual([])
  })
})

describe("L22 — aperçu = réservation : déplacement et code ciblé", () => {
  it("à domicile : déplacement facturé en entier, jamais remisé, identique à la réservation", async () => {
    withData([multiServices()], [phares])
    st.workshop = false
    const address = "12 avenue de Genève, Annecy"
    const q = await getQuoteAction(oneCar(), address)
    await createBookingAction({ ...input(oneCar()), address })
    expect(q.pricing).toMatchObject({ travelFeeCents: 1500, totalCents: booking().totalCents, depositCents: booking().depositCents })
    expect(booking()).toMatchObject({ travelFeeCents: 1500, discountCents: 700, totalCents: 12800 })
  })
  it("code ciblé sur un véhicule à plusieurs prestations : seule la prestation visée compte", async () => {
    withData([multiServices({ stackableWithPromoCode: true })], [phares])
    promo.validatePromoCode.mockResolvedValue({ valid: true, promoCodeId: 9, normalizedCode: "DIX", discountType: "percent", discountValue: 10, discountCents: 400, targetServiceIds: [CLZ.lavageInterieurEco] })
    const q = await getQuoteAction(oneCar(), undefined, "dix")
    await createBookingAction(input(oneCar(), "dix"))
    // Offre −10 % : 300 + 400 ; code 10 % sur le reste du lavage intérieur (3600) : 360.
    expect(q.pricing).toMatchObject({ code: { status: "applied", discountCents: 360 }, discountCents: 1060, totalCents: booking().totalCents })
  })
})

describe("L22 — conditions du code vérifiées sur le panier réellement facturé (revue sécurité)", () => {
  it("doublon d'une même prestation : le minimum d'achat est contrôlé sur 1 prestation, pas 2 (aperçu, code, réservation)", async () => {
    withData([multiServices()])
    const dup = [line("a:main", CLZ.lavageExterieurEco), line(`a:x${CLZ.lavageExterieurEco}`, CLZ.lavageExterieurEco)]
    await getQuoteAction(dup, undefined, "bienvenue")
    await validatePromoCodeAction({ selections: dup, code: "bienvenue" })
    await createBookingAction(input(dup, "bienvenue"))
    const seen = promo.validatePromoCode.mock.calls.map((c) => (c[0] as { quote: { servicesCents: number; lines: unknown[] } }).quote)
    expect(seen).toHaveLength(3)
    for (const q of seen) expect(q).toMatchObject({ servicesCents: 3000 })
    for (const q of seen) expect(q.lines).toHaveLength(1)
  })
  it("même traitement (prestation phares + option phares) : le code ne voit que la forme facturée", async () => {
    withData([], [phares])
    await createBookingAction(input([line("a:main", CLZ.pharesService, [CLZ.pharesOption])], "bienvenue"))
    expect((promo.validatePromoCode.mock.calls[0][0] as { quote: { optionsCents: number } }).quote.optionsCents).toBe(0)
  })
  it("plus de 30 lignes : réservation refusée avant tout calcul ni écriture", async () => {
    const many = Array.from({ length: 31 }, (_, i) => line(`v${i}:main`, CLZ.lavageExterieurEco))
    expect(await createBookingAction(input(many))).toMatchObject({ ok: false, code: "invalid" })
    expect(inserts).toHaveLength(0)
    await expect(getQuoteAction(many)).rejects.toThrow()
  })
  it("plus de 30 lignes : le code promo n'est même pas vérifié", async () => {
    const many = Array.from({ length: 31 }, (_, i) => line(`v${i}:main`, CLZ.lavageExterieurEco))
    expect(await validatePromoCodeAction({ selections: many, code: "bienvenue" })).toMatchObject({ ok: false, reason: "empty" })
    expect(promo.validatePromoCode).not.toHaveBeenCalled()
  })
  it("catalogue des suggestions chargé pour le tenant de la session (companyId explicite)", () => {
    const src = readFileSync(join(process.cwd(), "app/(site)/reservation/actions.ts"), "utf8")
    expect(src).toContain("getServices(tenant.id), getOptions(tenant.id), getServicePrices(tenant.id)")
  })
})

describe("L22 — immatriculation", () => {
  it("véhicule à plusieurs prestations sans immatriculation : rien n'est regroupé, tout est facturé", async () => {
    withData([], [phares])
    const noPlate = oneCar().map((l) => ({ ...l, plate: undefined }))
    await createBookingAction(input(noPlate))
    expect(booking()).toMatchObject({ subtotalCents: 3000 + 5000 + 6500 + 4000 })
  })
  it("immatriculation enregistrée sur chaque ligne du véhicule (visible du pro)", async () => {
    withData([], [phares])
    await createBookingAction(input(oneCar()))
    const items = inserts.filter((i) => i.table === "booking_items").map((i) => i.values as Record<string, unknown>)
    expect(items[0]).toMatchObject({ vehiclePlate: "AB-123-CD" })
  })
})

describe("L22 — suggestions (au plus 2, jamais d'élément masqué)", () => {
  it("palier suivant et complément du pro ; élément masqué (hors catalogue public) jamais proposé", async () => {
    withData([multiServices()], [], [{ id: 1, whenServiceId: CLZ.lavageExterieurEco, suggest: [{ type: "option", id: 999 }, { type: "option", id: CLZ.pharesOption }], message: "Profitez-en", active: true }])
    const q = await getQuoteAction([line("a:main", CLZ.lavageExterieurEco)])
    expect(q.suggestions.length).toBeLessThanOrEqual(2)
    expect(q.suggestions[0].text).toMatch(/Plus que 1 prestation pour profiter de « Plusieurs prestations » \(−10 %\)/)
    expect(q.suggestions.some((s) => s.add?.id === 999)).toBe(false)
    expect(q.suggestions[1]).toMatchObject({ add: { type: "option", id: CLZ.pharesOption }, vehicleUid: "a" })
  })
  it("les offres et compléments sont lus pour le tenant de la requête", async () => {
    st.tenant = { id: 22, customSiteKey: null }
    await getQuoteAction([line("a:main", CLZ.lavageExterieurEco)])
    expect(promoStore.getPromotionData).toHaveBeenCalledWith(expect.objectContaining({ id: 22 }))
  })
})
