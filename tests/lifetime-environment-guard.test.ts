import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type Stripe from "stripe"
import {
  LIFETIME_DATABASE_MARKER_SQL,
  LifetimeEnvironmentGuardError,
  assertLifetimeLiveCheckoutAllowed,
  assertLifetimePreviewDatabaseMarker,
  assertLifetimePreviewTestEnvironment,
} from "@/lib/billing/lifetime-environment-guard"

/* Aucun réseau : Stripe, DB et session sont entièrement simulés. */

const PRICE = "price_fake_single"

const validPrice = {
  id: PRICE,
  object: "price",
  active: true,
  livemode: false,
  currency: "eur",
  unit_amount: 129000,
  type: "one_time",
  recurring: null,
  lookup_key: "detailflow_lifetime_single",
  metadata: { app: "detailflow", billing_type: "lifetime", payment_plan: "single", installment_count: "1" },
  product: {
    id: "prod_fake",
    object: "product",
    active: true,
    livemode: false,
    name: "DetailFlow Lifetime",
    metadata: { app: "detailflow", billing_type: "lifetime", offer: "lifetime" },
  },
} as unknown as Stripe.Price

const spies = vi.hoisted(() => ({
  reserveLifetimeSlot: vi.fn(),
  findOpenLifetimeReservation: vi.fn(),
  attachLifetimeCheckoutSession: vi.fn(),
  releaseLifetimeReservation: vi.fn(),
  pricesRetrieve: vi.fn(),
  sessionsCreate: vi.fn(),
  sessionsRetrieve: vi.fn(),
  sessionsExpire: vi.fn(),
  getStripe: vi.fn(),
  requireCompanyMember: vi.fn(),
  poolQuery: vi.fn(),
}))

vi.mock("@/lib/billing/lifetime-server", () => ({
  reserveLifetimeSlot: spies.reserveLifetimeSlot,
  findOpenLifetimeReservation: spies.findOpenLifetimeReservation,
  attachLifetimeCheckoutSession: spies.attachLifetimeCheckoutSession,
  releaseLifetimeReservation: spies.releaseLifetimeReservation,
}))
vi.mock("@/lib/db", () => ({ pool: { query: spies.poolQuery }, db: {} }))
vi.mock("@/lib/payments/stripe-client", () => ({ getStripe: spies.getStripe }))
vi.mock("@/lib/admin", () => ({ requireCompanyMember: spies.requireCompanyMember }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "preview.example.test" }) }))

const fakeStripe = {
  prices: { retrieve: spies.pricesRetrieve },
  checkout: {
    sessions: {
      create: spies.sessionsCreate,
      retrieve: spies.sessionsRetrieve,
      expire: spies.sessionsExpire,
      listLineItems: vi.fn(),
    },
  },
}

const ENV_KEYS = [
  "VERCEL_ENV",
  "STRIPE_SECRET_KEY",
  "LIFETIME_LIVE_CHECKOUT_ENABLED",
  "STRIPE_PRICE_LIFETIME_SINGLE",
] as const
const saved: Record<string, string | undefined> = {}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const v = values[key]
    if (v === undefined) delete process.env[key]
    else process.env[key] = v
  }
}

const markerRows = (environment: string | null) => ({ rows: [{ environment }] })

const allowedPreview = {
  VERCEL_ENV: "preview",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_PRICE_LIFETIME_SINGLE: PRICE,
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  for (const spy of Object.values(spies)) spy.mockReset()
  spies.getStripe.mockReturnValue(fakeStripe)
  spies.poolQuery.mockResolvedValue(markerRows("preview-lifetime"))
  spies.requireCompanyMember.mockResolvedValue({
    role: "OWNER",
    isSuperAdmin: false,
    tenant: { id: 42, slug: "acme" },
  })
  spies.findOpenLifetimeReservation.mockResolvedValue(null)
  spies.pricesRetrieve.mockResolvedValue(validPrice)
  spies.reserveLifetimeSlot.mockResolvedValue({
    id: 7,
    companyId: 42,
    paymentPlan: "single",
    status: "RESERVED",
    reservedAt: new Date(),
    reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    stripeCheckoutSessionId: null,
  })
  spies.sessionsCreate.mockResolvedValue({ id: "cs_fake_1", url: "https://checkout.stripe.test/cs_fake_1" })
  spies.attachLifetimeCheckoutSession.mockResolvedValue(undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

/** Aucune réservation RESERVED, aucune lecture d'allocation, aucun Stripe, aucune auth. */
function expectNothingTouched() {
  expect(spies.reserveLifetimeSlot).not.toHaveBeenCalled()
  expect(spies.findOpenLifetimeReservation).not.toHaveBeenCalled()
  expect(spies.attachLifetimeCheckoutSession).not.toHaveBeenCalled()
  expect(spies.pricesRetrieve).not.toHaveBeenCalled()
  expect(spies.sessionsCreate).not.toHaveBeenCalled()
  expect(spies.getStripe).not.toHaveBeenCalled()
  expect(spies.requireCompanyMember).not.toHaveBeenCalled()
}

/** La seule requête DB autorisée avant refus est la lecture du marqueur. */
function expectOnlyMarkerRead() {
  for (const call of spies.poolQuery.mock.calls) expect(call[0]).toBe(LIFETIME_DATABASE_MARKER_SQL)
}

const REFUSED = { ok: false, error: "L'outil de test Lifetime n'est pas disponible sur cet environnement." }

async function previewAction() {
  const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/test/actions")
  return mod.startLifetimePreviewTestCheckout()
}

async function generalAction() {
  const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/actions")
  return mod.startLifetimeSingleCheckout()
}

describe("LIFETIME_DATABASE_MARKER_SQL", () => {
  it("lit la table marqueur, en lecture seule, sans current_setting", () => {
    expect(LIFETIME_DATABASE_MARKER_SQL).toBe(
      "SELECT environment FROM detailflow_environment_guard LIMIT 1",
    )
    expect(LIFETIME_DATABASE_MARKER_SQL).not.toMatch(/current_setting|CREATE|INSERT|UPDATE|DELETE|ALTER|DROP/i)
  })
})

describe("assertLifetimePreviewDatabaseMarker (pur)", () => {
  it("'preview-lifetime' exact → accepté", async () => {
    await expect(assertLifetimePreviewDatabaseMarker(async () => "preview-lifetime")).resolves.toBeUndefined()
  })
  const refused: Array<[string, () => Promise<string | null | undefined>, string]> = [
    ["environment NULL", async () => null, "DATABASE_MARKER_MISSING"],
    ["undefined (aucune ligne)", async () => undefined, "DATABASE_MARKER_MISSING"],
    ["chaîne vide", async () => "", "DATABASE_MARKER_MISSING"],
    ["'production'", async () => "production", "DATABASE_MARKER_MISMATCH"],
    ["'preview'", async () => "preview", "DATABASE_MARKER_MISMATCH"],
    ["casse différente", async () => "Preview-Lifetime", "DATABASE_MARKER_MISMATCH"],
    ["espace parasite", async () => "preview-lifetime ", "DATABASE_MARKER_MISMATCH"],
    [
      "lecture en erreur",
      async () => {
        throw new Error("connection refused")
      },
      "DATABASE_MARKER_UNREADABLE",
    ],
  ]
  for (const [label, reader, code] of refused) {
    it(`${label} → ${code}`, async () => {
      await expect(assertLifetimePreviewDatabaseMarker(reader)).rejects.toMatchObject({ code })
      await expect(assertLifetimePreviewDatabaseMarker(reader)).rejects.toBeInstanceOf(LifetimeEnvironmentGuardError)
    })
  }
})

describe("startLifetimePreviewTestCheckout — refus A/B (avant toute requête DB)", () => {
  const refused: Array<[string, Record<string, string | undefined>, string]> = [
    ["VERCEL_ENV=production", { ...allowedPreview, VERCEL_ENV: "production" }, "NOT_PREVIEW"],
    ["VERCEL_ENV=development", { ...allowedPreview, VERCEL_ENV: "development" }, "NOT_PREVIEW"],
    ["VERCEL_ENV absent", { ...allowedPreview, VERCEL_ENV: undefined }, "NOT_PREVIEW"],
    ["Preview + sk_live_", { ...allowedPreview, STRIPE_SECRET_KEY: "sk_live_fake" }, "STRIPE_NOT_TEST"],
    ["Preview + rk_live_", { ...allowedPreview, STRIPE_SECRET_KEY: "rk_live_fake" }, "STRIPE_NOT_TEST"],
    ["Preview + clé absente", { ...allowedPreview, STRIPE_SECRET_KEY: undefined }, "STRIPE_KEY_INVALID"],
    ["Preview + clé publishable", { ...allowedPreview, STRIPE_SECRET_KEY: "pk_test_fake" }, "STRIPE_KEY_INVALID"],
    ["Preview + clé inconnue", { ...allowedPreview, STRIPE_SECRET_KEY: "xx_fake" }, "STRIPE_KEY_INVALID"],
  ]

  for (const [label, env, code] of refused) {
    it(`${label} → ${code}`, async () => {
      setEnv(env)
      expect(() => assertLifetimePreviewTestEnvironment(process.env)).toThrowError(
        expect.objectContaining({ code }),
      )
      expect(await previewAction()).toEqual(REFUSED)
      expectNothingTouched()
      expect(spies.poolQuery).not.toHaveBeenCalled()
    })
  }
})

describe("startLifetimePreviewTestCheckout — refus C (marqueur de base)", () => {
  const refused: Array<[string, () => void]> = [
    [
      "table detailflow_environment_guard inexistante (42P01)",
      () =>
        spies.poolQuery.mockRejectedValue(
          Object.assign(new Error('relation "detailflow_environment_guard" does not exist'), { code: "42P01" }),
        ),
    ],
    ["base sans marker (NULL)", () => spies.poolQuery.mockResolvedValue(markerRows(null))],
    ["base sans marker (chaîne vide)", () => spies.poolQuery.mockResolvedValue(markerRows(""))],
    ["base sans marker (aucune ligne)", () => spies.poolQuery.mockResolvedValue({ rows: [] })],
    ["marker différent ('production')", () => spies.poolQuery.mockResolvedValue(markerRows("production"))],
    ["marker différent ('preview')", () => spies.poolQuery.mockResolvedValue(markerRows("preview"))],
    ["lecture du marker en erreur", () => spies.poolQuery.mockRejectedValue(new Error("ECONNREFUSED"))],
  ]

  for (const [label, arrange] of refused) {
    it(`Preview + sk_test_ + ${label} → refus`, async () => {
      setEnv(allowedPreview)
      arrange()
      expect(await previewAction()).toEqual(REFUSED)
      expect(spies.poolQuery).toHaveBeenCalledTimes(1)
      expectOnlyMarkerRead()
      expectNothingTouched()
    })
  }
})

describe("startLifetimePreviewTestCheckout — cas autorisé", () => {
  it("Preview + sk_test_ + marker preview-lifetime + OWNER → Checkout créé", async () => {
    setEnv(allowedPreview)
    const result = await previewAction()
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_fake_1" })
    expect(spies.poolQuery).toHaveBeenCalledWith(LIFETIME_DATABASE_MARKER_SQL)
    expect(spies.requireCompanyMember).toHaveBeenCalledWith(["OWNER"])
    expect(spies.pricesRetrieve).toHaveBeenCalledTimes(1)
    expect(spies.reserveLifetimeSlot).toHaveBeenCalledTimes(1)
    expect(spies.sessionsCreate).toHaveBeenCalledTimes(1)
    // Marker → auth → Price validé → réservation → Checkout.
    const order = (spy: { mock: { invocationCallOrder: number[] } }) => spy.mock.invocationCallOrder[0]
    expect(order(spies.poolQuery)).toBeLessThan(order(spies.requireCompanyMember))
    expect(order(spies.requireCompanyMember)).toBeLessThan(order(spies.pricesRetrieve))
    expect(order(spies.pricesRetrieve)).toBeLessThan(order(spies.reserveLifetimeSlot))
    expect(order(spies.reserveLifetimeSlot)).toBeLessThan(order(spies.sessionsCreate))
  })

  it("rk_test_ accepté", async () => {
    setEnv({ ...allowedPreview, STRIPE_SECRET_KEY: "rk_test_fake" })
    expect((await previewAction()).ok).toBe(true)
  })

  it("non-OWNER : requireCompanyMember refuse → aucune réservation ni Stripe", async () => {
    setEnv(allowedPreview)
    spies.requireCompanyMember.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(previewAction()).rejects.toThrow("NEXT_REDIRECT")
    expect(spies.reserveLifetimeSlot).not.toHaveBeenCalled()
    expect(spies.pricesRetrieve).not.toHaveBeenCalled()
    expect(spies.sessionsCreate).not.toHaveBeenCalled()
  })

  it("l'action ne prend aucun argument (rien ne vient du navigateur)", async () => {
    const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/test/actions")
    expect(mod.startLifetimePreviewTestCheckout.length).toBe(0)
  })
})

describe("startLifetimeSingleCheckout — verrou LIVE (LIFETIME_LIVE_CHECKOUT_ENABLED)", () => {
  const base = { STRIPE_PRICE_LIFETIME_SINGLE: PRICE }
  const refused: Array<[string, Record<string, string | undefined>]> = [
    ["Production + sk_live_ sans opt-in", { ...base, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_fake" }],
    ["Production + sk_test_ sans opt-in", { ...base, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_test_fake" }],
    [
      "Production + opt-in 'false'",
      { ...base, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_fake", LIFETIME_LIVE_CHECKOUT_ENABLED: "false" },
    ],
    ["Preview + rk_live_ sans opt-in", { ...base, VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "rk_live_fake" }],
    ["clé absente", { ...base, VERCEL_ENV: "preview", STRIPE_SECRET_KEY: undefined }],
  ]

  for (const [label, env] of refused) {
    it(`${label} → refus avant toute opération`, async () => {
      setEnv(env)
      const result = await generalAction()
      expect(result).toEqual({ ok: false, error: "Le paiement Lifetime n'est pas disponible pour le moment." })
      expectNothingTouched()
    })
  }

  it("pure : opt-in explicite 'true' lève le verrou", () => {
    expect(() =>
      assertLifetimeLiveCheckoutAllowed({
        VERCEL_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_fake",
        LIFETIME_LIVE_CHECKOUT_ENABLED: "true",
      }),
    ).not.toThrow()
    expect(() => assertLifetimeLiveCheckoutAllowed({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_fake" })).not.toThrow()
  })
})
