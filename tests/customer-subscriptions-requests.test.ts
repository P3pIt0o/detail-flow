import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import * as schema from "@/lib/db/schema"
import * as engine from "@/lib/customer-subscriptions/engine"
import {
  acceptSubscriptionRequest,
  createPublicSubscriptionRequest,
  expireStaleSubscriptionRequests,
  rejectSubscriptionRequest,
} from "@/lib/customer-subscriptions/requests"
import { pickAllowedRequestFields, runSubmitSubscriptionRequest } from "@/lib/customer-subscriptions/public-request"
import { drainCustomerSubscriptionOutbox, type EmailSender } from "@/lib/customer-subscriptions/notifications"

vi.mock("@vercel/firewall", () => ({ checkRateLimit: async () => ({ rateLimited: false }) }))

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const NOW = new Date("2026-03-05T10:00:00.000Z")
const owner: engine.Actor = { userId: "owner-1", role: "OWNER" }
const sid = (n: string | number) => `submission-${String(n).padStart(12, "0")}`

let pg: PGlite
let db: engine.Executor
let companyA: number
let companyB: number
let serviceA: number
let planActive: number
let planDraft: number
let planPrivate: number
let planArchived: number
let planB: number

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows

const planInput = (serviceId: number, extra: Record<string, unknown> = {}) =>
  ({
    name: "Entretien Premium",
    priceCents: 3900,
    currency: "EUR",
    billingIntervalUnit: "month",
    billingIntervalCount: 1,
    includedUsesPerCycle: 1,
    includedServiceId: serviceId,
    commitmentUnit: "none",
    commitmentCount: 0,
    renewalMode: "open_ended",
    status: "active",
    visibility: "public",
    ...extra,
  }) as never

const validInput = (planId: number, n: string | number, email = `client${n}@example.test`) => ({
  planId,
  customer: { name: `Client ${n}`, email },
  vehicle: { brand: "Peugeot", model: "208" } as never,
  message: "Bonjour",
  submissionId: sid(n),
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return "OK"
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "detailflow.test")
  pg = new PGlite()
  await pg.exec(`
    CREATE TABLE companies (id serial PRIMARY KEY, slug text, status text NOT NULL DEFAULT 'ACTIVE', "licensePlan" text, "stripeAccountId" text, "stripeChargesEnabled" boolean NOT NULL DEFAULT false, "paymentsEnabled" boolean NOT NULL DEFAULT false);
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
  db = drizzle(pg, { schema }) as unknown as engine.Executor

  const company = async (slug: string) =>
    (
      await q<{ id: number }>(
        `INSERT INTO companies (slug,"licensePlan","customerSubscriptionPublicMode","stripeAccountId","stripeChargesEnabled","paymentsEnabled")
         VALUES ($1,'BUSINESS','request',$2,true,true) RETURNING id`,
        [slug, `acct_test_${slug}`],
      )
    )[0].id
  companyA = await company("acme")
  companyB = await company("other")
  await q(`INSERT INTO settings ("companyId","businessName","businessEmail") VALUES ($1,'Acme','pro@acme.test'),($2,'Other','pro@other.test')`, [companyA, companyB])
  serviceA = (await q<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage complet',3000) RETURNING id`, [companyA]))[0].id
  const serviceB = (await q<{ id: number }>(`INSERT INTO services ("companyId",name,"basePriceCents") VALUES ($1,'Lavage',3000) RETURNING id`, [companyB]))[0].id

  planActive = (await engine.createPlan(db, companyA, owner, planInput(serviceA))).planId
  planDraft = (await engine.createPlan(db, companyA, owner, planInput(serviceA, { status: "draft" }))).planId
  planPrivate = (await engine.createPlan(db, companyA, owner, planInput(serviceA, { visibility: "private" }))).planId
  planArchived = (await engine.createPlan(db, companyA, owner, planInput(serviceA))).planId
  await q(`UPDATE maintenance_plans SET status='archived' WHERE id=$1`, [planArchived])
  planB = (await engine.createPlan(db, companyB, owner, planInput(serviceB))).planId
})

describe("demandes publiques — création", () => {
  it("demande valide : request pending, AUCUNE subscription, emails client + pro en outbox", async () => {
    const r = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 1), NOW)
    expect(r.replayed).toBe(false)
    const [row] = await q<{ status: string; convertedSubscriptionId: number | null }>(`SELECT status,"convertedSubscriptionId" FROM maintenance_subscription_requests WHERE id=$1`, [r.requestId])
    expect(row).toEqual({ status: "pending", convertedSubscriptionId: null })
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions WHERE "companyId"=$1`, [companyA]))[0].n).toBe(0)
    const outbox = await q<{ type: string; recipientRole: string; payload: unknown }>(`SELECT type,"recipientRole",payload FROM maintenance_subscription_email_outbox WHERE "requestId"=$1 ORDER BY type`, [r.requestId])
    expect(outbox.map((o) => `${o.type}:${o.recipientRole}`)).toEqual(["request_received:client", "request_received_pro:professional"])
    // Aucune PII dans le payload outbox.
    expect(JSON.stringify(outbox.map((o) => o.payload))).not.toContain("example.test")
  })

  it("rejeu même submissionId => même demande, aucun second email", async () => {
    const a = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 2), NOW)
    const b = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 2), NOW)
    expect(b).toEqual({ requestId: a.requestId, replayed: true })
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscription_email_outbox WHERE "requestId"=$1`, [a.requestId]))[0].n).toBe(2)
  })

  it("double demande (autre submissionId, même email + formule en attente) => rejeu", async () => {
    const a = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 3, "dup@example.test"), NOW)
    const b = await createPublicSubscriptionRequest(db, companyA, { ...validInput(planActive, 4, "dup@example.test") }, NOW)
    expect(b).toEqual({ requestId: a.requestId, replayed: true })
  })

  it("même submissionId avec un autre email => CONFLICT", async () => {
    await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 5), NOW)
    expect(await codeOf(createPublicSubscriptionRequest(db, companyA, validInput(planActive, 5, "x@example.test"), NOW))).toBe("CONFLICT")
  })

  it("cross-tenant / draft / archived / private / inexistante => PLAN_NOT_AVAILABLE (même code)", async () => {
    for (const planId of [planB, planDraft, planArchived, planPrivate, 999999]) {
      expect(await codeOf(createPublicSubscriptionRequest(db, companyA, validInput(planId, `x${planId}`), NOW))).toBe("PLAN_NOT_AVAILABLE")
    }
  })

  it("mode disabled / direct => REQUESTS_DISABLED", async () => {
    for (const mode of ["disabled", "direct"]) {
      await q(`UPDATE companies SET "customerSubscriptionPublicMode"=$1 WHERE id=$2`, [mode, companyB])
      expect(await codeOf(createPublicSubscriptionRequest(db, companyB, validInput(planB, `m-${mode}`), NOW))).toBe("REQUESTS_DISABLED")
    }
    await q(`UPDATE companies SET "customerSubscriptionPublicMode"='request' WHERE id=$1`, [companyB])
  })

  it("validation serveur : submissionId, email, message trop long", async () => {
    expect(await codeOf(createPublicSubscriptionRequest(db, companyA, { ...validInput(planActive, 6), submissionId: "short" }, NOW))).toBe("INVALID_SUBMISSION")
    expect(await codeOf(createPublicSubscriptionRequest(db, companyA, { ...validInput(planActive, 7), customer: { name: "A", email: "nope" } }, NOW))).toBe("INVALID_CUSTOMER")
    expect(await codeOf(createPublicSubscriptionRequest(db, companyA, { ...validInput(planActive, 8), message: "x".repeat(1001) }, NOW))).toBe("INVALID_MESSAGE")
  })

  it("quota par email (3 / 24 h) => RATE_LIMITED", async () => {
    const email = "spam@example.test"
    const plans = [planActive]
    for (let i = 0; i < 3; i++) {
      const r = await createPublicSubscriptionRequest(db, companyA, validInput(plans[0], `spam${i}`, email), NOW)
      await q(`UPDATE maintenance_subscription_requests SET status='rejected' WHERE id=$1`, [r.requestId])
    }
    expect(await codeOf(createPublicSubscriptionRequest(db, companyA, validInput(planActive, "spam3", email), NOW))).toBe("RATE_LIMITED")
  })

  it("action publique : champs interdits ignorés (companyId, priceCents, providerAccountId, status…)", async () => {
    const picked = pickAllowedRequestFields({
      ...validInput(planActive, 9),
      companyId: companyB,
      priceCents: 1,
      currency: "usd",
      providerAccountId: "acct_evil",
      platformFeeBps: 0,
      returnUrl: "https://evil.test",
      status: "accepted",
    })
    expect(Object.keys(picked).sort()).toEqual(["customer", "message", "planId", "submissionId", "vehicle"])
    const res = await runSubmitSubscriptionRequest({ ...validInput(planActive, 10), companyId: companyB, priceCents: 1 }, { db, resolveCompanyId: async () => companyA, checkRateLimit: async () => ({ limited: false }), now: () => NOW })
    expect(res.ok).toBe(true)
    const [row] = await q<{ companyId: number; snap: { priceCents: number } }>(`SELECT "companyId", "planSnapshot" snap FROM maintenance_subscription_requests WHERE "submissionId"=$1`, [sid(10)])
    expect(row.companyId).toBe(companyA)
    expect(row.snap.priceCents).toBe(3900)
  })

  it("action publique : tenant introuvable / rate limit réseau", async () => {
    expect(await runSubmitSubscriptionRequest(validInput(planActive, 11), { db, resolveCompanyId: async () => null, checkRateLimit: async () => ({ limited: false }) })).toEqual({ ok: false, code: "NOT_FOUND" })
    expect(await runSubmitSubscriptionRequest(validInput(planActive, 12), { db, resolveCompanyId: async () => companyA, checkRateLimit: async () => ({ limited: true }) })).toEqual({ ok: false, code: "RATE_LIMITED" })
  })
})

describe("décisions admin", () => {
  it("double clic Accepter (concurrent) => exactement 1 maintenance_subscription, rejeu idempotent", async () => {
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 20), NOW)
    const results = await Promise.allSettled([acceptSubscriptionRequest(db, companyA, owner, requestId, {}, NOW), acceptSubscriptionRequest(db, companyA, owner, requestId, {}, NOW)])
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof acceptSubscriptionRequest>>> => r.status === "fulfilled").map((r) => r.value)
    expect(ok.length).toBeGreaterThanOrEqual(1)
    expect(new Set(ok.map((r) => r.subscriptionId)).size).toBe(1)
    const again = await acceptSubscriptionRequest(db, companyA, owner, requestId, {}, NOW)
    expect(again.replayed).toBe(true)
    expect(again.subscriptionId).toBe(ok[0].subscriptionId)
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions WHERE "companyId"=$1`, [companyA]))[0].n).toBe(1)
    const [req] = await q<{ status: string; convertedSubscriptionId: number }>(`SELECT status,"convertedSubscriptionId" FROM maintenance_subscription_requests WHERE id=$1`, [requestId])
    expect(req).toEqual({ status: "accepted", convertedSubscriptionId: ok[0].subscriptionId })
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscription_email_outbox WHERE "requestId"=$1 AND type='request_accepted'`, [requestId]))[0].n).toBe(1)
    // Aucun Stripe à l'acceptation.
    const [sub] = await q<{ status: string }>(`SELECT status FROM maintenance_subscriptions WHERE id=$1`, [ok[0].subscriptionId])
    expect(sub.status).not.toBe("active")
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_payments WHERE "subscriptionId"=$1`, [ok[0].subscriptionId]))[0].n).toBe(0)
  })

  it("accepter une demande d'un autre tenant => REQUEST_NOT_FOUND", async () => {
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 21), NOW)
    expect(await codeOf(acceptSubscriptionRequest(db, companyB, owner, requestId, {}, NOW))).toBe("REQUEST_NOT_FOUND")
    expect(await codeOf(rejectSubscriptionRequest(db, companyB, owner, requestId, {}, NOW))).toBe("REQUEST_NOT_FOUND")
  })

  it("refus : message client conservé, idempotent, aucune subscription, acceptation ensuite refusée", async () => {
    const before = (await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions`))[0].n
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 22), NOW)
    await rejectSubscriptionRequest(db, companyA, owner, requestId, { customerMessage: "<script>alert(1)</script> Désolé" }, NOW)
    expect((await rejectSubscriptionRequest(db, companyA, owner, requestId, {}, NOW)).replayed).toBe(true)
    expect(await codeOf(acceptSubscriptionRequest(db, companyA, owner, requestId, {}, NOW))).toBe("REQUEST_NOT_PENDING")
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions`))[0].n).toBe(before)
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscription_email_outbox WHERE "requestId"=$1 AND type='request_rejected'`, [requestId]))[0].n).toBe(1)
  })

  it("STAFF ne peut pas décider", async () => {
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 23), NOW)
    expect(await codeOf(acceptSubscriptionRequest(db, companyA, { userId: "s", role: "STAFF" } as unknown as engine.Actor, requestId, {}, NOW))).not.toBe("OK")
  })

  it("snapshots : abonnement A créé à 39 € reste 39 € après passage de la formule à 49 € ; B = 49 €", async () => {
    const { requestId: reqA } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 30), NOW)
    const a = await acceptSubscriptionRequest(db, companyA, owner, reqA, {}, NOW)
    const { requestId: reqB } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 31), NOW)
    await q(`UPDATE maintenance_plans SET "priceCents"=4900 WHERE id=$1`, [planActive])
    await expect(acceptSubscriptionRequest(db, companyA, owner, reqB, {}, NOW)).rejects.toMatchObject({ code: "PLAN_CHANGED_REQUIRES_CONFIRMATION", planChangedSinceRequest: true })
    expect((await q(`SELECT status,"convertedSubscriptionId" FROM maintenance_subscription_requests WHERE id=$1`, [reqB]))[0]).toEqual({ status: "pending", convertedSubscriptionId: null })
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscription_email_outbox WHERE "requestId"=$1 AND type='request_accepted'`, [reqB]))[0].n).toBe(0)
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions WHERE "customerEmail"='client31@example.test'`))[0].n).toBe(0)
    const b = await acceptSubscriptionRequest(db, companyA, owner, reqB, { confirmPlanChange: true }, NOW)
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM maintenance_subscriptions WHERE "customerEmail"='client31@example.test'`))[0].n).toBe(1)
    expect((await q(`SELECT status FROM maintenance_subscription_requests WHERE id=$1`, [reqB]))[0].status).toBe("accepted")
    expect(b.planChangedSinceRequest).toBe(true)
    const rows = await q<{ id: number; p: number }>(`SELECT id,"priceCentsSnapshot" p FROM maintenance_subscriptions WHERE id IN ($1,$2)`, [a.subscriptionId, b.subscriptionId])
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.p]))
    expect(byId[a.subscriptionId]).toBe(3900)
    expect(byId[b.subscriptionId]).toBe(4900)

    // L'email d'acceptation de A rend 39 €, celui de B 49 € (rendu depuis les snapshots du contrat).
    const htmlBySub = new Map<number, string>()
    const capture: EmailSender = async (msg) => {
      const m = msg as unknown as { html: string; subscriptionId?: number }
      htmlBySub.set(htmlBySub.size, m.html)
      return { ok: true, id: `m${htmlBySub.size}` }
    }
    await q(`UPDATE maintenance_subscription_email_outbox SET status='sent' WHERE NOT ("requestId" IN ($1,$2) AND type='request_accepted')`, [reqA, reqB])
    await drainCustomerSubscriptionOutbox(db, capture, NOW, { emailsAllowed: true })
    const all = [...htmlBySub.values()].join("\n---\n")
    expect(all).toContain("39,00")
    expect(all).toContain("49,00")
    const changedEmail = [...htmlBySub.values()].find(html => html.includes("49,00"))!
    expect(changedEmail).toContain("Les conditions de cette formule ont été mises à jour depuis votre demande.")
    expect(changedEmail).not.toContain("39,00")
    expect([...htmlBySub.values()].find(html => html.includes("39,00"))).not.toContain("mises à jour")
    expect(all).toContain("Finaliser mon abonnement")
    expect(all).toContain("Vous pourrez vérifier une dernière fois ces informations avant le paiement.")
    await q(`UPDATE maintenance_plans SET "priceCents"=3900 WHERE id=$1`, [planActive])
  })

  it("expiration : demande pending dépassée => expired, non acceptable", async () => {
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 40), NOW)
    const later = new Date(NOW.getTime() + 31 * 24 * 3600 * 1000)
    expect(await expireStaleSubscriptionRequests(db, later)).toBeGreaterThanOrEqual(1)
    expect(await codeOf(acceptSubscriptionRequest(db, companyA, owner, requestId, {}, later))).toBe("REQUEST_NOT_PENDING")
  })
})

describe("corrections ciblées lot 2", () => {
  it("demande reçue client/pro : ancien prix, modalités, date et HTML échappé depuis le snapshot", async () => {
    await q(`UPDATE maintenance_subscription_email_outbox SET status='sent'`)
    const planId = (await engine.createPlan(db, companyA, owner, planInput(serviceA, { name: 'Formule <script>hostile</script>', initialCleaningRequired: true, initialServiceId: serviceA }))).planId
    await createPublicSubscriptionRequest(db, companyA, validInput(planId, 61), NOW)
    await q(`UPDATE maintenance_plans SET "priceCents"=4900,name='Nouveau nom' WHERE id=$1`, [planId])
    const sent: Parameters<EmailSender>[0][] = []
    await drainCustomerSubscriptionOutbox(db, async msg => { sent.push(msg); return { ok: true } }, NOW, { emailsAllowed: true })
    expect(sent).toHaveLength(2)
    for (const msg of sent) {
      expect(msg.html).toContain("Formule &lt;script&gt;hostile&lt;/script&gt;")
      expect(msg.html).not.toContain("<script>")
      expect(msg.html).toContain("Peugeot 208")
      expect(msg.html).toContain("Lavage complet")
      expect(msg.html).toContain("39,00")
      expect(msg.html).not.toContain("49,00")
      expect(msg.html).toContain("mois")
      expect(msg.html).toContain("1 par période")
      expect(msg.html).toContain("Nettoyage initial")
      expect(msg.html).not.toContain("Nouveau nom")
    }
    const client = sent.find(msg => msg.to === 'client61@example.test')!
    expect(client.html).toContain("Aucun paiement n&#39;a été effectué.")
    expect(client.html).toContain("Votre demande doit d&#39;abord être validée par le professionnel.")
    const pro = sent.find(msg => msg.to === 'pro@acme.test')!
    expect(pro.html).toContain("Client 61")
    expect(pro.html).toContain("Date de demande")
    expect(pro.html).toContain("2026")
    expect(pro.html).not.toContain("href=")
  })

  it.each([
    ["preview", "", false],
    ["preview", "1", true],
    ["production", "", true],
  ])("worker %s opt-in %s : même garde client/pro", async (env, optIn, allowed) => {
    await q(`UPDATE maintenance_subscription_email_outbox SET status='sent'`)
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, `guard-${env}-${optIn || 'off'}`), NOW)
    vi.stubEnv("VERCEL_ENV", env)
    vi.stubEnv("CUSTOMER_SUBSCRIPTIONS_PREVIEW_EMAILS", optIn)
    const send = vi.fn<EmailSender>(async () => ({ ok: true }))
    try {
      await drainCustomerSubscriptionOutbox(db, send, NOW)
      expect(send).toHaveBeenCalledTimes(allowed ? 2 : 0)
      const rows = await q<{ recipientRole: string; status: string; lastErrorCode: string | null }>(`SELECT "recipientRole",status,"lastErrorCode" FROM maintenance_subscription_email_outbox WHERE "requestId"=$1`, [requestId])
      expect(rows.map(r => r.recipientRole).sort()).toEqual(["client", "professional"])
      for (const row of rows) {
        expect(row.status).toBe(allowed ? "sent" : "skipped")
        if (!allowed) expect(row.lastErrorCode).toBe("preview_guard")
      }
    } finally {
      vi.unstubAllEnvs()
      vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "detailflow.test")
    }
  })
})

describe("emails de demande : HTML échappé, destinataire relu depuis la demande", () => {
  it("le message de refus hostile est échappé ; l'email client part vers l'adresse de la demande", async () => {
    await q(`UPDATE maintenance_subscription_email_outbox SET status='sent' WHERE status IN ('pending','failed')`)
    const { requestId } = await createPublicSubscriptionRequest(db, companyA, validInput(planActive, 50, "esc@example.test"), NOW)
    await rejectSubscriptionRequest(db, companyA, owner, requestId, { customerMessage: "<img src=x onerror=alert(1)>" }, NOW)
    const sent: { to: string; html: string }[] = []
    const capture: EmailSender = async (msg) => {
      sent.push(msg as unknown as { to: string; html: string })
      return { ok: true, id: `x${sent.length}` }
    }
    await drainCustomerSubscriptionOutbox(db, capture, NOW, { emailsAllowed: true })
    const rejected = sent.find((s) => s.html.includes("onerror"))!
    expect(rejected).toBeTruthy()
    expect(rejected.html).not.toContain("<img src=x")
    expect(rejected.html).toContain("&lt;img")
    expect(sent.some((s) => s.to === "esc@example.test")).toBe(true)
    expect(sent.some((s) => s.to === "pro@acme.test")).toBe(true)
  })
})
