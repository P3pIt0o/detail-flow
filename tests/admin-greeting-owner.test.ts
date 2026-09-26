import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { companies, companyMembers, user as userTable } from "@/lib/db/schema"

/**
 * Test CIBLÉ du bug d'accueil « Bonjour … ».
 *
 * Régression corrigée : quand un super-admin ouvre l'espace admin d'un tenant
 * client, le message d'accueil affichait le nom de SA session (« Bonjour Roig »)
 * au lieu du propriétaire du tenant consulté.
 *
 * Le correctif expose `getCompanyOwnerName(companyId)` — strictement filtré par
 * `companyId` — utilisé pour l'accueil quand la session n'est pas membre du
 * tenant (accès super-admin). Ce test vérifie la résolution du OWNER par tenant,
 * l'isolation (tenant A ≠ tenant B), et le repli quand le OWNER n'a pas de nom.
 *
 * IMPORTANT : ce helper est PUREMENT un libellé d'affichage. Il ne lit ni la
 * session, ni les rôles, ni les permissions — donc il ne peut pas altérer
 * l'authentification. Les tests d'isolation d'accès restent couverts par
 * `admin-tenant-resolution.test.ts` / `tenant-isolation.test.ts`.
 */

// Import APRÈS d'éventuels mocks (aucun nécessaire ici : DB réelle).
import { getCompanyOwnerName } from "@/lib/admin"

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-greet-a-${RUN_ID}`
const SLUG_B = `test-greet-b-${RUN_ID}`
const SLUG_NONAME = `test-greet-noname-${RUN_ID}`

const OWNER_A = `test-greet-owner-a-${RUN_ID}`
const OWNER_B = `test-greet-owner-b-${RUN_ID}`
const OWNER_NONAME = `test-greet-owner-noname-${RUN_ID}`
const SUPERADMIN = `test-greet-super-${RUN_ID}`

const ctx = {} as { companyA: number; companyB: number; companyNoName: number }

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-greet-%'")
  await pool.query("DELETE FROM \"user\" WHERE id LIKE 'test-greet-%'")

  const [a] = await db
    .insert(companies)
    .values({ name: "S&WASH", slug: SLUG_A, status: "ACTIVE" })
    .returning({ id: companies.id })
  const [b] = await db
    .insert(companies)
    .values({ name: "Arrêt au stand", slug: SLUG_B, status: "ACTIVE" })
    .returning({ id: companies.id })
  const [c] = await db
    .insert(companies)
    .values({ name: "Sans Nom SARL", slug: SLUG_NONAME, status: "ACTIVE" })
    .returning({ id: companies.id })
  ctx.companyA = a.id
  ctx.companyB = b.id
  ctx.companyNoName = c.id

  await db.insert(userTable).values([
    { id: OWNER_A, name: "Alice Martin", email: `${OWNER_A}@example.test`, emailVerified: true },
    { id: OWNER_B, name: "Julien Dupont", email: `${OWNER_B}@example.test`, emailVerified: true },
    // OWNER sans nom exploitable (nom vide) → doit déclencher le repli.
    { id: OWNER_NONAME, name: "", email: `${OWNER_NONAME}@example.test`, emailVerified: true },
    // Super-admin qui consulte : membre d'AUCUN de ces tenants.
    { id: SUPERADMIN, name: "Roig", email: `${SUPERADMIN}@example.test`, emailVerified: true, superAdmin: true },
  ])

  await db.insert(companyMembers).values([
    { companyId: ctx.companyA, userId: OWNER_A, role: "OWNER" },
    { companyId: ctx.companyB, userId: OWNER_B, role: "OWNER" },
    { companyId: ctx.companyNoName, userId: OWNER_NONAME, role: "OWNER" },
  ])
})

afterAll(async () => {
  if (!RUN) return
  for (const id of [ctx.companyA, ctx.companyB, ctx.companyNoName]) {
    if (id) await db.delete(companies).where(eq(companies.id, id))
  }
  for (const id of [OWNER_A, OWNER_B, OWNER_NONAME, SUPERADMIN]) {
    await db.delete(userTable).where(eq(userTable.id, id))
  }
  await pool.end()
})

d("Accueil dashboard — nom du propriétaire du tenant consulté", () => {
  it("tenant A → renvoie le prénom/nom du OWNER de A (jamais le super-admin)", async () => {
    const name = await getCompanyOwnerName(ctx.companyA)
    expect(name).toBe("Alice Martin")
    expect(name).not.toBe("Roig")
  })

  it("tenant B → renvoie le OWNER de B (isolation : ≠ OWNER de A)", async () => {
    const name = await getCompanyOwnerName(ctx.companyB)
    expect(name).toBe("Julien Dupont")
    expect(name).not.toBe("Alice Martin")
    expect(name).not.toBe("Roig")
  })

  it("OWNER sans nom exploitable → null (le repli « Bonjour 👋 » sera utilisé)", async () => {
    const name = await getCompanyOwnerName(ctx.companyNoName)
    expect(name).toBeNull()
  })

  it("entreprise sans OWNER (id inexistant) → null (jamais un OWNER d'un autre tenant)", async () => {
    const name = await getCompanyOwnerName(-1)
    expect(name).toBeNull()
  })
})
