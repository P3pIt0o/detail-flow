import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { and, eq } from "drizzle-orm"

/**
 * Tests d'INTÉGRATION (base réelle) des pièces jointes de demandes de devis.
 *
 * Couvre les invariants de sécurité qui ne peuvent pas être prouvés sans DB :
 * association vérifiée, isolation multi-tenant stricte, idempotence, quota, et
 * lecture scopée entreprise (13, 14, 16 de la spec).
 *
 * Le Blob est mocké (aucun réseau) : `get` renvoie une signature JPEG valide et
 * une taille raisonnable, `del` compte les suppressions. La suite ne s'exécute
 * QUE si (a) DATABASE_URL est défini ET (b) la table quote_request_attachments
 * existe déjà (migration appliquée) — jamais de migration jouée par le test.
 */

// --- Mock Blob : get renvoie un flux JPEG minimal + une taille ; del compte. ---
const delMock = vi.fn(async () => {})
function jpegStream() {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1])
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}
vi.mock("@vercel/blob", () => ({
  del: (...a: unknown[]) => delMock(...(a as [])),
  get: vi.fn(async () => ({
    statusCode: 200,
    blob: { size: 120_000 },
    stream: jpegStream(),
  })),
  list: vi.fn(async () => ({ blobs: [], hasMore: false, cursor: undefined })),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { db, pool } from "@/lib/db"
import { companies, customRequests, quoteRequestAttachments } from "@/lib/db/schema"
import {
  associateAttachment,
  listAttachments,
  getAttachmentForCompany,
  deleteRequestAttachments,
} from "@/lib/quote-photos/server"

// N'exécute la suite que si la table existe déjà (migration appliquée) : jamais
// de migration jouée par le test. Décision prise dans beforeAll.
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const ctx = {} as { aId: number; bId: number; reqA: number; reqB: number; ready: boolean }

function grantFor(companyId: number, requestId: number, maxPhotos = 10) {
  return { companyId, requestId, maxPhotos, exp: Date.now() + 60_000 }
}

const d = process.env.DATABASE_URL ? describe : describe.skip

/** Court-circuite un test si la table n'est pas encore migrée (ctx.ready). */
function ready(): boolean {
  return ctx.ready === true
}

d("pièces jointes — intégration DB + isolation tenant", () => {
  beforeAll(async () => {
    // Table présente ? Sinon on marque non-prêt et chaque test se court-circuite.
    try {
      await db.select().from(quoteRequestAttachments).limit(1)
      ctx.ready = true
    } catch {
      ctx.ready = false
      console.log("[v0] quote-photos-db: table absente (migration non appliquée) → suite ignorée")
      return
    }
    const [a] = await db
      .insert(companies)
      .values({ name: `qpa-a-${RUN_ID}`, slug: `qpa-a-${RUN_ID}`, status: "ACTIVE" })
      .returning({ id: companies.id })
    const [b] = await db
      .insert(companies)
      .values({ name: `qpa-b-${RUN_ID}`, slug: `qpa-b-${RUN_ID}`, status: "ACTIVE" })
      .returning({ id: companies.id })
    ctx.aId = a.id
    ctx.bId = b.id
    const [ra] = await db
      .insert(customRequests)
      .values({ companyId: a.id, token: `tok-a-${RUN_ID}`, typeKey: "std", typeLabel: "Std", customerName: "A", customerEmail: "a@a.fr", customerPhone: "1", description: "x".repeat(12), status: "new" })
      .returning({ id: customRequests.id })
    const [rb] = await db
      .insert(customRequests)
      .values({ companyId: b.id, token: `tok-b-${RUN_ID}`, typeKey: "std", typeLabel: "Std", customerName: "B", customerEmail: "b@b.fr", customerPhone: "2", description: "y".repeat(12), status: "new" })
      .returning({ id: customRequests.id })
    ctx.reqA = ra.id
    ctx.reqB = rb.id
  })

  afterAll(async () => {
    if (ctx.aId) await db.delete(companies).where(eq(companies.id, ctx.aId))
    if (ctx.bId) await db.delete(companies).where(eq(companies.id, ctx.bId))
    await pool.end().catch(() => {})
  })

  it("(2) associe une photo valide sous le bon préfixe", async () => {
    if (!ready()) return
    const path = `quote-requests/${ctx.aId}/${ctx.reqA}/photo1.jpg`
    const res = await associateAttachment({ grant: grantFor(ctx.aId, ctx.reqA), pathname: path, originalName: "IMG_1.jpg", sortOrder: 0 })
    expect(res.ok).toBe(true)
    const rows = await listAttachments(ctx.reqA, ctx.aId)
    expect(rows).toHaveLength(1)
    expect(rows[0].contentType).toBe("image/jpeg") // signature réelle, pas l'annonce
  })

  it("(13) ré-association du même Blob est idempotente (pas de doublon)", async () => {
    if (!ready()) return
    const path = `quote-requests/${ctx.aId}/${ctx.reqA}/photo1.jpg`
    const res = await associateAttachment({ grant: grantFor(ctx.aId, ctx.reqA), pathname: path, originalName: "IMG_1.jpg", sortOrder: 0 })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.alreadyAssociated).toBe(true)
    expect(await listAttachments(ctx.reqA, ctx.aId)).toHaveLength(1)
  })

  it("(14) refuse un pathname hors du préfixe autorisé (autre tenant)", async () => {
    if (!ready()) return
    // Grant de A mais chemin pointant vers l'espace de B.
    const path = `quote-requests/${ctx.bId}/${ctx.reqB}/steal.jpg`
    const res = await associateAttachment({ grant: grantFor(ctx.aId, ctx.reqA), pathname: path, originalName: "x.jpg", sortOrder: 0 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("forbidden")
    expect(delMock).toHaveBeenCalled() // Blob invalide supprimé
  })

  it("(14) une demande d'un autre tenant est introuvable via un grant forgé", async () => {
    if (!ready()) return
    // Grant prétendant que reqB appartient à A : la demande n'existe pas pour A.
    const path = `quote-requests/${ctx.aId}/${ctx.reqB}/x.jpg`
    const res = await associateAttachment({ grant: grantFor(ctx.aId, ctx.reqB), pathname: path, originalName: "x.jpg", sortOrder: 0 })
    expect(res.ok).toBe(false)
  })

  it("(16) getAttachmentForCompany refuse la lecture par un autre tenant", async () => {
    if (!ready()) return
    const rows = await listAttachments(ctx.reqA, ctx.aId)
    const id = rows[0].id
    expect(await getAttachmentForCompany(id, ctx.aId)).not.toBeNull()
    expect(await getAttachmentForCompany(id, ctx.bId)).toBeNull() // tenant B : refusé
  })

  it("(8) respecte le quota du grant (maxPhotos)", async () => {
    if (!ready()) return
    const res = await associateAttachment({
      grant: grantFor(ctx.aId, ctx.reqA, 1), // déjà 1 associée
      pathname: `quote-requests/${ctx.aId}/${ctx.reqA}/photo2.jpg`,
      originalName: "IMG_2.jpg",
      sortOrder: 1,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("limit")
  })

  it("(17) deleteRequestAttachments supprime lignes + Blobs (scopé entreprise)", async () => {
    if (!ready()) return
    delMock.mockClear()
    const n = await deleteRequestAttachments(ctx.reqA, ctx.aId)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(delMock).toHaveBeenCalled()
    expect(await listAttachments(ctx.reqA, ctx.aId)).toHaveLength(0)
  })
})
