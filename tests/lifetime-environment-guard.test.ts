import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type Stripe from "stripe"
import {
  LifetimeEnvironmentGuardError,
  assertLifetimeLiveCheckoutAllowed,
  assertLifetimePreviewTestEnvironment,
  extractDatabaseHostname,
} from "@/lib/billing/lifetime-environment-guard"

/* Aucun réseau : Stripe, DB et session sont entièrement simulés. */

const PRICE = "price_fake_single"
const PREVIEW_HOST = "ep-preview-lifetime-123.eu-central-1.aws.neon.tech"
const PROD_HOST = "ep-production-999.eu-central-1.aws.neon.tech"
const dbUrl = (host: string) => `postgresql://user:s3cret@${host}/neondb?sslmode=require`

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
}))

vi.mock("@/lib/billing/lifetime-server", () => ({
  reserveLifetimeSlot: spies.reserveLifetimeSlot,
  findOpenLifetimeReservation: spies.findOpenLifetimeReservation,
  attachLifetimeCheckoutSession: spies.attachLifetimeCheckoutSession,
  releaseLifetimeReservation: spies.releaseLifetimeReservation,
}))
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
  "DATABASE_URL",
  "LIFETIME_PREVIEW_DATABASE_HOST",
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

const allowedPreview = {
  VERCEL_ENV: "preview",
  STRIPE_SECRET_KEY: "sk_test_fake",
  DATABASE_URL: dbUrl(PREVIEW_HOST),
  LIFETIME_PREVIEW_DATABASE_HOST: PREVIEW_HOST,
  STRIPE_PRICE_LIFETIME_SINGLE: PRICE,
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  for (const spy of Object.values(spies)) spy.mockReset()
  spies.getStripe.mockReturnValue(fakeStripe)
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

function expectNothingTouched() {
  expect(spies.reserveLifetimeSlot).not.toHaveBeenCalled()
  expect(spies.findOpenLifetimeReservation).not.toHaveBeenCalled()
  expect(spies.pricesRetrieve).not.toHaveBeenCalled()
  expect(spies.sessionsCreate).not.toHaveBeenCalled()
  expect(spies.getStripe).not.toHaveBeenCalled()
  expect(spies.requireCompanyMember).not.toHaveBeenCalled()
}

async function previewAction() {
  const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/test/actions")
  return mod.startLifetimePreviewTestCheckout()
}

async function generalAction() {
  const mod = await import("../app/admin/(dashboard)/abonnement/lifetime/actions")
  return mod.startLifetimeSingleCheckout()
}

describe("extractDatabaseHostname", () => {
  it("extrait uniquement le hostname, jamais les credentials", () => {
    expect(extractDatabaseHostname(dbUrl(PREVIEW_HOST))).toBe(PREVIEW_HOST)
    expect(extractDatabaseHostname(dbUrl(PREVIEW_HOST))).not.toContain("s3cret")
  })
  it("absente / illisible → refus", () => {
    expect(() => extractDatabaseHostname(undefined)).toThrow(LifetimeEnvironmentGuardError)
    expect(() => extractDatabaseHostname("")).toThrow(LifetimeEnvironmentGuardError)
    expect(() => extractDatabaseHostname("pas une url")).toThrow(LifetimeEnvironmentGuardError)
  })
})

describe("assertLifetimePreviewTestEnvironment — messages sans secret", () => {
  it("mauvais hostname : message avec le hostname seul, sans mot de passe", () => {
    try {
      assertLifetimePreviewTestEnvironment({ ...allowedPreview, DATABASE_URL: dbUrl(PROD_HOST) })
      throw new Error("aurait dû refuser")
    } catch (error) {
      expect((error as LifetimeEnvironmentGuardError).code).toBe("DATABASE_HOST_MISMATCH")
      expect((error as Error).message).toContain(PROD_HOST)
      expect((error as Error).message).not.toContain("s3cret")
      expect((error as Error).message).not.toContain("user:")
    }
  })
  it("cas autorisé → renvoie le hostname validé", () => {
    expect(assertLifetimePreviewTestEnvironment(allowedPreview)).toEqual({ databaseHost: PREVIEW_HOST })
  })
})

describe("startLifetimePreviewTestCheckout — cas refusés (aucune DB, aucun Stripe)", () => {
  const refused: Array<[string, Record<string, string | undefined>, string]> = [
    ["1. VERCEL_ENV=production", { ...allowedPreview, VERCEL_ENV: "production" }, "NOT_PREVIEW"],
    ["2. VERCEL_ENV=development", { ...allowedPreview, VERCEL_ENV: "development" }, "NOT_PREVIEW"],
    ["3. VERCEL_ENV absent", { ...allowedPreview, VERCEL_ENV: undefined }, "NOT_PREVIEW"],
    ["4. Preview + sk_live_", { ...allowedPreview, STRIPE_SECRET_KEY: "sk_live_fake" }, "STRIPE_NOT_TEST"],
    ["5. Preview + rk_live_", { ...allowedPreview, STRIPE_SECRET_KEY: "rk_live_fake" }, "STRIPE_NOT_TEST"],
    ["6. Preview + clé absente", { ...allowedPreview, STRIPE_SECRET_KEY: undefined }, "STRIPE_KEY_INVALID"],
    ["6b. Preview + clé publishable", { ...allowedPreview, STRIPE_SECRET_KEY: "pk_test_fake" }, "STRIPE_KEY_INVALID"],
    ["7. Preview + DATABASE_URL Production", { ...allowedPreview, DATABASE_URL: dbUrl(PROD_HOST) }, "DATABASE_HOST_MISMATCH"],
    [
      "8. Preview + hostname Neon différent",
      { ...allowedPreview, DATABASE_URL: dbUrl("ep-other-branch-555.eu-central-1.aws.neon.tech") },
      "DATABASE_HOST_MISMATCH",
    ],
    [
      "9. Preview + LIFETIME_PREVIEW_DATABASE_HOST absent",
      { ...allowedPreview, LIFETIME_PREVIEW_DATABASE_HOST: undefined },
      "PREVIEW_DATABASE_HOST_MISSING",
    ],
    ["9b. Preview + DATABASE_URL absente", { ...allowedPreview, DATABASE_URL: undefined }, "DATABASE_URL_MISSING"],
  ]

  for (const [label, env, code] of refused) {
    it(label, async () => {
      setEnv(env)
      expect(() => assertLifetimePreviewTestEnvironment(process.env)).toThrowError(
        expect.objectContaining({ code }),
      )
      const result = await previewAction()
      expect(result).toEqual({ ok: false, error: "L'outil de test Lifetime n'est pas disponible sur cet environnement." })
      expectNothingTouched()
    })
  }
})

describe("startLifetimePreviewTestCheckout — cas autorisé", () => {
  it("Preview + sk_test_ + hostname exact + OWNER → Checkout créé", async () => {
    setEnv(allowedPreview)
    const result = await previewAction()
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_fake_1" })
    expect(spies.requireCompanyMember).toHaveBeenCalledWith(["OWNER"])
    expect(spies.pricesRetrieve).toHaveBeenCalledTimes(1)
    expect(spies.reserveLifetimeSlot).toHaveBeenCalledTimes(1)
    expect(spies.sessionsCreate).toHaveBeenCalledTimes(1)
    // L'ordre reste : Price validé AVANT la réservation, réservation AVANT Checkout.
    expect(spies.pricesRetrieve.mock.invocationCallOrder[0]).toBeLessThan(
      spies.reserveLifetimeSlot.mock.invocationCallOrder[0],
    )
    expect(spies.reserveLifetimeSlot.mock.invocationCallOrder[0]).toBeLessThan(
      spies.sessionsCreate.mock.invocationCallOrder[0],
    )
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
})

describe("startLifetimeSingleCheckout — verrou LIVE (LIFETIME_LIVE_CHECKOUT_ENABLED)", () => {
  const base = { STRIPE_PRICE_LIFETIME_SINGLE: PRICE, DATABASE_URL: dbUrl(PROD_HOST) }
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
