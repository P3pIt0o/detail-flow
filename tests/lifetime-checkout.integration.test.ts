import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client, Pool } from "pg"
import type Stripe from "stripe"
import { createLifetimeSingleCheckout, type LifetimeStripeClient } from "@/lib/billing/lifetime-checkout"
import { handleBillingWebhook, type BillingWebhookDeps } from "@/lib/billing/lifetime-webhook"
import { LifetimeCheckoutError } from "@/lib/billing/lifetime-checkout-core"
import { LifetimeError } from "@/lib/billing/lifetime"

/**
 * LOT S3A — intégration RÉELLE PostgreSQL (schéma temporaire isolé, jamais
 * `public`) avec un client Stripe FACTICE en mémoire : aucun appel réseau.
 */

const connectionString =
  process.env.NEON_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8")
const INVENTORY_SQL = read("scripts/lifetime-license-allocation-migration.sql")
const CHECKOUT_SQL = read("scripts/lifetime-checkout-migration.sql")
const TEST_SCHEMA = `df_lifetime_co_${Date.now().toString(36)}`
const T = `"lifetime_license_allocations"`
const PRICE = "price_single_test"
const ENV = { STRIPE_PRICE_LIFETIME_SINGLE: PRICE }
const SECRET = "whsec_test_fake"

/** Faux Stripe : sessions en mémoire, signature valide ssi header === "valid". */
function fakeStripe(opts: { failCreate?: boolean } = {}) {
  const sessions = new Map<string, Stripe.Checkout.Session>()
  const lineItems = new Map<string, Stripe.LineItem[]>()
  let counter = 0
  const calls = { create: 0, expire: 0 }
  const client = {
    checkout: {
      sessions: {
        async create(params: Stripe.Checkout.SessionCreateParams) {
          calls.create++
          if (opts.failCreate) throw new Error("stripe down")
          const id = `cs_test_${++counter}_${Math.random().toString(36).slice(2, 8)}`
          const s = {
            id,
            object: "checkout.session",
            mode: params.mode,
            status: "open",
            payment_status: "unpaid",
            currency: "eur",
            amount_total: 129000,
            client_reference_id: params.client_reference_id ?? null,
            metadata: params.metadata,
            payment_intent: null,
            url: `https://checkout.stripe.test/${id}`,
          } as unknown as Stripe.Checkout.Session
          sessions.set(id, s)
          lineItems.set(id, [{ price: { id: params.line_items?.[0]?.price }, quantity: params.line_items?.[0]?.quantity } as Stripe.LineItem])
          return s
        },
        async retrieve(id: string) {
          const s = sessions.get(id)
          if (!s) throw new Error("no such session")
          return s
        },
        async expire(id: string) {
          calls.expire++
          const s = sessions.get(id)!
          s.status = "expired"
          return s
        },
        async listLineItems(id: string) {
          return { data: lineItems.get(id) ?? [] }
        },
      },
    },
    webhooks: {
      constructEvent(payload: string, header: string) {
        if (header !== "valid") throw new Error("bad signature")
        return JSON.parse(payload) as Stripe.Event
      },
    },
  }
  return { client, sessions, lineItems, calls }
}

type Fake = ReturnType<typeof fakeStripe>

function eventFor(type: string, session: Stripe.Checkout.Session, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object: session }, ...extra })
}

async function errCode(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof LifetimeCheckoutError || e instanceof LifetimeError) return e.code
    return `OTHER:${(e as Error).message}`
  }
  return "RESOLVED"
}

describe.skipIf(!connectionString)("Lifetime Checkout + webhook Billing (intégration réelle)", () => {
  let admin: Client
  let pool: Pool

  async function createCompany(slug: string, extra: Record<string, unknown> = {}): Promise<number> {
    const cols = ["name", "slug", ...Object.keys(extra)]
    const values = [`Garage ${slug}`, slug, ...Object.values(extra)]
    const { rows } = await admin.query(
      `INSERT INTO "companies" (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING "id"`,
      values,
    )
    return rows[0].id as number
  }

  const checkout = (companyId: number, fake: Fake, role = "OWNER") =>
    createLifetimeSingleCheckout(
      { companyId, role, isSuperAdmin: false, successUrl: "https://x/ok", cancelUrl: "https://x/ko" },
      { pool, env: ENV, stripe: fake.client as unknown as LifetimeStripeClient },
    )

  const webhook = (fake: Fake, rawBody: string, signature: string | null = "valid", secret: string | undefined = SECRET) =>
    handleBillingWebhook(
      { rawBody, signature },
      { pool, env: ENV, secret, stripe: fake.client as unknown as BillingWebhookDeps["stripe"] },
    )

  function pay(fake: Fake, id: string) {
    const s = fake.sessions.get(id)!
    s.status = "complete"
    s.payment_status = "paid"
    s.payment_intent = `pi_${id}`
    return s
  }

  const allocations = async () => (await admin.query(`SELECT * FROM ${T} ORDER BY "id"`)).rows
  const company = async (id: number) => (await admin.query(`SELECT * FROM "companies" WHERE "id" = $1`, [id])).rows[0]

  beforeAll(async () => {
    admin = new Client({ connectionString })
    await admin.connect()
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`)
    await admin.query(`SET search_path TO "${TEST_SCHEMA}"`)
    await admin.query(`
      CREATE TABLE "companies" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "licensePlan" text,
        "licenseGeneration" text,
        "licenseAssignedAt" timestamp,
        "licenseAssignedByUserId" text,
        "platformFeeBps" integer,
        "stripeAccountId" text,
        "paymentsEnabled" boolean NOT NULL DEFAULT false,
        "phone" text,
        "billingMode" text NOT NULL DEFAULT 'free',
        "stripeCustomerId" text,
        "stripeSubscriptionId" text,
        "subscriptionStatus" text,
        "subscriptionPriceId" text,
        "currentPeriodEnd" timestamp,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await admin.query(`
      CREATE TABLE "license_audit_log" (
        "id" serial PRIMARY KEY,
        "companyId" integer NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
        "actorUserId" text,
        "action" text NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await admin.query(INVENTORY_SQL)
    await admin.query(CHECKOUT_SQL)
    pool = new Pool({ connectionString, max: 4 })
    pool.on("connect", (client) => {
      void client.query(`SET search_path TO "${TEST_SCHEMA}"`)
    })
  })

  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await admin.end()
    }
  })

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${T}, "license_audit_log", "companies" RESTART IDENTITY CASCADE`)
  })

  /* ------------------------------ Migration ------------------------------ */

  it("migration checkout ré-exécutable, colonnes + index uniques partiels", async () => {
    await expect(admin.query(CHECKOUT_SQL)).resolves.toBeDefined()
    const cols = await admin.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'lifetime_license_allocations'
          AND column_name IN ('stripeCheckoutSessionId','stripePaymentIntentId','paidAmountCents','paidAt')`,
      [TEST_SCHEMA],
    )
    expect(cols.rows).toHaveLength(4)
    expect(cols.rows.every((r) => r.is_nullable === "YES")).toBe(true)
    const idx = await admin.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1
        AND indexname IN ('lifetime_license_allocations_checkout_session_key','lifetime_license_allocations_payment_intent_key')`,
      [TEST_SCHEMA],
    )
    expect(idx.rows).toHaveLength(2)
    expect(idx.rows.every((r) => /UNIQUE/.test(r.indexdef) && /WHERE/.test(r.indexdef))).toBe(true)
  })

  it("index unique : une session ne peut être rattachée à deux allocations", async () => {
    await admin.query(
      `INSERT INTO ${T} ("status","paymentPlan","activatedAt","stripeCheckoutSessionId") VALUES ('ACTIVE','single',now(),'cs_dup')`,
    )
    await expect(
      admin.query(
        `INSERT INTO ${T} ("status","paymentPlan","activatedAt","stripeCheckoutSessionId") VALUES ('ACTIVE','single',now(),'cs_dup')`,
      ),
    ).rejects.toThrow()
  })

  /* ------------------------------- Checkout ------------------------------ */

  it("OWNER : réserve AVANT Stripe puis rattache la session", async () => {
    const id = await createCompany("owner")
    const fake = fakeStripe()
    const res = await checkout(id, fake)
    expect(res.reused).toBe(false)
    const rows = await allocations()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ companyId: id, status: "RESERVED", paymentPlan: "single", stripeCheckoutSessionId: res.checkoutSessionId })
    expect(fake.sessions.get(res.checkoutSessionId)?.metadata).toMatchObject({ allocation_id: String(rows[0].id), company_id: String(id) })
  })

  it("ADMIN / EMPLOYEE refusés sans réservation ni Checkout", async () => {
    const id = await createCompany("admin")
    const fake = fakeStripe()
    expect(await errCode(checkout(id, fake, "ADMIN"))).toBe("FORBIDDEN_ROLE")
    expect(await errCode(checkout(id, fake, "EMPLOYEE"))).toBe("FORBIDDEN_ROLE")
    expect(await allocations()).toHaveLength(0)
    expect(fake.calls.create).toBe(0)
  })

  it("Price env absent → fail closed, aucune réservation", async () => {
    const id = await createCompany("noprice")
    const fake = fakeStripe()
    const p = createLifetimeSingleCheckout(
      { companyId: id, role: "OWNER", isSuperAdmin: false, successUrl: "s", cancelUrl: "c" },
      { pool, env: {}, stripe: fake.client as unknown as LifetimeStripeClient },
    )
    expect(await errCode(p)).toBe("PRICE_NOT_CONFIGURED")
    expect(await allocations()).toHaveLength(0)
  })

  it("sold out → aucun Checkout Stripe", async () => {
    await admin.query(
      `INSERT INTO ${T} ("status","activatedAt","paymentPlan") SELECT 'ACTIVE', now(), 'single' FROM generate_series(1,50)`,
    )
    const id = await createCompany("late")
    const fake = fakeStripe()
    expect(await errCode(checkout(id, fake))).toBe("SOLD_OUT")
    expect(fake.calls.create).toBe(0)
  })

  it("abonnement existant / FOUNDER → refus, aucun Checkout", async () => {
    const sub = await createCompany("sub", { stripeSubscriptionId: "sub_test" })
    const founder = await createCompany("founder", { licensePlan: "FOUNDER" })
    const fake = fakeStripe()
    expect(await errCode(checkout(sub, fake))).not.toBe("RESOLVED")
    expect(await errCode(checkout(founder, fake))).not.toBe("RESOLVED")
    expect(fake.calls.create).toBe(0)
  })

  it("échec Stripe → réservation libérée immédiatement", async () => {
    const id = await createCompany("fail")
    const fake = fakeStripe({ failCreate: true })
    expect(await errCode(checkout(id, fake))).toBe("CHECKOUT_CREATE_FAILED")
    const rows = await allocations()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("RELEASED")
  })

  it("double clic séquentiel → même session réutilisée, un seul slot", async () => {
    const id = await createCompany("dbl")
    const fake = fakeStripe()
    const a = await checkout(id, fake)
    const b = await checkout(id, fake)
    expect(b.reused).toBe(true)
    expect(b.checkoutSessionId).toBe(a.checkoutSessionId)
    expect(fake.calls.create).toBe(1)
    expect((await allocations()).filter((r) => r.status === "RESERVED")).toHaveLength(1)
  })

  it("double clic simultané → jamais deux slots ni deux sessions rattachées", async () => {
    const id = await createCompany("race")
    const fake = fakeStripe()
    const settled = await Promise.allSettled([checkout(id, fake), checkout(id, fake)])
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1)
    const rows = await allocations()
    expect(rows.filter((r) => r.status === "RESERVED")).toHaveLength(1)
    expect(rows.filter((r) => r.stripeCheckoutSessionId)).toHaveLength(1)
  })

  it("session existante expirée → ancienne réservation libérée, nouvelle session", async () => {
    const id = await createCompany("exp")
    const fake = fakeStripe()
    const a = await checkout(id, fake)
    fake.sessions.get(a.checkoutSessionId)!.status = "expired"
    const b = await checkout(id, fake)
    expect(b.checkoutSessionId).not.toBe(a.checkoutSessionId)
    const rows = await allocations()
    expect(rows.map((r) => r.status)).toEqual(["RELEASED", "RESERVED"])
  })

  /* ------------------------------- Webhook ------------------------------- */

  it("secret absent → 500 ; signature absente/invalide → 400 ; rien n'est traité", async () => {
    const fake = fakeStripe()
    const body = eventFor("checkout.session.completed", { id: "cs_x" } as Stripe.Checkout.Session)
    const noSecret = await handleBillingWebhook(
      { rawBody: body, signature: "valid" },
      { pool, env: ENV, secret: undefined, stripe: fake.client as unknown as BillingWebhookDeps["stripe"] },
    )
    expect(noSecret.status).toBe(500)
    expect((await webhook(fake, body, null)).status).toBe(400)
    expect((await webhook(fake, body, "forged")).status).toBe(400)
  })

  it("completed payé → activation BUSINESS / lifetime / 0 bps + traçabilité, Connect intact", async () => {
    const id = await createCompany("paid", { stripeAccountId: "acct_detailer", paymentsEnabled: true, phone: "0600" })
    const fake = fakeStripe()
    const { checkoutSessionId } = await checkout(id, fake)
    const res = await webhook(fake, eventFor("checkout.session.completed", pay(fake, checkoutSessionId)))
    expect(res).toMatchObject({ status: 200, body: { activated: true } })
    const [row] = await allocations()
    expect(row).toMatchObject({ status: "ACTIVE", stripePaymentIntentId: `pi_${checkoutSessionId}`, paidAmountCents: 129000 })
    expect(row.paidAt).not.toBeNull()
    expect(await company(id)).toMatchObject({
      billingMode: "lifetime",
      licensePlan: "BUSINESS",
      platformFeeBps: 0,
      stripeAccountId: "acct_detailer",
      paymentsEnabled: true,
      phone: "0600",
      stripeSubscriptionId: null,
    })
  })

  it("webhook rejoué → idempotent (un slot, un audit)", async () => {
    const id = await createCompany("replay")
    const fake = fakeStripe()
    const { checkoutSessionId } = await checkout(id, fake)
    const body = eventFor("checkout.session.completed", pay(fake, checkoutSessionId))
    await webhook(fake, body)
    const again = await webhook(fake, body)
    expect(again.body).toMatchObject({ alreadyActive: true })
    const async = await webhook(fake, eventFor("checkout.session.async_payment_succeeded", fake.sessions.get(checkoutSessionId)!))
    expect(async.status).toBe(200)
    expect(await allocations()).toHaveLength(1)
    const audits = await admin.query(`SELECT count(*)::int AS n FROM "license_audit_log" WHERE "companyId" = $1`, [id])
    expect(audits.rows[0].n).toBeLessThanOrEqual(1)
  })

  it("completed non payé → aucune activation ; async_payment_succeeded → activation", async () => {
    const id = await createCompany("async")
    const fake = fakeStripe()
    const { checkoutSessionId } = await checkout(id, fake)
    const s = fake.sessions.get(checkoutSessionId)!
    s.status = "complete"
    const pending = await webhook(fake, eventFor("checkout.session.completed", s))
    expect(pending.body).toMatchObject({ pending: true })
    expect((await allocations())[0].status).toBe("RESERVED")
    const done = await webhook(fake, eventFor("checkout.session.async_payment_succeeded", pay(fake, checkoutSessionId)))
    expect(done.body).toMatchObject({ activated: true })
  })

  it("expired → release ; async_payment_failed → release ; jamais une ACTIVE", async () => {
    const a = await createCompany("expw")
    const b = await createCompany("failw")
    const fake = fakeStripe()
    const sa = await checkout(a, fake)
    const sb = await checkout(b, fake)
    await webhook(fake, eventFor("checkout.session.expired", fake.sessions.get(sa.checkoutSessionId)!))
    await webhook(fake, eventFor("checkout.session.async_payment_failed", fake.sessions.get(sb.checkoutSessionId)!))
    const rows = await allocations()
    expect(rows.map((r) => r.status)).toEqual(["RELEASED", "RELEASED"])

    const c = await createCompany("activeexp")
    const sc = await checkout(c, fake)
    await webhook(fake, eventFor("checkout.session.completed", pay(fake, sc.checkoutSessionId)))
    const res = await webhook(fake, eventFor("checkout.session.expired", fake.sessions.get(sc.checkoutSessionId)!))
    expect(res.status).toBe(200)
    expect((await allocations()).find((r) => r.companyId === c)?.status).toBe("ACTIVE")
  })

  it("événement d'un compte Connect → ignoré", async () => {
    const id = await createCompany("connect")
    const fake = fakeStripe()
    const { checkoutSessionId } = await checkout(id, fake)
    const res = await webhook(fake, eventFor("checkout.session.completed", pay(fake, checkoutSessionId), { account: "acct_x" }))
    expect(res.body).toMatchObject({ ignored: "connect_account" })
    expect((await allocations())[0].status).toBe("RESERVED")
  })

  const tamper: Array<[string, (s: Stripe.Checkout.Session, fake: Fake, other: number) => void]> = [
    ["mauvais company_id", (s, _f, other) => { s.metadata = { ...s.metadata, company_id: String(other) }; s.client_reference_id = null }],
    ["mauvais allocation_id", (s) => { s.metadata = { ...s.metadata, allocation_id: "999" } }],
    ["mauvais montant", (s) => { s.amount_total = 69000 }],
    ["mauvais Price", (s, f) => { f.lineItems.set(s.id, [{ price: { id: "price_other" }, quantity: 1 } as Stripe.LineItem]) }],
  ]
  for (const [label, mutate] of tamper) {
    it(`${label} → aucune activation`, async () => {
      const id = await createCompany(`t-${label.replace(/\W/g, "")}`)
      const other = await createCompany(`o-${label.replace(/\W/g, "")}`)
      const fake = fakeStripe()
      const { checkoutSessionId } = await checkout(id, fake)
      const s = pay(fake, checkoutSessionId)
      mutate(s, fake, other)
      const res = await webhook(fake, eventFor("checkout.session.completed", s))
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty("rejected")
      expect((await allocations())[0].status).toBe("RESERVED")
      expect((await company(id)).billingMode).toBe("free")
      expect((await company(other)).billingMode).toBe("free")
    })
  }

  it("succès navigateur seul (sans webhook) → aucune activation", async () => {
    const id = await createCompany("browser")
    const fake = fakeStripe()
    const { checkoutSessionId } = await checkout(id, fake)
    pay(fake, checkoutSessionId)
    expect((await allocations())[0].status).toBe("RESERVED")
    expect((await company(id)).billingMode).toBe("free")
  })
})
