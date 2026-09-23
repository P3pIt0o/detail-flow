import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { eq, inArray } from "drizzle-orm"

/**
 * PARCOURS BOOKING V2 DE BOUT EN BOUT (DB réelle, si DATABASE_URL).
 *
 * `createBookingAction` s'exécute réellement (devis, verrou, insertion,
 * lieu d'intervention, paiement). Seules les frontières EXTERNES sont
 * simulées : tenant de la requête (en-têtes HTTP), géocodage Google, envoi
 * d'emails et appel API Stripe.
 *
 *  - Tenant A : atelier + déplacement, sans paiement en ligne.
 *  - Tenant B : déplacement, acompte Stripe.
 *
 * Le parcours atelier complet n'est vérifiable qu'une fois la migration
 * « lieux d'intervention » appliquée ; avant, on vérifie le repli défensif.
 */

const tenantState: { current: Record<string, unknown> | null } = { current: null }
const checkoutCalls: Array<{ bookingId: number; companyId: number; returnUrl: string }> = []

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>()
  return {
    ...actual,
    resolveRequestTenant: vi.fn(async () => tenantState.current),
    getCurrentTenant: vi.fn(async () => tenantState.current),
    getCompanyIdOrNull: vi.fn(async () => (tenantState.current?.id as number | undefined) ?? null),
    requireCompanyId: vi.fn(async () => {
      if (!tenantState.current) throw new Error("NEXT_NOT_FOUND")
      return tenantState.current.id as number
    }),
  }
})

vi.mock("@/lib/booking/travel", () => ({
  computeTravel: vi.fn(async (address: string) =>
    address.includes("Loin")
      ? { ok: false, error: "out_of_range" }
      : { ok: true, address, lat: 50.85, lng: 4.35, distanceKm: 12, billedDistanceKm: 2, feeCents: 800 },
  ),
}))

vi.mock("@/lib/email/notifications", () => ({
  sendBookingCreatedEmails: vi.fn(async () => {}),
}))

vi.mock("@/lib/payments/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/queries")>()
  return {
    ...actual,
    createBookingCheckout: vi.fn(async (input: { bookingId: number; companyId: number; returnUrl: string }) => {
      checkoutCalls.push(input)
      return { ok: true, clientSecret: `cs_test_${input.bookingId}` }
    }),
  }
})

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "detailflow.test", "x-forwarded-proto": "https" })),
}))

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-flow-a-${RUN_ID}`
const SLUG_B = `test-flow-b-${RUN_ID}`
const future = new Date(Date.now() + 40 * 86400000)
const DATE = future.toISOString().slice(0, 10)
// Saisie admin (rue / CP / ville séparés) et adresse publique composée.
const WORKSHOP_STREET = "5 avenue de l'Atelier"
const WORKSHOP = `${WORKSHOP_STREET}, 1000 Bruxelles`

d("Booking V2 — atelier, déplacement, Stripe, multi-tenant (DB)", () => {
  let db: typeof import("@/lib/db").db
  let pool: typeof import("@/lib/db").pool
  let schema: typeof import("@/lib/db/schema")
  let actions: typeof import("@/app/(site)/reservation/actions")
  let checkout: typeof import("@/app/(site)/reservation/paiement/checkout-actions")
  let access: typeof import("@/lib/booking/access")
  let location: typeof import("@/lib/booking/location")
  let adminQ: typeof import("@/lib/admin/queries")
  let availability: typeof import("@/lib/booking/availability")

  const t = {} as {
    a: Record<string, unknown>
    b: Record<string, unknown>
    aService: number
    aVehicle: number
    bService: number
    bVehicle: number
    migrated: boolean
  }

  async function seedTenant(slug: string, stripe: boolean) {
    const [c] = await db
      .insert(schema.companies)
      .values({
        name: slug,
        slug,
        status: "ACTIVE",
        ...(stripe
          ? {
              paymentProvider: "stripe",
              stripeAccountId: "acct_test_flow",
              stripeChargesEnabled: true,
              stripeDetailsSubmitted: true,
              paymentsEnabled: true,
              paymentMode: "deposit",
            }
          : {}),
      })
      .returning()
    await db.insert(schema.settings).values({
      companyId: c.id,
      businessAddress: "1 rue du Siège, 1000 Bruxelles",
      minNoticeHours: 0,
      maxVehiclesPerDay: 10,
      depositType: stripe ? "percent" : "none",
      depositValue: stripe ? 30 : 0,
    })
    await db
      .insert(schema.businessHours)
      .values(Array.from({ length: 7 }, (_, dow) => ({ companyId: c.id, dayOfWeek: dow, isOpen: true, openTime: "08:00", closeTime: "18:00" })))
    const [s] = await db
      .insert(schema.services)
      .values({ companyId: c.id, name: "Lavage complet", slug: `lavage-${slug}`, basePriceCents: 9000, durationMin: 60 })
      .returning({ id: schema.services.id })
    const [v] = await db
      .insert(schema.vehicleTypes)
      .values({ companyId: c.id, name: "Citadine", slug: `citadine-${slug}` })
      .returning({ id: schema.vehicleTypes.id })
    return { company: c as Record<string, unknown>, serviceId: s.id, vehicleId: v.id }
  }

  const input = (serviceId: number, vehicleTypeId: number, startTime: string, extra: Record<string, unknown>) => ({
    selections: [{ uid: `u-${startTime}`, serviceId, vehicleTypeId, optionIds: [], brand: "Peugeot", model: "208" }],
    date: DATE,
    startTime,
    customer: { name: "Jean Client", email: "jean@example.test", phone: "+32470111222" },
    address: "",
    ...extra,
  })

  const as = (tenant: Record<string, unknown>) => {
    tenantState.current = tenant
  }

  beforeAll(async () => {
    ;({ db, pool } = await import("@/lib/db"))
    schema = await import("@/lib/db/schema")
    actions = await import("@/app/(site)/reservation/actions")
    checkout = await import("@/app/(site)/reservation/paiement/checkout-actions")
    access = await import("@/lib/booking/access")
    location = await import("@/lib/booking/location")
    adminQ = await import("@/lib/admin/queries")
    availability = await import("@/lib/booking/availability")

    const A = await seedTenant(SLUG_A, false)
    const B = await seedTenant(SLUG_B, true)
    t.a = A.company
    t.b = B.company
    t.aService = A.serviceId
    t.aVehicle = A.vehicleId
    t.bService = B.serviceId
    t.bVehicle = B.vehicleId
    t.migrated = await location.locationColumnsExist()
    if (t.migrated) {
      const saved = await location.saveLocationConfig(t.a.id as number, {
        mobileEnabled: true,
        workshopEnabled: true,
        workshopAddress: WORKSHOP_STREET,
        workshopPostalCode: "1000",
        workshopCity: "Bruxelles",
      })
      expect(saved.ok).toBe(true)
    }
  })

  afterAll(async () => {
    const ids = [t.a?.id, t.b?.id].filter(Boolean) as number[]
    if (ids.length) {
      const bIds = (
        await db.select({ id: schema.bookings.id }).from(schema.bookings).where(inArray(schema.bookings.companyId, ids))
      ).map((r) => r.id)
      if (bIds.length) {
        await db.delete(schema.bookingItems).where(inArray(schema.bookingItems.bookingId, bIds))
        await db.delete(schema.bookings).where(inArray(schema.bookings.id, bIds))
      }
      for (const table of [schema.services, schema.vehicleTypes, schema.businessHours, schema.settings]) {
        await db.delete(table).where(inArray(table.companyId, ids))
      }
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids))
    }
    tenantState.current = null
    await pool.end()
  })

  it("configuration lieu : tenant A atelier+déplacement (post-migration) / repli défensif (pré-migration)", async () => {
    const cfgA = await location.getLocationConfig(t.a.id as number)
    const cfgB = await location.getLocationConfig(t.b.id as number)
    // Tenant B (jamais configuré) : comportement historique = déplacement uniquement.
    expect(cfgB).toMatchObject({ mobileEnabled: true, workshopEnabled: false })
    if (t.migrated) {
      expect(cfgA).toMatchObject({ mobileEnabled: true, workshopEnabled: true, workshopAddress: WORKSHOP_STREET })
    } else {
      expect(cfgA).toMatchObject({ mobileEnabled: true, workshopEnabled: false })
    }
  })

  it("PARCOURS ATELIER : création, adresse atelier, 0 frais, admin, disponibilité", async () => {
    as(t.a)
    const res = await actions.createBookingAction(input(t.aService, t.aVehicle, "10:00", { locationType: "workshop" }))
    if (!t.migrated) {
      // Sans migration, l'atelier n'est pas proposé : une adresse client est exigée.
      expect(res).toMatchObject({ ok: false, code: "invalid" })
      return
    }
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.payUrl).toBeUndefined()
    expect(res.confirmationUrl).toContain(`token=${encodeURIComponent(res.accessToken)}`)

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.reference, res.reference))
    expect(row.companyId).toBe(t.a.id)
    expect(row.address).toBe(WORKSHOP)
    expect(row.travelFeeCents).toBe(0)
    expect(row.manageToken).toBe(res.accessToken)
    expect(await location.getBookingLocationType(row.id)).toBe("workshop")

    const adminA = await adminQ.getBookingDetail(row.id, t.a.id as number)
    expect(adminA?.booking.id).toBe(row.id)
    expect(await adminQ.getBookingDetail(row.id, t.b.id as number)).toBeNull()

    const summary = await actions.getBookingSummaryAction(res.reference, res.accessToken)
    expect(summary).toMatchObject({ locationType: "workshop", address: WORKSHOP })

    // Le créneau réservé disparaît pour A uniquement ; B (autre tenant) le garde.
    const avA = await availability.getAvailability(DATE, 60, 1)
    expect(avA.slots).not.toContain("10:00")
    expect(avA.slots).toContain("12:00")
    as(t.b)
    const avB = await availability.getAvailability(DATE, 60, 1)
    expect(avB.slots).toContain("10:00")
  })

  it("PARCOURS DÉPLACEMENT : adresse client validée, frais calculés, admin, isolation", async () => {
    as(t.a)
    const out = await actions.createBookingAction(
      input(t.aService, t.aVehicle, "14:00", { locationType: "client", address: "99 route Loin, 9999 Ailleurs" }),
    )
    expect(out).toMatchObject({ ok: false, code: "out_of_range" })

    const res = await actions.createBookingAction(
      input(t.aService, t.aVehicle, "14:00", { locationType: "client", address: "10 rue du Client, 1050 Ixelles" }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.reference, res.reference))
    expect(row.address).toBe("10 rue du Client, 1050 Ixelles")
    expect(row.travelFeeCents).toBe(800)
    expect(row.totalCents).toBe(9800)
    if (t.migrated) expect(await location.getBookingLocationType(row.id)).toBe("client")

    expect((await adminQ.getBookingDetail(row.id, t.a.id as number))?.booking.address).toBe(row.address)
    expect(await adminQ.getBookingDetail(row.id, t.b.id as number)).toBeNull()

    // Adresse / véhicule jamais exposés sans jeton, ni depuis le tenant B.
    expect(await actions.getBookingSummaryAction(res.reference, "")).toBeNull()
    as(t.b)
    expect(await actions.getBookingSummaryAction(res.reference, res.accessToken)).toBeNull()
    as(t.a)
    expect((await actions.getBookingSummaryAction(res.reference, res.accessToken))?.items[0].vehicle).toBe("Peugeot 208")
  })

  it("STRIPE / ACOMPTE : lien sécurisé, reprise sans perte de jeton, aucun doublon", async () => {
    as(t.b)
    const res = await actions.createBookingAction(
      input(t.bService, t.bVehicle, "11:00", { locationType: "client", address: "20 rue du Paiement, 1000 Bruxelles" }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok || !res.payUrl) throw new Error("payUrl attendu")

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.reference, res.reference))
    expect(row.status).toBe("pending_deposit")
    expect(row.depositCents).toBe(Math.round(row.totalCents * 0.3))
    const payUrl = new URL(res.payUrl, "https://x.test")
    expect(payUrl.pathname).toBe(`/reservation/paiement/${row.id}`)
    expect(payUrl.searchParams.get("ref")).toBe(res.reference)
    expect(payUrl.searchParams.get("token")).toBe(row.manageToken)

    // Page de paiement : même chargeur serveur que la page réelle.
    const token = payUrl.searchParams.get("token") as string
    expect((await access.getBookingByIdForPublicAccess({ bookingId: row.id, token, companyId: t.b.id as number }))?.booking.id).toBe(row.id)

    const before = checkoutCalls.length
    const s1 = await checkout.startBookingCheckout(row.id, token, "deposit")
    const s2 = await checkout.startBookingCheckout(row.id, token, "deposit")
    expect(s1).toMatchObject({ ok: true, clientSecret: `cs_test_${row.id}`, connectedAccountId: "acct_test_flow" })
    expect(s2).toMatchObject({ ok: true })
    expect(checkoutCalls.length).toBe(before + 2)
    const call = checkoutCalls[checkoutCalls.length - 1]
    expect(call).toMatchObject({ bookingId: row.id, companyId: t.b.id })

    // Retour Stripe : le jeton survit à la redirection et rouvre l'accès.
    const ret = new URL(call.returnUrl)
    expect(ret.pathname).toBe(`/reservation/paiement/${row.id}/retour`)
    expect(ret.searchParams.get("session_id")).toBe("{CHECKOUT_SESSION_ID}")
    expect(ret.searchParams.get("tenant")).toBe(SLUG_B)
    const returnedToken = ret.searchParams.get("token")
    expect(returnedToken).toBe(token)
    expect(await access.hasPublicBookingAccess({ bookingId: row.id, token: returnedToken, companyId: t.b.id as number })).toBe(true)

    // Reprise : aucune nouvelle réservation créée.
    const countB = await db.select({ id: schema.bookings.id }).from(schema.bookings).where(eq(schema.bookings.companyId, t.b.id as number))
    expect(countB).toHaveLength(1)

    // Tenant A ne peut ni lire ni payer la réservation de B.
    as(t.a)
    expect(await checkout.startBookingCheckout(row.id, token)).toEqual({ ok: false, error: "Réservation introuvable." })
    expect(checkoutCalls.length).toBe(before + 2)
  })

  it("MULTI-TENANT : aucune réservation/client/adresse/véhicule de A visible depuis B", async () => {
    const aRows = await db.select().from(schema.bookings).where(eq(schema.bookings.companyId, t.a.id as number))
    expect(aRows.length).toBeGreaterThan(0)
    as(t.b)
    for (const r of aRows) {
      expect(await adminQ.getBookingDetail(r.id, t.b.id as number)).toBeNull()
      expect(await actions.getBookingSummaryAction(r.reference, r.manageToken as string)).toBeNull()
      expect(await access.getBookingByIdForPublicAccess({ bookingId: r.id, token: r.manageToken, companyId: t.b.id as number })).toBeNull()
      expect(await checkout.startBookingCheckout(r.id, r.manageToken as string)).toEqual({
        ok: false,
        error: "Réservation introuvable.",
      })
    }
    tenantState.current = null
  })
})
