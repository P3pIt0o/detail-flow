import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { and, eq } from "drizzle-orm"
import { resolveHost } from "@/lib/tenant-shared"
import { withTenant } from "@/lib/tenant-link"

/**
 * Suivi des visites des sites publics tenant (analytics V1).
 *
 * Partie A — tests PURS (toujours exécutés) : isolation par hostname, conservation
 * de `?tenant=` dans les liens/appels, et garanties STRUCTURELLES sur le tracker
 * client, la route /api/track et le layout (site) : companyId jamais envoyé par
 * le navigateur, aucun tracking admin, aucune PII journalisée.
 *
 * Partie B — tests DB (exécutés uniquement si DATABASE_URL est présent, comme
 * `tenant-isolation.test.ts`) : enregistrement réel, déduplication des visiteurs
 * uniques et isolation stricte entre deux entreprises jetables.
 */

const ROOT = "detailflow.fr"
const REPO = process.cwd()
const read = (p: string) => readFileSync(join(REPO, p), "utf8")

/* ----------------------------- Partie A (pure) ---------------------------- */

describe("résolution tenant côté serveur — isolation", () => {
  it("site tenant A → tenant A ; site tenant B → tenant B (jamais confondus)", () => {
    const a = resolveHost("www.detailflow.fr", ROOT, "itinea-detailing")
    const b = resolveHost("www.detailflow.fr", ROOT, "autre-detailing")
    expect(a).toEqual({ kind: "tenant", slug: "itinea-detailing" })
    expect(b).toEqual({ kind: "tenant", slug: "autre-detailing" })
    expect(a).not.toEqual(b)
  })

  it("domaine racine sans ?tenant= → aucune entreprise (pas de visite tenant)", () => {
    expect(resolveHost("detailflow.fr", ROOT)).toEqual({ kind: "root" })
    expect(resolveHost("www.detailflow.fr", ROOT, null)).toEqual({ kind: "root" })
  })

  it("aperçu v0 sans ?tenant= → pas de slug (aucune visite tenant)", () => {
    expect(resolveHost("projet.vusercontent.net", ROOT, null)).toEqual({ kind: "preview", slug: null })
  })
})

describe("conservation de ?tenant= dans les appels sur le domaine principal", () => {
  it("withTenant conserve ?tenant=itinea-detailing", () => {
    expect(withTenant("/api/track", "itinea-detailing")).toBe("/api/track?tenant=itinea-detailing")
  })

  it("le tracker reconduit le ?tenant= courant vers /api/track", () => {
    const src = read("components/site/site-tracker.tsx")
    // Lit le tenant depuis l'URL courante et l'ajoute à l'appel de tracking.
    expect(src).toContain('new URLSearchParams(window.location.search).get("tenant")')
    expect(src).toContain("`/api/track?tenant=${encodeURIComponent(tenant)}`")
  })
})

describe("tracker client — anonymat et absence de companyId", () => {
  const src = read("components/site/site-tracker.tsx")

  it("génère un identifiant visiteur anonyme et stable (localStorage, pas de cookie pub)", () => {
    expect(src).toContain("localStorage.getItem")
    expect(src).toContain("crypto.randomUUID")
    expect(src).not.toContain("document.cookie")
  })

  it("n'envoie jamais de companyId depuis le navigateur", () => {
    // Le corps envoyé ne contient AUCUNE clé companyId (seulement visitorId + event).
    expect(src).not.toMatch(/companyId\s*[:=]/)
    expect(src).toContain("JSON.stringify({ visitorId, event:")
    expect(src).toContain('event: "pageview"')
  })
})

describe("route /api/track — sécurité, observabilité, non-blocage", () => {
  const src = read("app/api/track/route.ts")

  it("résout le tenant CÔTÉ SERVEUR (getCurrentTenant), jamais depuis le corps", () => {
    expect(src).toContain("getCurrentTenant()")
    // Aucun companyId lu depuis le corps de la requête.
    expect(src).not.toMatch(/body\.companyId/)
  })

  it("exclut les bots via un filtre user-agent", () => {
    expect(src).toContain("BOT_RE")
    expect(src).toMatch(/user-agent/i)
  })

  it("reste non bloquant : répond toujours 204 (jamais d'erreur au visiteur)", () => {
    expect(src).toContain("status: 204")
    // Pas d'autre code d'erreur renvoyé au visiteur.
    expect(src).not.toMatch(/status:\s*5\d\d/)
  })

  it("journalise les échecs de façon structurée mais SANS aucune donnée personnelle", () => {
    // Observabilité présente.
    expect(src).toContain("logTrack")
    expect(src).toContain("record_failed")
    expect(src).toContain("tenant_unresolved")
    // Aucune lecture d'IP côté route (jamais de stockage/log d'IP).
    expect(src.toLowerCase()).not.toContain("x-forwarded-for")
    expect(src).not.toMatch(/req\.ip\b/)
    expect(src).not.toMatch(/getClientIp/i)
    // Le user-agent sert au filtre bot mais n'est JAMAIS passé au logger.
    expect(src).not.toMatch(/logTrack\([^)]*\bua\b/)
    // Les appels de log ne transportent que des champs sûrs (step, hasTenant,
    // event, message). Aucun objet requête/headers/body n'est journalisé.
    const logCalls = src.match(/logTrack\([\s\S]*?\)\n/g) ?? []
    expect(logCalls.length).toBeGreaterThan(0)
    for (const call of logCalls) {
      expect(call).not.toMatch(/req\b/)
      expect(call).not.toMatch(/headers/)
      expect(call).not.toMatch(/\bbody\b/)
    }
  })
})

describe("layout (site) — tracking uniquement sur un site tenant, jamais admin", () => {
  it("le tracker n'est monté que lorsqu'un tenant est résolu", () => {
    const src = read("app/(site)/layout.tsx")
    expect(src).toContain("{tenant && <SiteTracker />}")
  })

  it("le layout admin ne monte aucun tracker", () => {
    const src = read("app/admin/(dashboard)/layout.tsx")
    expect(src).not.toContain("SiteTracker")
  })
})

/* ------------------------------ Partie B (DB) ----------------------------- */

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-analytics-a-${RUN_ID}`
const SLUG_B = `test-analytics-b-${RUN_ID}`

type Ctx = { aId: number; bId: number }
const ctx = {} as Ctx

d("enregistrement, déduplication et isolation des visites", () => {
  let db: typeof import("@/lib/db").db
  let pool: typeof import("@/lib/db").pool
  let schema: typeof import("@/lib/db/schema")
  let recordPageView: typeof import("@/lib/analytics/queries").recordPageView
  let getVisitStats: typeof import("@/lib/analytics/queries").getVisitStats

  beforeAll(async () => {
    ;({ db, pool } = await import("@/lib/db"))
    schema = await import("@/lib/db/schema")
    ;({ recordPageView, getVisitStats } = await import("@/lib/analytics/queries"))
    await pool.query("DELETE FROM companies WHERE slug LIKE 'test-analytics-%'")
    const [a] = await db.insert(schema.companies).values({ name: SLUG_A, slug: SLUG_A, status: "ACTIVE" }).returning({ id: schema.companies.id })
    const [b] = await db.insert(schema.companies).values({ name: SLUG_B, slug: SLUG_B, status: "ACTIVE" }).returning({ id: schema.companies.id })
    ctx.aId = a.id
    ctx.bId = b.id
  })

  afterAll(async () => {
    if (ctx.aId) await db.delete(schema.companies).where(eq(schema.companies.id, ctx.aId))
    if (ctx.bId) await db.delete(schema.companies).where(eq(schema.companies.id, ctx.bId))
    await pool.end()
  })

  async function dailyOf(companyId: number) {
    const rows = await db
      .select({ pageViews: schema.tenantAnalyticsDaily.pageViews, uniqueVisitors: schema.tenantAnalyticsDaily.uniqueVisitors })
      .from(schema.tenantAnalyticsDaily)
      .where(eq(schema.tenantAnalyticsDaily.companyId, companyId))
    return rows.reduce((acc, r) => ({ pageViews: acc.pageViews + r.pageViews, uniqueVisitors: acc.uniqueVisitors + r.uniqueVisitors }), {
      pageViews: 0,
      uniqueVisitors: 0,
    })
  }

  it("site tenant A → visite enregistrée pour A, aucune donnée pour B", async () => {
    await recordPageView(ctx.aId, "visitor-a-1")
    const a = await dailyOf(ctx.aId)
    const b = await dailyOf(ctx.bId)
    expect(a.pageViews).toBe(1)
    expect(a.uniqueVisitors).toBe(1)
    expect(b.pageViews).toBe(0)
    expect(b.uniqueVisitors).toBe(0)
  })

  it("deux pages vues du même navigateur (même jour) → 2 vues, 1 visiteur unique", async () => {
    await recordPageView(ctx.aId, "visitor-a-2")
    await recordPageView(ctx.aId, "visitor-a-2")
    const visits = await db
      .select({ id: schema.tenantAnalyticsVisits.id })
      .from(schema.tenantAnalyticsVisits)
      .where(and(eq(schema.tenantAnalyticsVisits.companyId, ctx.aId), eq(schema.tenantAnalyticsVisits.visitorId, "visitor-a-2")))
    // Un seul enregistrement de visiteur unique malgré deux pages vues.
    expect(visits).toHaveLength(1)
  })

  it("un nouveau navigateur crée un nouveau visiteur unique", async () => {
    const before = await dailyOf(ctx.aId)
    await recordPageView(ctx.aId, "visitor-a-3")
    const after = await dailyOf(ctx.aId)
    expect(after.uniqueVisitors).toBe(before.uniqueVisitors + 1)
  })

  it("getVisitStats reste scopé à l'entreprise demandée", async () => {
    const statsA = await getVisitStats(ctx.aId)
    const statsB = await getVisitStats(ctx.bId)
    expect(statsA.pageViews30).toBeGreaterThan(0)
    expect(statsB.pageViews30).toBe(0)
  })
})
