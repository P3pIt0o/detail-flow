import "server-only"

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { del, get, list } from "@vercel/blob"
import { db } from "@/lib/db"
import { customRequests, quoteRequestAttachments } from "@/lib/db/schema"
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, sanitizeOriginalName } from "./config"
import { blobPrefix, type QuotePhotoGrant } from "./grant"
import { sniffImageMime } from "./magic"

/** Racine commune de tous les Blobs de photos de demandes de devis. */
const QUOTE_BLOB_ROOT = "quote-requests/"

export type AttachmentRow = typeof quoteRequestAttachments.$inferSelect

export type AssociateResult =
  | { ok: true; attachmentId: number; alreadyAssociated: boolean }
  | { ok: false; error: string; code: "invalid" | "not_found" | "limit" | "too_large" | "forbidden" }

/**
 * Lit la taille + les premiers octets d'un Blob privé en UN SEUL appel `get`
 * (pour la validation de taille et de signature). Renvoie null si absent.
 */
async function readBlobMeta(
  pathname: string,
  bytes = 32,
): Promise<{ size: number; head: Uint8Array | null } | null> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200) return null
  const size = result.blob.size
  const reader = result.stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < bytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  if (!chunks.length) return { size, head: null }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return { size, head: merged.subarray(0, bytes) }
}

/** Supprime un Blob sans jamais lever (best-effort, observable). */
async function safeDelete(pathname: string): Promise<void> {
  try {
    await del(pathname)
  } catch (e) {
    console.log("[v0] quote-photos: échec suppression Blob", pathname, e instanceof Error ? e.message : e)
  }
}

/**
 * Associe un Blob déjà téléversé à une demande, APRÈS vérifications serveur
 * exhaustives (le grant a déjà été vérifié par l'appelant). Idempotent : ré-
 * associer le même pathname renvoie la ligne existante sans doublon.
 *
 * Vérifie : préfixe autorisé, existence de la demande ET cohérence
 * company/demande, existence réelle du Blob, taille, quota, et SIGNATURE réelle
 * du fichier (magic bytes). Tout Blob invalide est immédiatement supprimé.
 */
export async function associateAttachment(input: {
  grant: QuotePhotoGrant
  pathname: string
  originalName: string
  sortOrder: number
  width?: number | null
  height?: number | null
}): Promise<AssociateResult> {
  const { grant, pathname } = input
  const prefix = blobPrefix(grant.companyId, grant.requestId)

  // 1) Le pathname DOIT appartenir au préfixe autorisé (jamais celui d'un tiers).
  if (!pathname.startsWith(prefix) || pathname.includes("..")) {
    await safeDelete(pathname)
    return { ok: false, error: "Chemin non autorisé.", code: "forbidden" }
  }

  // 2) La demande doit exister ET appartenir à l'entreprise du grant.
  const [reqRow] = await db
    .select({ id: customRequests.id })
    .from(customRequests)
    .where(and(eq(customRequests.id, grant.requestId), eq(customRequests.companyId, grant.companyId)))
    .limit(1)
  if (!reqRow) {
    await safeDelete(pathname)
    return { ok: false, error: "Demande introuvable.", code: "not_found" }
  }

  // 3) Idempotence : déjà associé ? (unicité sur pathname)
  const [existing] = await db
    .select({ id: quoteRequestAttachments.id, companyId: quoteRequestAttachments.companyId })
    .from(quoteRequestAttachments)
    .where(eq(quoteRequestAttachments.pathname, pathname))
    .limit(1)
  if (existing) {
    // Ne jamais divulguer / réutiliser un Blob rattaché à une autre entreprise.
    if (existing.companyId !== grant.companyId) {
      return { ok: false, error: "Chemin non autorisé.", code: "forbidden" }
    }
    return { ok: true, attachmentId: existing.id, alreadyAssociated: true }
  }

  // 4) Quota de photos (grant + plafond global).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quoteRequestAttachments)
    .where(eq(quoteRequestAttachments.requestId, grant.requestId))
  const maxAllowed = Math.min(grant.maxPhotos, MAX_PHOTOS)
  if (Number(n) >= maxAllowed) {
    await safeDelete(pathname)
    return { ok: false, error: "Nombre maximum de photos atteint.", code: "limit" }
  }

  // 5) Le Blob doit RÉELLEMENT exister ; on lit sa signature + sa taille.
  let head: Uint8Array | null
  let size = 0
  try {
    const meta = await readBlobMeta(pathname)
    if (!meta) {
      return { ok: false, error: "Fichier introuvable.", code: "not_found" }
    }
    size = meta.size
    head = meta.head
  } catch (e) {
    console.log("[v0] quote-photos: get Blob échec", e instanceof Error ? e.message : e)
    return { ok: false, error: "Fichier introuvable.", code: "not_found" }
  }

  if (size > MAX_UPLOAD_BYTES) {
    await safeDelete(pathname)
    return { ok: false, error: "Fichier trop volumineux.", code: "too_large" }
  }

  // 6) SIGNATURE réelle : l'extension/MIME annoncés ne suffisent pas.
  const sniffed = head ? sniffImageMime(head) : null
  if (!sniffed) {
    await safeDelete(pathname)
    return { ok: false, error: "Le fichier n'est pas une image valide.", code: "invalid" }
  }

  // 7) Insertion idempotente (unicité pathname => onConflictDoNothing).
  const [inserted] = await db
    .insert(quoteRequestAttachments)
    .values({
      companyId: grant.companyId,
      requestId: grant.requestId,
      pathname,
      originalName: sanitizeOriginalName(input.originalName),
      contentType: sniffed,
      sizeBytes: size,
      width: input.width ?? null,
      height: input.height ?? null,
      sortOrder: input.sortOrder,
    })
    .onConflictDoNothing({ target: quoteRequestAttachments.pathname })
    .returning({ id: quoteRequestAttachments.id })

  if (inserted) return { ok: true, attachmentId: inserted.id, alreadyAssociated: false }

  // Course : quelqu'un vient d'associer le même pathname → renvoyer l'existant.
  const [race] = await db
    .select({ id: quoteRequestAttachments.id })
    .from(quoteRequestAttachments)
    .where(eq(quoteRequestAttachments.pathname, pathname))
    .limit(1)
  if (race) return { ok: true, attachmentId: race.id, alreadyAssociated: true }
  return { ok: false, error: "Association impossible.", code: "invalid" }
}

/** Liste ordonnée des pièces jointes d'une demande (scopée entreprise). */
export async function listAttachments(requestId: number, companyId: number): Promise<AttachmentRow[]> {
  return db
    .select()
    .from(quoteRequestAttachments)
    .where(and(eq(quoteRequestAttachments.requestId, requestId), eq(quoteRequestAttachments.companyId, companyId)))
    .orderBy(asc(quoteRequestAttachments.sortOrder), asc(quoteRequestAttachments.id))
}

/**
 * Une pièce jointe par id, STRICTEMENT limitée à l'entreprise, avec vérification
 * que la demande liée appartient bien à cette entreprise (double cohérence).
 */
export async function getAttachmentForCompany(
  attachmentId: number,
  companyId: number,
): Promise<AttachmentRow | null> {
  const [row] = await db
    .select()
    .from(quoteRequestAttachments)
    .innerJoin(customRequests, eq(customRequests.id, quoteRequestAttachments.requestId))
    .where(
      and(
        eq(quoteRequestAttachments.id, attachmentId),
        eq(quoteRequestAttachments.companyId, companyId),
        eq(customRequests.companyId, companyId),
      ),
    )
    .limit(1)
    .then((rows) => rows.map((r) => r.quote_request_attachments))
  return row ?? null
}

/** Pathnames Blob des pièces jointes d'une entreprise (pour nettoyage à la suppression). */
export async function collectCompanyAttachmentPathnames(companyId: number): Promise<string[]> {
  const rows = await db
    .select({ pathname: quoteRequestAttachments.pathname })
    .from(quoteRequestAttachments)
    .where(eq(quoteRequestAttachments.companyId, companyId))
  return rows.map((r) => r.pathname)
}

/**
 * Supprime les pièces jointes d'UNE demande (Blobs + lignes), scopée entreprise.
 * Réutilisable si une suppression de demande unitaire est ajoutée plus tard.
 */
export async function deleteRequestAttachments(requestId: number, companyId: number): Promise<number> {
  const rows = await db
    .select({ pathname: quoteRequestAttachments.pathname })
    .from(quoteRequestAttachments)
    .where(and(eq(quoteRequestAttachments.requestId, requestId), eq(quoteRequestAttachments.companyId, companyId)))
  for (const r of rows) await safeDelete(r.pathname)
  await db
    .delete(quoteRequestAttachments)
    .where(and(eq(quoteRequestAttachments.requestId, requestId), eq(quoteRequestAttachments.companyId, companyId)))
  return rows.length
}

/**
 * Nettoie les Blobs téléversés mais JAMAIS associés à une demande (envoi
 * interrompu, formulaire fermé, grant expiré). Réutilisé par le cron quotidien
 * existant — AUCUN nouveau cron ni service payant.
 *
 * Sécurité : ne supprime qu'un Blob (a) sous le préfixe `quote-requests/`,
 * (b) plus ancien que `minAgeMs` (jamais un envoi en cours), et (c) absent de
 * la table d'associations. Best-effort et observable ; ne lève jamais.
 */
export async function cleanupOrphanQuotePhotos(
  minAgeMs = 2 * 60 * 60 * 1000,
  maxDeletions = 500,
): Promise<{ scanned: number; deleted: number }> {
  const cutoff = Date.now() - minAgeMs
  let cursor: string | undefined
  let scanned = 0
  let deleted = 0
  try {
    do {
      const page = await list({ prefix: QUOTE_BLOB_ROOT, cursor, limit: 200 })
      const candidates = page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff)
      scanned += candidates.length
      if (candidates.length) {
        const pathnames = candidates.map((b) => b.pathname)
        const known = new Set(
          (
            await db
              .select({ pathname: quoteRequestAttachments.pathname })
              .from(quoteRequestAttachments)
              .where(inArray(quoteRequestAttachments.pathname, pathnames))
          ).map((r) => r.pathname),
        )
        for (const b of candidates) {
          if (known.has(b.pathname)) continue
          if (deleted >= maxDeletions) break
          await safeDelete(b.pathname)
          deleted++
        }
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor && deleted < maxDeletions)
  } catch (e) {
    console.log("[v0] quote-photos: nettoyage orphelins échec", e instanceof Error ? e.message : e)
  }
  return { scanned, deleted }
}
