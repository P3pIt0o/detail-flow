import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { eq, inArray } from "drizzle-orm"

/**
 * SÉCURITÉ — accès public aux réservations (Booking V2).
 *
 * Critère : il doit être IMPOSSIBLE d'obtenir les informations d'une réservation
 * en connaissant ou en devinant sa référence (ou son id). Seule la combinaison
 * référence/id + jeton secret + tenant de la requête ouvre l'accès.
 *
 *  - Assertions PURES (toujours exécutées) : entropie du jeton, câblage des
 *    surfaces publiques, absence de lecture par référence seule.
 *  - Assertions DB (si DATABASE_URL) : énumération, inter-tenant, anciennes
 *    réservations sans jeton, accès admin, actions serveur publiques réelles.
 */

const tenantState: { current: { id: number; slug: string } | null } = { current: null }

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>()
  return {
    ...actual,
    resolveRequestTenant: vi.fn(async () => tenantState.current),
    requireCompanyId: vi.fn(async () => {
      if (!tenantState.current) throw new Error("NEXT_NOT_FOUND")
      return tenantState.current.id
    }),
  }
})

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ------------------------------------------------------------------------ */
/*  Assertions pures                                                        */
/* ------------------------------------------------------------------------ */

describe("Accès réservation — jeton & câblage (pur)", () => {
  it("jeton : 192 bits crypto, base64url, uniques, non dérivés de la référence", async () => {
    const { generateBookingAccessToken, isWellFormedAccessToken } = await import("@/lib/booking/access")
    // Aucune entrée possible (ni référence, ni id, ni tenant, ni horodatage).
    expect(generateBookingAccessToken.length).toBe(0)
    const tokens = new Set(Array.from({ length: 2000 }, () => generateBookingAccessToken()))
    expect(tokens.size).toBe(2000)
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
      expect(isWellFormedAccessToken(t)).toBe(true)
    }
    const accessSrc = src("lib/booking/access.ts")
    expect(accessSrc).toContain("randomBytes(24)")
    expect(accessSrc).not.toMatch(/Math\.random|Date\.now/)
  })

  it("formats invalides rejetés avant toute requête", async () => {
    const { isWellFormedAccessToken, isWellFormedReference } = await import("@/lib/booking/access")
    for (const bad of [undefined, null, "", "short", "a".repeat(129), "abc def ghi jkl mno", "x'; DROP TABLE--", 42]) {
      expect(isWellFormedAccessToken(bad)).toBe(false)
    }
    expect(isWellFormedReference("DF-20260923-0001")).toBe(true)
    expect(isWellFormedReference("df-20260923-0001")).toBe(false)
    expect(isWellFormedReference("DF-2026' OR 1=1")).toBe(false)
  })

  it("aucune lecture publique par référence seule n'existe plus", () => {
    expect(src("lib/booking/queries.ts")).not.toMatch(/export async function getBookingByReference\b/)
    for (const f of [
      "app/(site)/reservation/actions.ts",
      "app/(site)/reservation/confirmation/page.tsx",
      "app/(site)/reservation/paiement/[bookingId]/page.tsx",
    ]) {
      expect(src(f)).not.toMatch(/getBookingByReference\(/)
    }
  })

  it("chaque surface publique passe par le module d'accès (jeton + tenant)", () => {
    expect(src("app/(site)/reservation/actions.ts")).toMatch(
      /getBookingSummaryAction\(reference: string, token: string\)[\s\S]*getBookingByReferenceForPublicAccess/,
    )
    expect(src("app/(site)/reservation/confirmation/page.tsx")).toContain("getBookingByReferenceForPublicAccess")
    expect(src("app/(site)/reservation/paiement/[bookingId]/page.tsx")).toContain("getBookingByIdForPublicAccess")
    expect(src("app/(site)/reservation/paiement/[bookingId]/retour/page.tsx")).toContain("hasPublicBookingAccess")
    const checkout = src("app/(site)/reservation/paiement/checkout-actions.ts")
    expect(checkout).toMatch(/startBookingCheckout\(\s*bookingId: number,\s*accessToken: string/)
    expect(checkout).toContain("hasPublicBookingAccess")
    expect(checkout).not.toMatch(/export async function isBookingPaid/)
  })

  it("le retour Stripe reconduit le jeton ; le tenant vient toujours du serveur", () => {
    const checkout = src("app/(site)/reservation/paiement/checkout-actions.ts")
    expect(checkout).toContain("session_id={CHECKOUT_SESSION_ID}&token=")
    expect(checkout).toContain("resolveRequestTenant()")
  })

  it("les liens générés côté serveur contiennent référence ET jeton", async () => {
    const { publicConfirmationPath, publicPaymentPath } = await import("@/lib/booking/access")
    expect(publicConfirmationPath("DF-1", "tok_abc")).toBe("/reservation/confirmation?ref=DF-1&token=tok_abc")
    expect(publicPaymentPath(7, "DF-1", "tok_abc")).toBe("/reservation/paiement/7?ref=DF-1&token=tok_abc")
  })
})

/* ------------------------------------------------------------------------ */
/*  Assertions DB                                                           */
/* ------------------------------------------------------------------------ */

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-access-a-${RUN_ID}`
const SLUG_B = `test-access-b-${RUN_ID}`
// Références au format réel « DF-AAAAMMJJ-NNNN », sur une année fictive
// (2999) pour ne jamais entrer en collision avec de vraies réservations.
const DAY = `2999${String(1000 + Math.floor(Math.random() * 8999))}`
const ref = (n: number) => `DF-${DAY}-${String(n).padStart(4, "0")}`

type Seeded = { id: number; reference: string; token: string | null; companyId: number }
const ctx = {} as {
  aId: number
  bId: number
  a1: Seeded
  a2: Seeded
  b1: Seeded
  legacy: Seeded
}

d("Accès réservation — énumération, inter-tenant, admin (DB)", () => {
  let db: typeof import("@/lib/db").db
  let pool: typeof import("@/lib/db").pool
  let schema: typeof import("@/lib/db/schema")
  let access: typeof import("@/lib/booking/access")

  async function seedBooking(companyId: number, reference: string, token: string | null, address: string) {
    const [b] = await db
      .insert(schema.bookings)
      .values({
        companyId,
        reference,
        manageToken: token,
        customerName: "Client Secret",
        customerEmail: `${reference.toLowerCase()}@example.test`,
        customerPhone: "+32470000000",
        address,
        date: "2999-01-01",
        startTime: "10:00",
        endTime: "11:00",
        totalDurationMin: 60,
        status: "confirmed",
      })
      .returning({ id: schema.bookings.id })
    await db.insert(schema.bookingItems).values({
      bookingId: b.id,
      serviceId: null,
      serviceName: "Lavage secret",
      vehicleTypeId: null,
      vehicleTypeName: "SUV",
      vehicleBrand: "Marque",
      vehicleModel: "Modèle",
      vehiclePlate: "1-ABC-123",
      priceCents: 5000,
      durationMin: 60,
    })
    return { id: b.id, reference, token, companyId }
  }

  beforeAll(async () => {
    ;({ db, pool } = await import("@/lib/db"))
    schema = await import("@/lib/db/schema")
    access = await import("@/lib/booking/access")
    await pool.query("DELETE FROM companies WHERE slug LIKE 'test-access-%'")
    const [a] = await db
      .insert(schema.companies)
      .values({ name: SLUG_A, slug: SLUG_A, status: "ACTIVE" })
      .returning({ id: schema.companies.id })
    const [b] = await db
      .insert(schema.companies)
      .values({ name: SLUG_B, slug: SLUG_B, status: "ACTIVE" })
      .returning({ id: schema.companies.id })
    ctx.aId = a.id
    ctx.bId = b.id
    ctx.a1 = await seedBooking(a.id, ref(1), access.generateBookingAccessToken(), "1 rue Atelier A")
    ctx.a2 = await seedBooking(a.id, ref(2), access.generateBookingAccessToken(), "2 rue Client A")
    ctx.b1 = await seedBooking(b.id, ref(3), access.generateBookingAccessToken(), "3 rue Client B")
    ctx.legacy = await seedBooking(a.id, ref(4), null, "4 rue Ancienne A")
  })

  afterAll(async () => {
    const ids = [ctx.aId, ctx.bId].filter(Boolean)
    if (ids.length) {
      const bookingIds = (
        await db.select({ id: schema.bookings.id }).from(schema.bookings).where(inArray(schema.bookings.companyId, ids))
      ).map((r) => r.id)
      if (bookingIds.length) {
        await db.delete(schema.bookingItems).where(inArray(schema.bookingItems.bookingId, bookingIds))
        await db.delete(schema.bookings).where(inArray(schema.bookings.id, bookingIds))
      }
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids))
    }
    await pool.end()
  })

  it("contrôle positif : référence + bon jeton + bon tenant => accès", async () => {
    const res = await access.getBookingByReferenceForPublicAccess({
      reference: ctx.a1.reference,
      token: ctx.a1.token,
      companyId: ctx.aId,
    })
    expect(res?.booking.id).toBe(ctx.a1.id)
    expect(res?.items).toHaveLength(1)
    const byId = await access.getBookingByIdForPublicAccess({ bookingId: ctx.a1.id, token: ctx.a1.token, companyId: ctx.aId })
    expect(byId?.booking.id).toBe(ctx.a1.id)
  })

  it("référence valide + mauvais jeton => rien", async () => {
    const res = await access.getBookingByReferenceForPublicAccess({
      reference: ctx.a1.reference,
      token: access.generateBookingAccessToken(),
      companyId: ctx.aId,
    })
    expect(res).toBeNull()
  })

  it("référence valide sans jeton => rien", async () => {
    for (const token of [undefined, null, ""]) {
      expect(
        await access.getBookingByReferenceForPublicAccess({ reference: ctx.a1.reference, token, companyId: ctx.aId }),
      ).toBeNull()
    }
  })

  it("référence inexistante => rien", async () => {
    expect(
      await access.getBookingByReferenceForPublicAccess({
        reference: ref(9999),
        token: ctx.a1.token,
        companyId: ctx.aId,
      }),
    ).toBeNull()
  })

  it("jeton d'une autre réservation (même tenant) => rien", async () => {
    expect(
      await access.getBookingByReferenceForPublicAccess({ reference: ctx.a1.reference, token: ctx.a2.token, companyId: ctx.aId }),
    ).toBeNull()
    expect(await access.getBookingByIdForPublicAccess({ bookingId: ctx.a1.id, token: ctx.a2.token, companyId: ctx.aId })).toBeNull()
  })

  it("réservation tenant A + jeton tenant B => rien", async () => {
    expect(
      await access.getBookingByReferenceForPublicAccess({ reference: ctx.a1.reference, token: ctx.b1.token, companyId: ctx.aId }),
    ).toBeNull()
    expect(
      await access.getBookingByReferenceForPublicAccess({ reference: ctx.a1.reference, token: ctx.b1.token, companyId: ctx.bId }),
    ).toBeNull()
  })

  it("référence + BON jeton du tenant A présentés depuis le tenant B => rien", async () => {
    expect(
      await access.getBookingByReferenceForPublicAccess({ reference: ctx.a1.reference, token: ctx.a1.token, companyId: ctx.bId }),
    ).toBeNull()
    expect(await access.getBookingByIdForPublicAccess({ bookingId: ctx.a1.id, token: ctx.a1.token, companyId: ctx.bId })).toBeNull()
    expect(await access.hasPublicBookingAccess({ bookingId: ctx.a1.id, token: ctx.a1.token, companyId: ctx.bId })).toBe(false)
  })

  it("ÉNUMÉRATION par référence : DF-…-0001 à 0060, sans jeton / jeton aléatoire / jeton d'un autre", async () => {
    const tokenStrategies = [
      () => undefined,
      () => "",
      () => access.generateBookingAccessToken(),
      () => ctx.b1.token,
      () => ctx.a2.token,
    ]
    let exposed = 0
    for (let n = 1; n <= 60; n++) {
      for (const companyId of [ctx.aId, ctx.bId]) {
        for (const strategy of tokenStrategies) {
          const token = strategy()
          const res = await access.getBookingByReferenceForPublicAccess({ reference: ref(n), token, companyId })
          // Seuls les propriétaires légitimes répondent : (0002 + jeton A2, tenant A)
          // et (0003 + jeton B1, tenant B). Tout le reste doit être null.
          const legit =
            (n === 2 && token === ctx.a2.token && companyId === ctx.aId) ||
            (n === 3 && token === ctx.b1.token && companyId === ctx.bId)
          if (res && !legit) exposed++
          if (legit) expect(res).not.toBeNull()
        }
      }
    }
    expect(exposed).toBe(0)
  })

  it("ÉNUMÉRATION par id incrémental (±30 autour des réservations) : aucun accès", async () => {
    const center = ctx.a1.id
    let exposed = 0
    for (let id = Math.max(1, center - 30); id <= center + 30; id++) {
      for (const companyId of [ctx.aId, ctx.bId]) {
        for (const token of [undefined, access.generateBookingAccessToken(), ctx.b1.token]) {
          if (await access.hasPublicBookingAccess({ bookingId: id, token, companyId })) {
            const legit = id === ctx.b1.id && token === ctx.b1.token && companyId === ctx.bId
            if (!legit) exposed++
          }
          const full = await access.getBookingByIdForPublicAccess({ bookingId: id, token, companyId })
          if (full && !(id === ctx.b1.id && token === ctx.b1.token && companyId === ctx.bId)) exposed++
        }
      }
    }
    expect(exposed).toBe(0)
  })

  it("ancienne réservation sans jeton : aucun accès public, accès admin intact", async () => {
    for (const token of [undefined, null, "", "null", access.generateBookingAccessToken()]) {
      expect(
        await access.getBookingByReferenceForPublicAccess({ reference: ctx.legacy.reference, token, companyId: ctx.aId }),
      ).toBeNull()
    }
    const { getBookingDetail } = await import("@/lib/admin/queries")
    const admin = await getBookingDetail(ctx.legacy.id, ctx.aId)
    expect(admin?.booking.id).toBe(ctx.legacy.id)
  })

  it("génération sécurisée d'un jeton pour une ancienne réservation (tenant correct uniquement)", async () => {
    expect(await access.ensureBookingAccessToken(ctx.legacy.id, ctx.bId)).toBeNull()
    const [still] = await db
      .select({ t: schema.bookings.manageToken })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, ctx.legacy.id))
    expect(still.t).toBeNull()

    const issued = await access.ensureBookingAccessToken(ctx.legacy.id, ctx.aId)
    expect(issued).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(await access.ensureBookingAccessToken(ctx.legacy.id, ctx.aId)).toBe(issued)
    const res = await access.getBookingByReferenceForPublicAccess({
      reference: ctx.legacy.reference,
      token: issued,
      companyId: ctx.aId,
    })
    expect(res?.booking.id).toBe(ctx.legacy.id)
  })

  it("admin : isolation stricte par companyId (A ne lit jamais B)", async () => {
    const { getBookingDetail } = await import("@/lib/admin/queries")
    expect(await getBookingDetail(ctx.b1.id, ctx.aId)).toBeNull()
    expect(await getBookingDetail(ctx.a1.id, ctx.bId)).toBeNull()
    expect((await getBookingDetail(ctx.a1.id, ctx.aId))?.booking.id).toBe(ctx.a1.id)
  })

  it("action publique getBookingSummaryAction : jeton + tenant de la requête exigés", async () => {
    const { getBookingSummaryAction } = await import("@/app/(site)/reservation/actions")
    tenantState.current = { id: ctx.aId, slug: SLUG_A }
    const ok = await getBookingSummaryAction(ctx.a1.reference, ctx.a1.token as string)
    expect(ok?.reference).toBe(ctx.a1.reference)
    expect(await getBookingSummaryAction(ctx.a1.reference, "")).toBeNull()
    expect(await getBookingSummaryAction(ctx.a1.reference, ctx.a2.token as string)).toBeNull()
    expect(await getBookingSummaryAction(ctx.b1.reference, ctx.b1.token as string)).toBeNull()
    for (let n = 1; n <= 20; n++) {
      expect(await getBookingSummaryAction(ref(n), access.generateBookingAccessToken())).toBeNull()
    }
    tenantState.current = { id: ctx.bId, slug: SLUG_B }
    expect(await getBookingSummaryAction(ctx.a1.reference, ctx.a1.token as string)).toBeNull()
    tenantState.current = null
  })

  it("action publique startBookingCheckout : id seul / mauvais jeton / autre tenant refusés", async () => {
    const { startBookingCheckout } = await import("@/app/(site)/reservation/paiement/checkout-actions")
    tenantState.current = { id: ctx.aId, slug: SLUG_A }
    for (const token of ["", access.generateBookingAccessToken(), ctx.a2.token as string, ctx.b1.token as string]) {
      const res = await startBookingCheckout(ctx.a1.id, token)
      expect(res).toEqual({ ok: false, error: "Réservation introuvable." })
    }
    tenantState.current = { id: ctx.bId, slug: SLUG_B }
    expect(await startBookingCheckout(ctx.a1.id, ctx.a1.token as string)).toEqual({
      ok: false,
      error: "Réservation introuvable.",
    })
    tenantState.current = null
  })
})
