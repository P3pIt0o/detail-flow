import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { companies, companyMembers, user as userTable } from "@/lib/db/schema"

/**
 * Test CIBLÉ de la résolution du tenant pour l'espace /admin.
 *
 * Régression corrigée : sur le domaine racine / l'aperçu v0 sans `?tenant=`,
 * un utilisateur connecté membre d'une entreprise NON par défaut (ex. company 17
 * « Itinea.trips ») recevait une 404 sur /admin, car le middleware injectait le
 * slug PAR DÉFAUT (`detailflow`) → `getCurrentTenant()` renvoyait l'entreprise 1
 * et le repli sur l'appartenance ne s'exécutait jamais.
 *
 * Le correctif (middleware) n'injecte plus le défaut pour /admin sans tenant
 * explicite : `x-tenant-slug` est vide, donc `resolveRequestTenant()` se rabat
 * sur `getTenantFromMembership()`. Ce test reproduit exactement ce contexte.
 */

// État mutable partagé avec les mocks (hoisté avant l'évaluation des mocks).
const mockState = vi.hoisted(() => ({
  headers: new Headers(),
  session: null as null | { user: { id: string; email: string; name: string } },
}))

// `next/headers` et `@/lib/auth` sont mockés pour simuler une requête /admin
// (les helpers de `@/lib/tenant` lisent l'en-tête x-tenant-slug + la session).
vi.mock("next/headers", () => ({ headers: async () => mockState.headers }))
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mockState.session } },
}))

// Import APRÈS les mocks (vi.mock est hoisté par vitest).
import { resolveRequestTenant, requireCompanyId } from "@/lib/tenant"

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_MEMBER = `test-adm-member-${RUN_ID}` // entreprise de l'utilisateur (analogue de company 17)
const SLUG_OTHER = `test-adm-other-${RUN_ID}` // entreprise explicite tierce
const USER_ID = `test-adm-user-${RUN_ID}`
const USER_EMAIL = `${USER_ID}@example.test`

const ctx = {} as { memberCompanyId: number; otherCompanyId: number }

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-adm-%'")
  await pool.query("DELETE FROM \"user\" WHERE id = $1", [USER_ID])

  const [member] = await db
    .insert(companies)
    .values({ name: SLUG_MEMBER, slug: SLUG_MEMBER, status: "BETA" })
    .returning({ id: companies.id })
  const [other] = await db
    .insert(companies)
    .values({ name: SLUG_OTHER, slug: SLUG_OTHER, status: "ACTIVE" })
    .returning({ id: companies.id })
  ctx.memberCompanyId = member.id
  ctx.otherCompanyId = other.id

  await db.insert(userTable).values({
    id: USER_ID,
    name: "Test Admin",
    email: USER_EMAIL,
    emailVerified: true,
  })
  // L'utilisateur est OWNER de SON entreprise uniquement (pas de l'autre).
  await db
    .insert(companyMembers)
    .values({ companyId: ctx.memberCompanyId, userId: USER_ID, role: "OWNER" })
})

afterAll(async () => {
  if (!RUN) return
  if (ctx.memberCompanyId) await db.delete(companies).where(eq(companies.id, ctx.memberCompanyId))
  if (ctx.otherCompanyId) await db.delete(companies).where(eq(companies.id, ctx.otherCompanyId))
  await db.delete(userTable).where(eq(userTable.id, USER_ID))
  await pool.end()
})

d("Résolution du tenant pour /admin", () => {
  it("un membre accède à /admin via l'appartenance quand aucun tenant explicite (pas de 404)", async () => {
    // Contexte produit par le middleware corrigé sur /admin sans ?tenant= :
    // aucun x-tenant-slug, utilisateur connecté.
    mockState.headers = new Headers({ "x-tenant-kind": "preview" })
    mockState.session = { user: { id: USER_ID, email: USER_EMAIL, name: "Test Admin" } }

    const tenant = await resolveRequestTenant()
    // Non-null => requireCompanyId ne déclenchera PAS notFound() → pas de 404.
    expect(tenant).not.toBeNull()
    expect(tenant?.id).toBe(ctx.memberCompanyId)

    const companyId = await requireCompanyId()
    expect(companyId).toBe(ctx.memberCompanyId)
  })

  it("un tenant explicite (sous-domaine / ?tenant=) reste prioritaire sur l'appartenance", async () => {
    // Le middleware a résolu un slug explicite différent de l'entreprise du membre.
    mockState.headers = new Headers({ "x-tenant-slug": SLUG_OTHER, "x-tenant-kind": "tenant" })
    mockState.session = { user: { id: USER_ID, email: USER_EMAIL, name: "Test Admin" } }

    const tenant = await resolveRequestTenant()
    expect(tenant?.id).toBe(ctx.otherCompanyId)
  })

  it("sans tenant explicite ET sans utilisateur connecté, aucun tenant (le défaut ne fuit pas ici)", async () => {
    mockState.headers = new Headers({ "x-tenant-kind": "preview" })
    mockState.session = null

    const tenant = await resolveRequestTenant()
    expect(tenant).toBeNull()
  })
})
