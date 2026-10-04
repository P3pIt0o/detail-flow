import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { and, eq } from "drizzle-orm"

vi.mock("server-only", () => ({}))

import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import * as payments from "@/lib/customer-subscriptions/payments"
import { drainCustomerSubscriptionOutbox } from "@/lib/customer-subscriptions/notifications"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/lib/customer-subscriptions/customer-portal.server", () => ({ get customerDb() { return db } }))
vi.mock("@/lib/tenant", () => ({ resolvePublicRequestTenant: async () => ({ id: A.companyId, name: "Atelier" }) }))
import {
  CUSTOMER_MANAGE_PATH,
  MANAGE_LINK_TTL_SECONDS,
  customerSessionCookieOptions,
  signCustomerAccess,
} from "@/lib/customer-subscriptions/customer-access"
import {
  computeCustomerActions,
  readCheckoutReturnState,
  customerRequestEarlyCancellation,
  customerRequestRenewalOptOut,
  customerRevokeRenewalOptOut,
  customerScheduleCancellation,
  customerStartCheckout,
  customerStatusLabel,
  customerWithdrawEarlyCancellation,
  exchangeManageLink,
  loadCustomerPortal,
  resolveCustomerSession,
  CustomerSessionInvalidError,
} from "@/lib/customer-subscriptions/customer-service"
import type { PlanConfigInput } from "@/lib/customer-subscriptions/plan-validation"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const SECRET = "test-secret-portal-0123456789abcdef0123456789"
const OTHER_SECRET = "other-secret-portal-0123456789abcdef012345678"
const NOW = new Date("2026-03-10T10:00:00.000Z")
const owner: engine.Actor = { userId: "u-owner", role: "OWNER" }

let pg: PGlite
let db: engine.Executor
let seq = 0
const uid = (p: string) => `${p}_${++seq}`

type Call = { method: string; id?: string; params?: Record<string, unknown> }

function fakePort(opts: { failUpdate?: boolean } = {}) {
  const calls: Call[] = []
  let failUpdate = !!opts.failUpdate
  const subs = new Map<string, payments.SubscriptionLike>()
  const port = {
    async createCheckoutSession(params: Record<string, unknown>) {
      calls.push({ method: "createCheckoutSession", params })
      return { id: uid("cs_test"), status: "open", client_secret: uid("secret"), mode: params.mode as string, metadata: params.metadata as Record<string, string> }
    },
    async retrieveCheckoutSession(id: string) {
      calls.push({ method: "retrieveCheckoutSession", id })
      return { id, status: "open", client_secret: uid("secret"), metadata: {} }
    },
    async retrieveSubscription(id: string) {
      calls.push({ method: "retrieveSubscription", id })
      return subs.get(id) ?? { id, status: "active", metadata: {} }
    },
    async updateSubscription(id: string, params: Record<string, unknown>) {
      calls.push({ method: "updateSubscription", id, params })
      if (failUpdate) throw Object.assign(new Error("stripe down"), { type: "StripeConnectionError" })
      const prev = subs.get(id) ?? { id, status: "active", metadata: {} }
      subs.set(id, { ...prev, cancel_at: params.cancel_at === "" ? null : (params.cancel_at as number) })
      return { id }
    },
    async cancelSubscription(id: string) {
      calls.push({ method: "cancelSubscription", id })
      return { id, status: "canceled" }
    },
    async retrievePaymentIntent(id: string) {
      calls.push({ method: "retrievePaymentIntent", id })
      return { id, application_fee_amount: 0 }
    },
    async updateInvoice(id: string) {
      calls.push({ method: "updateInvoice", id })
      return { id }
    },
    async retrieveInvoice(id: string) {
      calls.push({ method: "retrieveInvoice", id })
      return { id }
    },
    async retrievePaymentIntentWithBalance(id: string) {
      calls.push({ method: "retrievePaymentIntentWithBalance", id })
      return { id, latest_charge: null }
    },
  } as unknown as payments.CustomerSubscriptionStripePort
  return { port, calls, subs, setFail: (v: boolean) => (failUpdate = v) }
}

async function seedCompany() {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO companies ("licensePlan","stripeAccountId","stripeChargesEnabled","paymentsEnabled") VALUES ('BUSINESS',$1,true,true) RETURNING id`,
    [uid("acct_test")],
  )
  const companyId = r.rows[0].id
  await pg.query(`INSERT INTO settings ("companyId", "businessName", "businessEmail") VALUES ($1,'Atelier','pro@example.com')`, [companyId])
  const s = await pg.query<{ id: number }>(`INSERT INTO services ("companyId", name, "basePriceCents") VALUES ($1,'Lavage complet',4900) RETURNING id`, [companyId])
  return { companyId, serviceId: s.rows[0].id }
}

type Seeded = { companyId: number; subscriptionId: number; hash: string; ext: string }

/** Crée un contrat puis le place dans l'état voulu (SQL direct = fixture, pas le code testé). */
async function seedSub(
  c: { companyId: number; serviceId: number },
  plan: PlanConfigInput = {},
  state: { status?: string; termEndsAt?: Date | null; paymentMode?: "recurring" | "prepaid"; prepaidUntil?: Date | null } = {},
): Promise<Seeded> {
  const { planId } = await engine.createPlan(db, c.companyId, owner, {
    name: "Entretien Premium",
    priceCents: 3900,
    currency: "EUR",
    billingIntervalUnit: "month",
    billingIntervalCount: 1,
    includedUsesPerCycle: 1,
    includedServiceId: c.serviceId,
    commitmentUnit: "none",
    commitmentCount: 0,
    renewalMode: "open_ended",
    status: "active",
    ...plan,
  })
  const { subscriptionId } = await engine.createSubscription(
    db,
    c.companyId,
    owner,
    { planId, customer: { name: "Jean", email: "jean@example.com" }, vehicle: { brand: "Peugeot", model: "308" }, paymentMode: state.paymentMode ?? "recurring", idempotencyKey: uid("idem-key-xxxxxxxx") },
    NOW,
  )
  const hash = uid("hash").padEnd(64, "a")
  const ext = uid("sub_test")
  const anchor = new Date("2026-01-12T00:00:00.000Z")
  if (state.status && state.status !== "pending_payment") {
    await pg.query(
      `UPDATE maintenance_subscriptions SET status=$1, "billingAnchorAt"=$2, "activatedAt"=$2, "startedAt"=$2, "currentTermStartedAt"=$2, "currentTermEndsAt"=$3,
        provider='stripe', "providerAccountId"=(SELECT "stripeAccountId" FROM companies WHERE id=$4), "externalSubscriptionId"=$5, "prepaidUntil"=$6
       WHERE id=$7`,
      [state.status, anchor, state.termEndsAt ?? null, c.companyId, state.paymentMode === "prepaid" ? null : ext, state.prepaidUntil ?? null, subscriptionId],
    )
  }
  await pg.query(`UPDATE maintenance_subscriptions SET "manageTokenHash"=$1 WHERE id=$2`, [hash, subscriptionId])
  return { companyId: c.companyId, subscriptionId, hash, ext }
}

const link = (s: Seeded, o: { ttl?: number; secret?: string; hash?: string; companyId?: number; subscriptionId?: number; purpose?: "manage_link" | "session" } = {}) =>
  signCustomerAccess(
    {
      companyId: o.companyId ?? s.companyId,
      subscriptionId: o.subscriptionId ?? s.subscriptionId,
      purpose: o.purpose ?? "manage_link",
      manageTokenHash: o.hash ?? s.hash,
      ttlSeconds: o.ttl ?? MANAGE_LINK_TTL_SECONDS,
    },
    NOW,
    o.secret ?? SECRET,
  )

async function sessionFor(s: Seeded) {
  const r = await exchangeManageLink(db, { companyId: s.companyId, linkToken: link(s), now: NOW, secret: SECRET })
  if (!r.ok) throw new Error("exchange failed")
  return { companyId: s.companyId, sessionToken: r.sessionToken, now: NOW, secret: SECRET }
}

const getSub = async (id: number) => (await db.select().from(schema.maintenanceSubscriptions).where(eq(schema.maintenanceSubscriptions.id, id)))[0]
const snapshotRow = async (id: number) => JSON.stringify(await getSub(id))
const outboxTypes = async (subscriptionId: number) =>
  (await db.select().from(schema.maintenanceSubscriptionEmailOutbox).where(eq(schema.maintenanceSubscriptionEmailOutbox.subscriptionId, subscriptionId))).map((r) => r.type)
const auditActions = async (subscriptionId: number) =>
  (await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, subscriptionId))).map((r) => r.action)
const cancellationRequests = (companyId: number, subscriptionId: number) =>
  db
    .select()
    .from(schema.maintenanceCancellationRequests)
    .where(and(eq(schema.maintenanceCancellationRequests.companyId, companyId), eq(schema.maintenanceCancellationRequests.subscriptionId, subscriptionId)))

let A: { companyId: number; serviceId: number }
let B: { companyId: number; serviceId: number }

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text NOT NULL DEFAULT ('tenant-' || floor(random()*1e9)::text), "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
    CREATE TABLE settings (id serial PRIMARY KEY, "companyId" integer NOT NULL UNIQUE, "businessName" text, "businessEmail" text);
    CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
    CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
    CREATE TABLE bookings (id serial PRIMARY KEY);
    CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
  `)
  await pg.exec(read("scripts/customer-subscriptions-schema-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-runtime-core-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-stripe-refunds-migration.sql"))
  await pg.exec(read("scripts/customer-subscriptions-ui-v1-migration.sql"))
  db = drizzle(pg, { schema }) as unknown as engine.Executor
  A = await seedCompany()
  B = await seedCompany()
})

/* -------------------------------- Liens -------------------------------- */

describe("échange du lien signé", () => {
  it("lien valide → session (purpose=session) + audit sans PII", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const r = await exchangeManageLink(db, { companyId: A.companyId, linkToken: link(s), now: NOW, secret: SECRET })
    expect(r.ok).toBe(true)
    const audits = await db.select().from(schema.maintenanceAuditLog).where(eq(schema.maintenanceAuditLog.subscriptionId, s.subscriptionId))
    const created = audits.find((a) => a.action === "customer_access_session_created")!
    expect(created).toBeTruthy()
    expect(JSON.stringify(created)).not.toContain("jean@example.com")
    // Le lien email ne peut pas servir de session, ni l'inverse.
    expect(await resolveCustomerSession(db, { companyId: A.companyId, sessionToken: link(s), now: NOW, secret: SECRET })).toBeNull()
    if (r.ok) expect((await exchangeManageLink(db, { companyId: A.companyId, linkToken: r.sessionToken, now: NOW, secret: SECRET })).ok).toBe(false)
  })

  it("expiré / falsifié / mauvais tenant / mauvais id / hash modifié / token tourné → refus générique", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const later = new Date(NOW.getTime() + (MANAGE_LINK_TTL_SECONDS + 1) * 1000)
    const ex = (t: string, companyId = A.companyId, now = NOW) => exchangeManageLink(db, { companyId, linkToken: t, now, secret: SECRET })
    expect(await ex(link(s), A.companyId, later)).toEqual({ ok: false })
    expect(await ex(link(s, { secret: OTHER_SECRET }))).toEqual({ ok: false })
    const t = link(s)
    expect(await ex(t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA"))).toEqual({ ok: false })
    expect(await ex(link(s), B.companyId)).toEqual({ ok: false })
    const other = await seedSub(A, {}, { status: "active" })
    expect(await ex(link(s, { subscriptionId: other.subscriptionId }))).toEqual({ ok: false })
    expect(await ex(link(s, { hash: "f".repeat(64) }))).toEqual({ ok: false })
    await pg.query(`UPDATE maintenance_subscriptions SET "manageTokenHash"=$1 WHERE id=$2`, [uid("rot").padEnd(64, "b"), s.subscriptionId])
    expect(await ex(link(s))).toEqual({ ok: false })
  })

  it("aucun secret en production → fail closed", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    vi.stubEnv("CUSTOMER_SUBSCRIPTIONS_ACTION_SECRET", "")
    vi.stubEnv("NODE_ENV", "production")
    try {
      expect(await exchangeManageLink(db, { companyId: A.companyId, linkToken: link(s), now: NOW })).toEqual({ ok: false })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("cookie : HttpOnly, SameSite=Lax, Secure en production, scope /abonnements, durée courte", () => {
    const prod = customerSessionCookieOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv)
    expect(prod).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/abonnements" })
    expect(prod.maxAge).toBeLessThanOrEqual(3600)
    expect(customerSessionCookieOptions({ NODE_ENV: "development" } as NodeJS.ProcessEnv).secure).toBe(false)
  })

  it("route /acces : GET échange puis redirige vers /abonnements/gerer sans token", () => {
    const src = read("app/abonnements/gerer/acces/route.ts")
    expect(src).toContain("exchangeManageLink")
    expect(src).toContain("CUSTOMER_MANAGE_PATH")
    expect(src).not.toMatch(/searchParams\.set\(["']t["']/)
    expect(src).not.toMatch(/export (async )?function POST/)
    expect(CUSTOMER_MANAGE_PATH).toBe("/abonnements/gerer")
  })
})

/* --------------------------- GET non mutant --------------------------- */

describe("GET non mutant", () => {
  it("échange + lecture portail (même avec ?action=cancel) ne modifient pas le contrat", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const before = await snapshotRow(s.subscriptionId)
    const ctx = await sessionFor(s)
    const view = await loadCustomerPortal(db, ctx)
    await loadCustomerPortal(db, ctx)
    expect(view?.status).toBe("Actif")
    expect(await snapshotRow(s.subscriptionId)).toBe(before)
    expect(await cancellationRequests(s.companyId, s.subscriptionId)).toHaveLength(0)
    expect(await outboxTypes(s.subscriptionId)).toEqual([])
    const page = read("app/abonnements/gerer/page.tsx")
    expect(page).not.toMatch(/searchParams/)
    expect(page).not.toMatch(/customer(RequestRenewalOptOut|ScheduleCancellation|RequestEarlyCancellation)/)
  })

  it("en-têtes : no-store, no-referrer, noindex sur /abonnements", () => {
    const cfg = read("next.config.mjs")
    expect(cfg).toContain('source: "/abonnements/:path*"')
    expect(cfg).toContain("no-store")
    expect(cfg).toContain("no-referrer")
    expect(cfg).toContain("noindex, nofollow")
    expect(read("app/abonnements/layout.tsx")).toMatch(/index:\s*false/)
  })
})

/* ---------------------------- Isolation tenant ---------------------------- */

describe("isolation", () => {
  it("client A ne voit jamais B ; cookie cross-tenant refusé", async () => {
    const a = await seedSub(A, {}, { status: "active" })
    const b = await seedSub(B, {}, { status: "active" })
    const ctxA = await sessionFor(a)
    const viewA = await loadCustomerPortal(db, ctxA)
    expect(viewA).not.toBeNull()
    // Même cookie présenté sur le tenant B.
    expect(await loadCustomerPortal(db, { ...ctxA, companyId: B.companyId })).toBeNull()
    await expect(customerScheduleCancellation(db, fakePort().port, { ...ctxA, companyId: B.companyId })).rejects.toBeInstanceOf(CustomerSessionInvalidError)
    expect((await getSub(b.subscriptionId)).cancelAt).toBeNull()
  })

  it("aucun identifiant navigateur : les actions n'acceptent que la session", async () => {
    const a = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const other = await seedSub(A, {}, { status: "active" })
    const ctx = await sessionFor(a)
    await customerRequestEarlyCancellation(db, ctx, { message: "Bonjour", subscriptionId: other.subscriptionId, companyId: B.companyId, planId: 999 } as never)
    expect(await cancellationRequests(A.companyId, a.subscriptionId)).toHaveLength(1)
    expect(await cancellationRequests(A.companyId, other.subscriptionId)).toHaveLength(0)
    const actions = read("app/abonnements/gerer/actions.ts")
    expect(actions).not.toMatch(/formData\.get\(["'](subscriptionId|companyId|customerId|planId|price)/)
    // Jamais de rôle admin simulé côté client.
    expect(read("lib/customer-subscriptions/customer-service.ts")).not.toMatch(/role:\s*["']OWNER["']/)
    expect(actions).not.toMatch(/role:\s*["']OWNER["']/)
  })

  it("session absente ou invalide → erreur générique", async () => {
    await expect(customerRequestRenewalOptOut(db, fakePort().port, { companyId: A.companyId, sessionToken: null, now: NOW, secret: SECRET })).rejects.toBeInstanceOf(CustomerSessionInvalidError)
    await expect(customerRequestRenewalOptOut(db, fakePort().port, { companyId: A.companyId, sessionToken: "x.y", now: NOW, secret: SECRET })).rejects.toBeInstanceOf(CustomerSessionInvalidError)
  })
})

/* ---------------------------- Statuts & actions ---------------------------- */

describe("statuts et actions proposées", () => {
  it("libellés FR, jamais l'enum brut", () => {
    for (const [k, v] of [
      ["pending_initial_cleaning", "Nettoyage initial à réaliser"],
      ["pending_payment", "En attente de paiement"],
      ["active", "Actif"],
      ["past_due", "Paiement à régulariser"],
      ["suspended", "Suspendu"],
      ["cancel_scheduled", "Arrêt programmé"],
      ["cancelled", "Annulé"],
      ["ended", "Terminé"],
      ["expired", "Expiré"],
    ])
      expect(customerStatusLabel(k)).toBe(v)
    expect(customerStatusLabel("weird_enum")).not.toContain("weird")
  })

  it("sans engagement → arrêt à la prochaine frontière de facturation", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const view = await loadCustomerPortal(db, await sessionFor(s))
    expect(view?.primaryAction?.kind).toBe("schedule_cancellation")
    const at = (view!.primaryAction as { cancelAt: Date }).cancelAt
    expect(at.getTime()).toBeGreaterThan(NOW.getTime())
    expect(at.toISOString()).toBe("2026-03-12T00:00:00.000Z")
  })

  it("engagement en cours (same_term) → non-renouvellement, jamais d'arrêt avant la fin d'engagement", async () => {
    const termEnd = new Date("2027-01-12T00:00:00.000Z")
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12, renewalMode: "same_term" }, { status: "active", termEndsAt: termEnd })
    const view = await loadCustomerPortal(db, await sessionFor(s))
    expect(view?.primaryAction?.kind).toBe("renewal_opt_out")
    expect(view?.secondaryAction?.kind).toBe("early_cancellation_request")
    expect(view?.primaryAction).not.toHaveProperty("cancelAt")
    const r = await customerScheduleCancellation(db, fakePort().port, await sessionFor(s)).catch((e) => e)
    // Si le moteur accepte, la date ne peut jamais précéder la fin d'engagement.
    if (!(r instanceof Error)) expect(new Date(r.cancelAt).getTime()).toBeGreaterThanOrEqual(termEnd.getTime())
  })

  it("prepaid → pas de non-renouvellement, seulement la demande de fin anticipée", async () => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12, renewalMode: "none", allowPrepaidPayment: true, prepaidBillingCycles: 12 }, { status: "active", paymentMode: "prepaid", prepaidUntil: new Date("2027-01-12T00:00:00.000Z"), termEndsAt: new Date("2027-01-12T00:00:00.000Z") })
    const view = await loadCustomerPortal(db, await sessionFor(s))
    expect(view?.primaryAction).toBeNull()
    expect(view?.secondaryAction?.kind).toBe("early_cancellation_request")
  })

  it("pending_payment → checkout ; terminal → aucune action et mutation refusée", async () => {
    const p = await seedSub(A)
    expect((await loadCustomerPortal(db, await sessionFor(p)))?.primaryAction).toEqual({ kind: "checkout", step: "subscription" })
    const t = await seedSub(A, {}, { status: "cancelled" })
    const ctx = await sessionFor(t)
    const view = await loadCustomerPortal(db, ctx)
    expect(view?.primaryAction).toBeNull()
    expect(view?.secondaryAction).toBeNull()
    await expect(customerScheduleCancellation(db, fakePort().port, ctx)).rejects.toThrow()
    await expect(customerRequestEarlyCancellation(db, ctx, {})).rejects.toThrow()
  })

  it("arrêt déjà programmé → plus d'action d'arrêt", async () => {
    const sub = { status: "cancel_scheduled", billingAnchorAt: NOW, paymentMode: "recurring", cancelAt: new Date("2026-05-01T00:00:00.000Z"), commitmentUnitSnapshot: "none" } as never
    expect(computeCustomerActions(sub, { hasPendingEarlyCancellation: false, initialCleaningPaid: false }, NOW)).toEqual({ primary: null, secondary: null })
  })
})

/* ---------------------------- Mutations + Stripe ---------------------------- */

describe("non-renouvellement / révocation / arrêt + synchronisation Stripe", () => {
  it("opt-out → cancel_at = fin d'engagement ; double clic idempotent ; emails client+pro ; audit", async () => {
    const termEnd = new Date("2027-01-12T00:00:00.000Z")
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12, renewalMode: "same_term" }, { status: "active", termEndsAt: termEnd })
    const { port, calls } = fakePort()
    const ctx = await sessionFor(s)
    const r1 = await customerRequestRenewalOptOut(db, port, ctx)
    const optOutAt = (await getSub(s.subscriptionId)).renewalOptOutAt
    await customerRequestRenewalOptOut(db, port, ctx)
    expect((await getSub(s.subscriptionId)).renewalOptOutAt?.getTime()).toBe(optOutAt?.getTime())
    expect(r1.provider?.status).toBe("synced")
    const upd = calls.filter((c) => c.method === "updateSubscription")
    expect(upd[0].params?.cancel_at).toBe(Math.floor(termEnd.getTime() / 1000))
    const types = await outboxTypes(s.subscriptionId)
    expect(types.filter((t) => t === "renewal_opt_out_confirmed")).toHaveLength(1)
    expect(types.filter((t) => t === "renewal_opt_out_pro")).toHaveLength(1)
    expect(await auditActions(s.subscriptionId)).toContain("customer_renewal_opt_out_requested")

    // Révocation → cancel_at effacé + email client.
    const rv = await customerRevokeRenewalOptOut(db, port, ctx)
    expect(rv.provider?.status).toBe("synced")
    expect((await getSub(s.subscriptionId)).renewalOptOutAt).toBeNull()
    expect(calls.filter((c) => c.method === "updateSubscription").at(-1)?.params?.cancel_at).toBe("")
    expect(await outboxTypes(s.subscriptionId)).toContain("renewal_opt_out_revoked")
    expect(await auditActions(s.subscriptionId)).toContain("customer_renewal_opt_out_revoked")
  })

  it("arrêt sans engagement : double clic → même cancelAt ; email ; audit", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const { port, calls } = fakePort()
    const ctx = await sessionFor(s)
    const r1 = await customerScheduleCancellation(db, port, ctx)
    const r2 = await customerScheduleCancellation(db, port, ctx)
    expect(new Date(r1.cancelAt).getTime()).toBe(new Date(r2.cancelAt).getTime())
    expect(new Date(r1.cancelAt).toISOString()).toBe("2026-03-12T00:00:00.000Z")
    expect(calls.find((c) => c.method === "updateSubscription")?.params?.cancel_at).toBe(Math.floor(new Date(r1.cancelAt).getTime() / 1000))
    expect((await outboxTypes(s.subscriptionId)).filter((t) => t === "cancellation_scheduled")).toHaveLength(1)
    expect(await auditActions(s.subscriptionId)).toContain("customer_cancellation_scheduled")
  })

  it("Stripe en panne après la mutation DB → décision conservée + pending_retry visible ; retry → synced", async () => {
    const s = await seedSub(A, {}, { status: "active" })
    const fp = fakePort({ failUpdate: true })
    const ctx = await sessionFor(s)
    const r = await customerScheduleCancellation(db, fp.port, ctx)
    expect(r.provider.status).toBe("pending_retry")
    expect((await getSub(s.subscriptionId)).cancelAt).not.toBeNull()
    expect((await loadCustomerPortal(db, ctx))?.providerSyncPending).toBe(true)
    fp.setFail(false)
    const retry = await customerScheduleCancellation(db, fp.port, ctx)
    expect(retry.provider.status).toBe("synced")
    expect((await loadCustomerPortal(db, ctx))?.providerSyncPending).toBe(false)
  })
})

/* ---------------------------- Fin anticipée ---------------------------- */

describe("demande de fin anticipée", () => {
  it("1 pending, double clic → toujours 1, aucun Stripe, contrat intact, email pro, retrait puis nouvelle demande", async () => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12, renewalMode: "same_term" }, { status: "active", termEndsAt: new Date("2027-01-12T00:00:00.000Z") })
    const before = await snapshotRow(s.subscriptionId)
    const ctx = await sessionFor(s)
    await customerRequestEarlyCancellation(db, ctx, { message: "Je déménage <b>" })
    await customerRequestEarlyCancellation(db, ctx, { message: "bis" })
    const rows = await cancellationRequests(s.companyId, s.subscriptionId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("pending")
    expect(await snapshotRow(s.subscriptionId)).toBe(before)
    expect((await outboxTypes(s.subscriptionId)).filter((t) => t === "early_cancellation_requested_pro")).toHaveLength(1)
    expect(await auditActions(s.subscriptionId)).toContain("early_cancellation_requested")
    const view = await loadCustomerPortal(db, ctx)
    expect(view?.pendingEarlyCancellation).not.toBeNull()
    expect(view?.secondaryAction).toBeNull()

    await customerWithdrawEarlyCancellation(db, ctx)
    expect((await cancellationRequests(s.companyId, s.subscriptionId))[0].status).toBe("withdrawn")
    expect(await auditActions(s.subscriptionId)).toContain("early_cancellation_withdrawn")
    await customerRequestEarlyCancellation(db, ctx, {})
    const after = await cancellationRequests(s.companyId, s.subscriptionId)
    expect(after.filter((r) => r.status === "pending")).toHaveLength(1)
    expect(await snapshotRow(s.subscriptionId)).toBe(before)
    // Le service de fin anticipée ne reçoit même pas de port Stripe.
    expect(customerRequestEarlyCancellation.length).toBe(3)
  })
})

describe("corrections finales lot 3", () => {
  it("nettoyage payé + webhook rejoué : aucun second CTA paiement", async () => {
    const s = await seedSub(A, { initialCleaningRequired: true, initialServiceId: A.serviceId })
    const ctx = await sessionFor(s)
    expect((await loadCustomerPortal(db, ctx))?.primaryAction).toEqual({ kind: "checkout", step: "initial_cleaning" })
    const fp = fakePort()
    const checkout = await customerStartCheckout(db, fp.port, ctx, { termsAccepted: true }, { rootDomain: "detailflow.test", allowLocalhost: true })
    const sub = await getSub(s.subscriptionId)
    const evt = { id: uid("evt"), type: "checkout.session.completed", account: sub.providerAccountId!, created: Math.floor(NOW.getTime() / 1000), data: { object: { id: checkout.checkoutSessionId, mode: "payment", payment_status: "paid", payment_intent: uid("pi"), customer: uid("cus"), amount_total: 4900, currency: "eur", metadata: fp.calls[0].params!.metadata } } }
    for (const event of [evt, evt, { ...evt, id: uid("evt") }]) {
      await payments.handleCustomerSubscriptionWebhook(db, fp.port, event)
      expect((await getSub(s.subscriptionId)).status).toBe("pending_initial_cleaning")
      expect(await loadCustomerPortal(db, ctx)).toMatchObject({ initialCleaningPaid: true, primaryAction: null, secondaryAction: null })
    }
    expect(await db.select().from(schema.maintenancePayments).where(eq(schema.maintenancePayments.subscriptionId, s.subscriptionId))).toHaveLength(1)
    expect(read("app/abonnements/gerer/page.tsx")).toContain("Votre nettoyage initial est payé.")
  })

  it.each(["active", "cancel_scheduled", "cancelled", "ended", "expired", "pending_payment", "pending_initial_cleaning", "suspended"])("fin anticipée refusée côté serveur : %s sans engagement", async (status) => {
    const s = await seedSub(A, {}, { status })
    const ctx = await sessionFor(s)
    await expect(customerRequestEarlyCancellation(db, ctx, {})).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_MUTABLE" })
    expect(await cancellationRequests(s.companyId, s.subscriptionId)).toHaveLength(0)
    expect((await loadCustomerPortal(db, ctx))?.secondaryAction).toBeNull()
  })

  it.each(["cancel_scheduled", "pending_payment", "pending_initial_cleaning", "cancelled"])("engagement futur ne contourne pas le statut %s", async (status) => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status, termEndsAt: new Date("2027-01-12") })
    await expect(customerRequestEarlyCancellation(db, await sessionFor(s), {})).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_MUTABLE" })
    expect(await cancellationRequests(s.companyId, s.subscriptionId)).toHaveLength(0)
  })

  it("engagement expiré : arrêt normal disponible, fin anticipée refusée", async () => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 1 }, { status: "active", termEndsAt: new Date("2026-02-12") })
    const ctx = await sessionFor(s)
    expect((await loadCustomerPortal(db, ctx))?.primaryAction?.kind).toBe("schedule_cancellation")
    await expect(customerRequestEarlyCancellation(db, ctx, {})).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_MUTABLE" })
    expect(await cancellationRequests(s.companyId, s.subscriptionId)).toHaveLength(0)
  })

  it("concurrence : deux succès, une demande, un audit, un email échappé sans PII outbox/logs", async () => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const ctx = await sessionFor(s)
    const message = "<script>alert(1)</script>"
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")]
    try {
      const results = await Promise.allSettled([
        customerRequestEarlyCancellation(db, ctx, { message }),
        customerRequestEarlyCancellation(db, ctx, { message }),
      ])
      expect(results.every((r) => r.status === "fulfilled")).toBe(true)
      const values = results.map((r) => r.status === "fulfilled" ? r.value : null)
      expect(values.filter((r) => r?.created)).toHaveLength(1)
      expect(values[0]?.requestId).toBe(values[1]?.requestId)
      const rows = await cancellationRequests(s.companyId, s.subscriptionId)
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe("pending")
      expect((await auditActions(s.subscriptionId)).filter((a) => a === "early_cancellation_requested")).toHaveLength(1)
      const outbox = await db.select().from(schema.maintenanceSubscriptionEmailOutbox).where(eq(schema.maintenanceSubscriptionEmailOutbox.subscriptionId, s.subscriptionId))
      expect(outbox).toHaveLength(1)
      expect(outbox[0].cancellationRequestId).toBe(rows[0].id)
      expect(outbox[0].payload).not.toHaveProperty("customerMessage")
      expect(JSON.stringify(outbox)).not.toContain(message)
      // Drain only this test's email; other fixtures must not require real access secrets.
      await db.update(schema.maintenanceSubscriptionEmailOutbox).set({ status: "skipped" }).where(eq(schema.maintenanceSubscriptionEmailOutbox.status, "pending"))
      await db.update(schema.maintenanceSubscriptionEmailOutbox).set({ status: "pending" }).where(eq(schema.maintenanceSubscriptionEmailOutbox.id, outbox[0].id))
      const send = vi.fn(async () => ({ ok: true, id: "fake-email" }))
      expect(await drainCustomerSubscriptionOutbox(db, send, NOW, { emailsAllowed: true })).toEqual({ sent: 1, failed: 0, skipped: 0 })
      await drainCustomerSubscriptionOutbox(db, send, NOW, { emailsAllowed: true })
      expect(send).toHaveBeenCalledTimes(1)
      const html = (send.mock.calls[0] as unknown as [{ html: string }])[0].html
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
      expect(html).not.toContain("<script>")
      for (const text of ["Jean", "Peugeot 308", "Entretien Premium", "Date de fin contractuelle", "Date de la demande", "Aucune modification automatique"]) expect(html).toContain(text)
      for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(message)
    } finally { logs.forEach((spy) => spy.mockRestore()) }
  })

  it("conflit index pending après prélecture périmée : replay sans 23505 ni doublon", async () => {
    const s = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const ctx = await sessionFor(s)
    const first = await customerRequestEarlyCancellation(db, ctx, {})
    const verified = await resolveCustomerSession(db, ctx)
    const racedDb = new Proxy(db, { get(target, key) {
      if (key !== "transaction") return Reflect.get(target, key)
      return (run: (tx: engine.Executor) => Promise<unknown>) => target.transaction(async (tx) => {
        const original = tx.select.bind(tx)
        const spy = vi.spyOn(tx, "select")
          .mockImplementationOnce(original)
          .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) as never)
        try { return await run(tx as unknown as engine.Executor) } finally { spy.mockRestore() }
      })
    } })
    expect(await engine.requestEarlyCancellationAsCustomer(racedDb, verified!.proof, {}, NOW)).toEqual({ requestId: first.requestId, created: false })
    expect(await cancellationRequests(s.companyId, s.subscriptionId)).toHaveLength(1)
    expect((await auditActions(s.subscriptionId)).filter((a) => a === "early_cancellation_requested")).toHaveLength(1)
    expect((await outboxTypes(s.subscriptionId)).filter((t) => t === "early_cancellation_requested_pro")).toHaveLength(1)
  })

  it("email : cancellationRequestId d'un autre tenant ou contrat n'est jamais rendu", async () => {
    const a = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const b = await seedSub(B, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const other = await seedSub(A, { commitmentUnit: "month", commitmentCount: 12 }, { status: "active", termEndsAt: new Date("2027-01-12") })
    const foreign = await customerRequestEarlyCancellation(db, await sessionFor(b), { message: "secret tenant B" })
    const sameTenant = await customerRequestEarlyCancellation(db, await sessionFor(other), { message: "secret autre contrat" })
    await db.update(schema.maintenanceSubscriptionEmailOutbox).set({ status: "skipped" }).where(eq(schema.maintenanceSubscriptionEmailOutbox.status, "pending"))
    const insert = (id: number) => db.insert(schema.maintenanceSubscriptionEmailOutbox).values({ companyId: A.companyId, subscriptionId: a.subscriptionId, cancellationRequestId: id, type: "early_cancellation_requested_pro", recipientRole: "professional", dedupeKey: uid("mismatch"), sendAt: NOW })
    await expect(insert(foreign.requestId)).rejects.toMatchObject({ cause: { code: "23503" } })
    await insert(sameTenant.requestId)
    const send = vi.fn(async () => ({ ok: true }))
    expect(await drainCustomerSubscriptionOutbox(db, send, NOW, { emailsAllowed: true })).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(send).not.toHaveBeenCalled()
  })

  it("retour absent, invalide, inconnu, autre tenant : unknown et jamais Paiement reçu dans le HTML", async () => {
    const b = await seedSub(B, {}, { status: "active" })
    await pg.query(`UPDATE maintenance_subscriptions SET "externalCheckoutSessionId"='cs_other_tenant' WHERE id=$1`, [b.subscriptionId])
    const { default: Page } = await import("@/app/abonnement-entretien/retour/page")
    for (const session_id of [undefined, "invalid!", "cs_unknown", "cs_other_tenant"]) {
      expect(await readCheckoutReturnState(db, A.companyId, session_id)).toBe("unknown")
      const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ session_id }) }))
      expect(html).not.toContain("Paiement reçu")
      expect(html).toContain("pas pu vérifier ce paiement")
      expect(html).toContain("Rouvrez le lien reçu par email")
    }
    const a = await seedSub(A)
    await pg.query(`UPDATE maintenance_subscriptions SET "externalCheckoutSessionId"='cs_unpaid' WHERE id=$1`, [a.subscriptionId])
    expect(await readCheckoutReturnState(db, A.companyId, "cs_unpaid")).toBe("unknown")
    await db.insert(schema.maintenancePayments).values({ companyId: A.companyId, subscriptionId: a.subscriptionId, type: "recurring", status: "paid", grossAmountCents: 3900, platformFeeBps: 0, platformFeeAmountCents: 0 })
    expect(await readCheckoutReturnState(db, A.companyId, "cs_unpaid")).toBe("processing")
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ session_id: "cs_unpaid" }) }))).toContain("Paiement reçu. Activation en cours…")
    await pg.query(`UPDATE maintenance_subscriptions SET status='active' WHERE id=$1`, [a.subscriptionId])
    expect(await readCheckoutReturnState(db, A.companyId, "cs_unpaid")).toBe("active")
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ session_id: "cs_unpaid" }) }))).toContain("Votre abonnement est actif.")
  })
})

/* ---------------------------- Consentement / Checkout ---------------------------- */

describe("consentement avant Checkout", () => {
  it("termsAccepted=false → aucun Checkout ; termsAcceptedAt/termsVersion navigateur ignorés ; true → consentement serveur", async () => {
    const s = await seedSub(A)
    const ctx = await sessionFor(s)
    const { port, calls } = fakePort()
    await expect(customerStartCheckout(db, port, ctx, { termsAccepted: false })).rejects.toThrow()
    await expect(customerStartCheckout(db, port, ctx, { termsAccepted: "true" })).rejects.toThrow()
    expect(calls.filter((c) => c.method === "createCheckoutSession")).toHaveLength(0)

    const forged = { termsAccepted: true, termsAcceptedAt: "2000-01-01T00:00:00.000Z", termsVersion: "forged-v0", priceCents: 1, returnUrl: "https://evil.example" }
    const r = await customerStartCheckout(db, port, ctx, forged as never, { rootDomain: "detailflow.test", allowLocalhost: true })
    expect(r.clientSecret).toBeTruthy()
    const sub = await getSub(s.subscriptionId)
    expect(sub.termsVersion).not.toBe("forged-v0")
    expect(sub.termsAcceptedAt?.getFullYear()).not.toBe(2000)
    const params = calls.find((c) => c.method === "createCheckoutSession")!.params!
    expect(JSON.stringify(params)).not.toContain("evil.example")
    expect(JSON.stringify(params)).not.toContain('"unit_amount":1,')
  })
})
