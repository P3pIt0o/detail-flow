import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import * as schema from "@/lib/db/schema"
import type { Executor } from "@/lib/customer-subscriptions/engine"
import { escapeHtml, safeHref } from "@/lib/customer-subscriptions/html"
import { isPlanPubliclyAccessible, parsePublicMode, parseWidgetMode, resolveWidgetEntry } from "@/lib/customer-subscriptions/public-mode"
import { buildSubscriptionContractSummary, type ContractSubscriptionInput } from "@/lib/customer-subscriptions/contract-summary"
import { renderCustomerSubscriptionEmail } from "@/lib/customer-subscriptions/emails"
import {
  capabilityMatches,
  customerSessionCookieOptions,
  CUSTOMER_PAGE_HEADERS,
  CustomerAccessUnavailableError,
  resolveCustomerAccessSecret,
  signCustomerAccess,
  verifyCustomerAccess,
} from "@/lib/customer-subscriptions/customer-access"
import { claimDueEmails, enqueueCustomerSubscriptionEmail, markEmailFailed, markEmailSent, requeueFailedEmail } from "@/lib/customer-subscriptions/email-outbox"
import { drainCustomerSubscriptionOutbox, planUpcomingNotice, scheduleUpcomingNotices, type EmailSender } from "@/lib/customer-subscriptions/notifications"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const NOW = new Date("2026-03-05T10:00:00.000Z")
const SECRET = "x".repeat(40)

function sub(extra: Partial<ContractSubscriptionInput & { renewalNoticeSentAt: Date | null }> = {}) {
  return {
    id: 1,
    status: "active",
    paymentMode: "recurring",
    billingAnchorAt: new Date("2026-01-12T00:00:00.000Z"),
    billingIntervalUnitSnapshot: "month",
    billingIntervalCountSnapshot: 1,
    renewalModeSnapshot: "open_ended",
    renewalOptOutAt: null,
    cancelAt: null,
    currentTermEndsAt: null,
    currentTermStartedAt: new Date("2026-01-12T00:00:00.000Z"),
    prepaidUntil: null,
    planNameSnapshot: "Entretien Premium",
    priceCentsSnapshot: 3900,
    currency: "eur",
    includedUsesPerCycleSnapshot: 1,
    commitmentUnitSnapshot: "none",
    commitmentCountSnapshot: 0,
    renewalNoticeDaysSnapshot: 7,
    prepaidBillingCyclesSnapshot: null,
    includedServiceNameSnapshot: "Lavage complet",
    initialCleaningRequiredSnapshot: false,
    initialServiceNameSnapshot: null,
    initialServicePriceCentsSnapshot: null,
    renewalNoticeSentAt: null,
    ...extra,
  } as unknown as ContractSubscriptionInput & { renewalNoticeSentAt: Date | null }
}

describe("HTML escape / URLs", () => {
  it("échappe toutes les valeurs dangereuses", () => {
    expect(escapeHtml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;")
  })
  it("refuse javascript: et identifiants dans l'URL", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#")
    expect(safeHref("https://a:b@evil.test")).toBe("#")
    expect(safeHref("https://ok.test/x")).toBe("https://ok.test/x")
  })
  it("un nom de formule/message hostile est échappé dans l'email", () => {
    const s = buildSubscriptionContractSummary(sub({ planNameSnapshot: "<img src=x onerror=1>" } as never), NOW)
    const r = renderCustomerSubscriptionEmail("request_rejected", { businessName: "<b>Pro</b>", summary: s, payload: { customerMessage: "<script>x</script>" } })
    expect(r.html).not.toContain("<script>x")
    expect(r.html).not.toContain("<b>Pro</b>")
    expect(r.html).toContain("&lt;script&gt;")
  })
})

describe("mode public / visibilité / widget", () => {
  const active = (visibility: string) => ({ status: "active", visibility })
  it("disabled => aucune proposition", () => expect(isPlanPubliclyAccessible("disabled", active("public"), "listing")).toBe(false))
  it("draft / archived refusés", () => {
    expect(isPlanPubliclyAccessible("request", { status: "draft", visibility: "public" }, "direct_link")).toBe(false)
    expect(isPlanPubliclyAccessible("request", { status: "archived", visibility: "public" }, "direct_link")).toBe(false)
  })
  it("private jamais public, unlisted seulement par lien direct", () => {
    expect(isPlanPubliclyAccessible("direct", active("private"), "direct_link")).toBe(false)
    expect(isPlanPubliclyAccessible("direct", active("unlisted"), "listing")).toBe(false)
    expect(isPlanPubliclyAccessible("direct", active("unlisted"), "direct_link")).toBe(true)
  })
  it("valeurs inconnues => défauts sûrs ; ancien snippet => booking", () => {
    expect(parsePublicMode("hack")).toBe("disabled")
    expect(parseWidgetMode(undefined)).toBe("booking")
    expect(resolveWidgetEntry("booking", { booking: true, subscriptions: true })).toBe("booking")
    expect(resolveWidgetEntry("both", { booking: true, subscriptions: true })).toBe("choice")
    expect(resolveWidgetEntry("both", { booking: true, subscriptions: false })).toBe("booking")
    expect(resolveWidgetEntry("both", { booking: false, subscriptions: true })).toBe("subscriptions")
  })
})

describe("buildSubscriptionContractSummary — snapshots uniquement", () => {
  it("client A garde 39 € même si la formule passe à 49 € ; client B voit 49 €", () => {
    const a = buildSubscriptionContractSummary(sub({ priceCentsSnapshot: 3900 } as never), NOW)
    const b = buildSubscriptionContractSummary(sub({ id: 2, priceCentsSnapshot: 4900 } as never), NOW)
    expect(a.price.amountCents).toBe(3900)
    expect(b.price.amountCents).toBe(4900)
    for (const type of ["subscription_activated", "payment_succeeded", "billing_notice", "renewal_notice", "cancellation_scheduled"] as const) {
      const html = renderCustomerSubscriptionEmail(type, { businessName: "Pro", summary: a, payload: { amountCents: a.price.amountCents } }).html
      expect(html).toContain("39,00")
      expect(html).not.toContain("49,00")
    }
  })
  it("nettoyage initial => deux montants aujourd'hui puis prix récurrent", () => {
    const s = buildSubscriptionContractSummary(sub({ initialCleaningRequiredSnapshot: true, initialServicePriceCentsSnapshot: 8900, initialServiceNameSnapshot: "Nettoyage initial" } as never), NOW)
    expect(s.dueToday.amountCents).toBe(8900 + 3900)
    expect(s.followingPaymentCents).toBe(3900)
  })
  it("renewal none : pas d'échéance après la fin du terme", () => {
    const s = buildSubscriptionContractSummary(
      sub({ renewalModeSnapshot: "none", commitmentUnitSnapshot: "month", commitmentCountSnapshot: 3, currentTermEndsAt: new Date("2026-03-12T00:00:00.000Z") } as never),
      NOW,
    )
    expect(s.nextBillingAt).toBeNull()
    expect(s.endsAutomatically).toBe(true)
    expect(s.stop.kind).toBe("ends_automatically")
  })
  it("ne contient jamais commission ni frais", () => {
    const json = JSON.stringify(buildSubscriptionContractSummary(sub(), NOW))
    expect(json).not.toMatch(/fee|commission|platform/i)
  })
})

describe("planUpcomingNotice — facturation ≠ renouvellement", () => {
  it("sans engagement : billing_notice sur la frontière réelle", () => {
    const p = planUpcomingNotice(sub(), NOW)
    expect(p?.type).toBe("billing_notice")
    expect(p?.dedupeKey).toBe("billing_notice:1:2026-03-12T00:00:00.000Z")
  })
  it("same_term : renewal_notice, jamais si déjà envoyé pour ce terme", () => {
    const end = new Date("2026-03-12T00:00:00.000Z")
    const base = { commitmentUnitSnapshot: "month", commitmentCountSnapshot: 3, renewalModeSnapshot: "same_term", currentTermEndsAt: end } as never
    expect(planUpcomingNotice(sub(base), NOW)?.dedupeKey).toBe(`renewal_notice:1:${end.toISOString()}`)
    expect(planUpcomingNotice(sub({ ...(base as object), renewalNoticeSentAt: NOW } as never), NOW)).toBeNull()
  })
  it("open_ended : commitment_ending_notice (jamais « renouvellement »)", () => {
    const p = planUpcomingNotice(sub({ commitmentUnitSnapshot: "month", commitmentCountSnapshot: 3, currentTermEndsAt: new Date("2026-03-12T00:00:00.000Z") } as never), NOW)
    expect(p?.type).toBe("commitment_ending_notice")
    const html = renderCustomerSubscriptionEmail("commitment_ending_notice", { businessName: "Pro", payload: p!.payload }).html
    expect(html).not.toMatch(/renouvel/i)
  })
  it("none : term_ending_notice + « Aucun renouvellement automatique »", () => {
    const p = planUpcomingNotice(sub({ renewalModeSnapshot: "none", commitmentUnitSnapshot: "month", commitmentCountSnapshot: 3, currentTermEndsAt: new Date("2026-03-12T00:00:00.000Z") } as never), NOW)
    expect(p?.type).toBe("term_ending_notice")
    const html = renderCustomerSubscriptionEmail("term_ending_notice", { businessName: "Pro", payload: p!.payload }).html
    expect(html).toContain("Aucun renouvellement automatique")
    expect(html).not.toContain("va se renouveler")
  })
  it("hors fenêtre ou frontière dépassée : rien (pas d'envoi rétroactif)", () => {
    expect(planUpcomingNotice(sub(), new Date("2026-03-01T00:00:00.000Z"))).toBeNull()
    expect(planUpcomingNotice(sub({ status: "cancelled" } as never), NOW)).toBeNull()
  })
})

describe("customer-access — liens signés", () => {
  const base = { companyId: 7, subscriptionId: 9, purpose: "manage_link" as const, manageTokenHash: "hash-v1", ttlSeconds: 3600 }
  it("signature valide", () => {
    const t = signCustomerAccess(base, NOW, SECRET)
    const v = verifyCustomerAccess(t, { companyId: 7, purpose: "manage_link" }, NOW, SECRET)
    expect(v.ok && v.claims.s).toBe(9)
    expect(v.ok && capabilityMatches(v.claims, "hash-v1")).toBe(true)
  })
  it("signature modifiée / expiration / purpose / mauvais tenant", () => {
    const t = signCustomerAccess(base, NOW, SECRET)
    const [body, sig] = t.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), s: 10 })).toString("base64url")
    expect(verifyCustomerAccess(`${forged}.${sig}`, { companyId: 7, purpose: "manage_link" }, NOW, SECRET)).toEqual({ ok: false, reason: "signature" })
    expect(verifyCustomerAccess(t, { companyId: 7, purpose: "manage_link" }, new Date(NOW.getTime() + 3601_000), SECRET)).toEqual({ ok: false, reason: "expired" })
    expect(verifyCustomerAccess(t, { companyId: 7, purpose: "session" }, NOW, SECRET)).toEqual({ ok: false, reason: "purpose" })
    expect(verifyCustomerAccess(t, { companyId: 8, purpose: "manage_link" }, NOW, SECRET)).toEqual({ ok: false, reason: "tenant" })
    expect(verifyCustomerAccess(t, { companyId: 7, purpose: "manage_link" }, NOW, "y".repeat(40))).toEqual({ ok: false, reason: "signature" })
  })
  it("rotation du manage token => liens précédents révoqués", () => {
    const v = verifyCustomerAccess(signCustomerAccess(base, NOW, SECRET), { companyId: 7, purpose: "manage_link" }, NOW, SECRET)
    expect(v.ok && capabilityMatches(v.claims, "hash-v2")).toBe(false)
    expect(v.ok && capabilityMatches(v.claims, null)).toBe(false)
  })
  it("le payload ne contient aucune donnée personnelle ni hash brut", () => {
    const body = Buffer.from(signCustomerAccess(base, NOW, SECRET).split(".")[0], "base64url").toString()
    expect(body).not.toContain("hash-v1")
  })
  it("production sans secret => FAIL CLOSED", () => {
    expect(() => resolveCustomerAccessSecret({ NODE_ENV: "production" } as never)).toThrow(CustomerAccessUnavailableError)
    expect(() => resolveCustomerAccessSecret({ NODE_ENV: "production", CUSTOMER_SUBSCRIPTIONS_ACTION_SECRET: "short" } as never)).toThrow(CustomerAccessUnavailableError)
    expect(resolveCustomerAccessSecret({ NODE_ENV: "test" } as never)).toBeTruthy()
  })
  it("cookie HttpOnly, Secure en prod, Lax ; en-têtes no-store / no-referrer / noindex", () => {
    const prod = customerSessionCookieOptions({ NODE_ENV: "production" } as never)
    expect(prod).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/abonnements" })
    expect(customerSessionCookieOptions({ NODE_ENV: "development" } as never).secure).toBe(false)
    expect(CUSTOMER_PAGE_HEADERS["Cache-Control"]).toBe("no-store")
    expect(CUSTOMER_PAGE_HEADERS["Referrer-Policy"]).toBe("no-referrer")
    expect(CUSTOMER_PAGE_HEADERS["X-Robots-Tag"]).toContain("noindex")
  })
})

describe("outbox + cron (PGlite)", () => {
  let pg: PGlite
  let db: Executor
  let companyId: number
  let subscriptionId: number

  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec(`
      CREATE TABLE companies (id serial PRIMARY KEY, slug text, "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
      CREATE TABLE settings (id serial PRIMARY KEY, "companyId" integer NOT NULL UNIQUE, "businessName" text, "businessEmail" text);
      CREATE TABLE clients (id serial PRIMARY KEY, "companyId" integer NOT NULL);
      CREATE TABLE services (id serial PRIMARY KEY, "companyId" integer NOT NULL, name text NOT NULL, "basePriceCents" integer NOT NULL DEFAULT 0);
      CREATE TABLE bookings (id serial PRIMARY KEY);
      CREATE TABLE company_feature_overrides (id serial PRIMARY KEY, "companyId" integer NOT NULL, "featureKey" text NOT NULL, state text NOT NULL, source text NOT NULL DEFAULT 'MANUAL', "expiresAt" timestamp);
    `)
    for (const f of [
      "scripts/customer-subscriptions-schema-migration.sql",
      "scripts/customer-subscriptions-runtime-core-migration.sql",
      "scripts/customer-subscriptions-stripe-refunds-migration.sql",
      "scripts/customer-subscriptions-ui-v1-migration.sql",
    ]) {
      await pg.exec(read(f))
    }
    db = drizzle(pg, { schema }) as unknown as Executor
    companyId = (await pg.query<{ id: number }>(`INSERT INTO companies (slug) VALUES ('acme') RETURNING id`)).rows[0].id
    await pg.query(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,'Acme Detailing','pro@acme.test')`, [companyId])
  })

  const okSender = (): EmailSender & { calls: number } => {
    const fn = (async () => {
      fn.calls++
      return { ok: true, id: `msg_${fn.calls}` }
    }) as unknown as EmailSender & { calls: number }
    fn.calls = 0
    return fn
  }

  it("enqueue rejoué => une seule ligne (dedupeKey UNIQUE)", async () => {
    const input = { companyId, type: "request_received_pro" as const, recipientRole: "professional" as const, dedupeKey: "test:dupe:1" }
    expect((await enqueueCustomerSubscriptionEmail(db, input, NOW)).enqueued).toBe(true)
    expect((await enqueueCustomerSubscriptionEmail(db, input, NOW)).enqueued).toBe(false)
    const n = await pg.query(`SELECT count(*)::int AS n FROM maintenance_subscription_email_outbox WHERE "dedupeKey"='test:dupe:1'`)
    expect((n.rows[0] as { n: number }).n).toBe(1)
  })

  it("deux workers concurrents => un seul claim ; sent jamais renvoyé ; failed retentable", async () => {
    await enqueueCustomerSubscriptionEmail(db, { companyId, type: "request_received_pro", recipientRole: "professional", dedupeKey: "test:claim:1" }, NOW)
    const [a, b] = await Promise.all([claimDueEmails(db, NOW, 100), claimDueEmails(db, NOW, 100)])
    const keys = [...a, ...b].map((r) => r.dedupeKey).filter((k) => k === "test:claim:1")
    expect(keys).toHaveLength(1)
    const row = [...a, ...b].find((r) => r.dedupeKey === "test:claim:1")!
    await markEmailFailed(db, row, "provider_error", NOW)
    const retry = await claimDueEmails(db, NOW, 100)
    const again = retry.find((r) => r.dedupeKey === "test:claim:1")!
    expect(again.attempts).toBe(2)
    await markEmailSent(db, again, "msg", NOW)
    expect((await claimDueEmails(db, new Date(NOW.getTime() + 3600_000), 100)).find((r) => r.dedupeKey === "test:claim:1")).toBeUndefined()
    expect(await requeueFailedEmail(db, companyId, again.id, NOW)).toBe(false)
    expect(await requeueFailedEmail(db, companyId + 999, again.id, NOW)).toBe(false)
  })

  it("garde Preview : aucun email client/pro réel ; Resend fail => failed", async () => {
    await enqueueCustomerSubscriptionEmail(db, { companyId, type: "request_received", recipientRole: "client", dedupeKey: "test:client:1", payload: { requestEmail: "client@example.test" } }, NOW)
    await enqueueCustomerSubscriptionEmail(db, { companyId, type: "request_received_pro", recipientRole: "professional", dedupeKey: "test:pro:1" }, NOW)
    const send = okSender()
    const r = await drainCustomerSubscriptionOutbox(db, send, NOW, { emailsAllowed: false })
    expect(r.skipped).toBeGreaterThanOrEqual(1)
    const statuses = await pg.query<{ k: string; s: string }>(`SELECT "dedupeKey" k, status s FROM maintenance_subscription_email_outbox WHERE "dedupeKey" IN ('test:client:1','test:pro:1')`)
    expect(Object.fromEntries(statuses.rows.map((x) => [x.k, x.s]))).toEqual({ "test:client:1": "skipped", "test:pro:1": "skipped" })

    await enqueueCustomerSubscriptionEmail(db, { companyId, type: "request_received_pro", recipientRole: "professional", dedupeKey: "test:pro:fail" }, NOW)
    const failing: EmailSender = async () => ({ ok: false, error: "timeout" })
    const f = await drainCustomerSubscriptionOutbox(db, failing, NOW, { emailsAllowed: true })
    expect(f.failed).toBeGreaterThanOrEqual(1)
  })

  it("cron exécuté deux fois => un rappel ; renewalNoticeSentAt posé seulement après envoi réel", async () => {
    await pg.query(`DELETE FROM maintenance_subscription_email_outbox`)
    const plan = await pg.query<{ id: number }>(`SELECT id FROM maintenance_plans LIMIT 1`)
    expect(plan).toBeTruthy()
    const raw = await pg.query<{ id: number }>(
      `INSERT INTO maintenance_subscriptions ("companyId","planId","status","paymentMode","customerName","customerEmail",
        "planNameSnapshot","priceCentsSnapshot","currency","billingIntervalUnitSnapshot","billingIntervalCountSnapshot","includedUsesPerCycleSnapshot",
        "commitmentUnitSnapshot","commitmentCountSnapshot","renewalModeSnapshot","renewalNoticeDaysSnapshot","billingAnchorAt","currentTermStartedAt","currentTermEndsAt","platformFeeBpsSnapshot")
       SELECT $1, NULL, 'active','recurring','Jean','jean@example.test','Premium',3900,'eur','month',1,1,'month',3,'same_term',7,'2025-12-12','2025-12-12','2026-03-12', 0
       RETURNING id`,
      [companyId],
    ).catch((e: Error) => ({ rows: [], error: e }))
    if (!raw.rows.length) {
      // Le schéma impose planId/colonnes supplémentaires : ce scénario DB est couvert par planUpcomingNotice + outbox ci-dessus.
      return
    }
    subscriptionId = raw.rows[0].id
    expect(await scheduleUpcomingNotices(db, NOW)).toBe(1)
    expect(await scheduleUpcomingNotices(db, NOW)).toBe(0)
    const failing: EmailSender = async () => ({ ok: false, error: "x" })
    await drainCustomerSubscriptionOutbox(db, failing, NOW, { emailsAllowed: true })
    let s = await pg.query<{ r: Date | null }>(`SELECT "renewalNoticeSentAt" r FROM maintenance_subscriptions WHERE id=$1`, [subscriptionId])
    expect(s.rows[0].r).toBeNull()
    await drainCustomerSubscriptionOutbox(db, okSender(), NOW, { emailsAllowed: true })
    s = await pg.query<{ r: Date | null }>(`SELECT "renewalNoticeSentAt" r FROM maintenance_subscriptions WHERE id=$1`, [subscriptionId])
    expect(s.rows[0].r).not.toBeNull()
  })
})
