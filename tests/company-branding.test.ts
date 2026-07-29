import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { companies } from "@/lib/db/schema"

/**
 * Test ciblé : la personnalisation du site (logo + CGV) est STRICTEMENT scopée
 * à l'entreprise de l'admin connecté. Un admin de l'entreprise A ne peut jamais
 * modifier le logo ou les CGV de l'entreprise B.
 *
 * On mocke `requireCompanyMember` pour simuler l'admin courant (le tenant ne
 * vient jamais du client), et on vérifie en base réelle que seules les lignes
 * de SA société changent.
 */

// État mutable partagé avec le mock (hoisté avant les imports mockés).
const mockState = vi.hoisted(() => ({
  tenant: null as null | { id: number; slug: string; name: string; logoUrl: string | null; cgv: string | null },
}))

vi.mock("@/lib/admin", () => ({
  requireCompanyMember: async () => {
    if (!mockState.tenant) throw new Error("tenant non défini dans le test")
    return { tenant: mockState.tenant }
  },
}))
// Pas de contexte de requête Next en test : no-op.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
// Pas d'appel réseau Blob en test.
vi.mock("@vercel/blob", () => ({
  put: async () => ({ pathname: "company-logo/mock.png" }),
  del: async () => {},
}))

// Import APRÈS les mocks.
const { saveCompanySite } = await import("@/app/admin/(dashboard)/parametres/branding-actions")

const RUN = Boolean(process.env.DATABASE_URL)
const d = RUN ? describe : describe.skip

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const SLUG_A = `test-brand-a-${RUN_ID}`
const SLUG_B = `test-brand-b-${RUN_ID}`

const ctx = {} as { aId: number; bId: number }

beforeAll(async () => {
  if (!RUN) return
  await pool.query("DELETE FROM companies WHERE slug LIKE 'test-brand-%'")
  const [a] = await db
    .insert(companies)
    .values({ name: "A", slug: SLUG_A, status: "ACTIVE", logoUrl: "company-logo/a.png", cgv: "CGV initiales A" })
    .returning({ id: companies.id })
  const [b] = await db
    .insert(companies)
    .values({ name: "B", slug: SLUG_B, status: "ACTIVE", logoUrl: "company-logo/b.png", cgv: "CGV initiales B" })
    .returning({ id: companies.id })
  ctx.aId = a.id
  ctx.bId = b.id
})

afterAll(async () => {
  if (!RUN) return
  if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
  if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
  await pool.end()
})

async function read(id: number) {
  const [row] = await db
    .select({ logoUrl: companies.logoUrl, cgv: companies.cgv })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)
  return row
}

d("Personnalisation du site : isolation par entreprise", () => {
  it("l'admin de A ne modifie QUE les CGV de A, jamais celles de B", async () => {
    mockState.tenant = { id: ctx.aId, slug: SLUG_A, name: "A", logoUrl: "company-logo/a.png", cgv: "CGV initiales A" }

    const fd = new FormData()
    fd.append("cgv", "Nouvelles CGV de A")
    const res = await saveCompanySite(fd)
    expect(res.ok).toBe(true)

    const a = await read(ctx.aId)
    const b = await read(ctx.bId)
    expect(a.cgv).toBe("Nouvelles CGV de A")
    // B totalement intacte.
    expect(b.cgv).toBe("CGV initiales B")
    expect(b.logoUrl).toBe("company-logo/b.png")
  })

  it("retirer le logo de A n'affecte pas le logo de B", async () => {
    mockState.tenant = { id: ctx.aId, slug: SLUG_A, name: "A", logoUrl: "company-logo/a.png", cgv: "Nouvelles CGV de A" }

    const fd = new FormData()
    fd.append("cgv", "Nouvelles CGV de A")
    fd.append("removeLogo", "1")
    const res = await saveCompanySite(fd)
    expect(res.ok).toBe(true)

    const a = await read(ctx.aId)
    const b = await read(ctx.bId)
    expect(a.logoUrl).toBeNull()
    // Le logo de B n'a pas bougé.
    expect(b.logoUrl).toBe("company-logo/b.png")
  })

  it("même en falsifiant un id, l'écriture reste scopée au tenant de la session", async () => {
    // L'admin est authentifié sur A ; aucune entrée client ne porte d'id
    // d'entreprise, donc B ne peut jamais être ciblée.
    mockState.tenant = { id: ctx.aId, slug: SLUG_A, name: "A", logoUrl: null, cgv: "Nouvelles CGV de A" }

    const before = await read(ctx.bId)
    const fd = new FormData()
    // On tente d'injecter des champs parasites : ils sont ignorés par l'action.
    fd.append("companyId", String(ctx.bId))
    fd.append("cgv", "Tentative de modification de B")
    const res = await saveCompanySite(fd)
    expect(res.ok).toBe(true)

    const after = await read(ctx.bId)
    expect(after.cgv).toBe(before.cgv)
    expect(after.cgv).toBe("CGV initiales B")
  })
})
