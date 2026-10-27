"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { del, get, put } from "@vercel/blob"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { checkSpiritEditor } from "@/lib/custom-sites/spirit-editor"
import { optimizeSpiritPhoto } from "@/lib/custom-sites/spirit-photo-optimize"
import { sniffImageMime } from "@/lib/quote-photos/magic"
import { SPIRIT_SITE_TEXTS_KEY } from "@/components/custom-sites/spirit-acs/site-texts"
import { SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"
import {
  SPIRIT_PHOTO_MAX_BYTES,
  SPIRIT_PHOTO_SLOTS,
  isSpiritOptimizedPhotoPath,
  isSpiritPhotoKey,
  readSpiritServicePhotos,
  spiritOptimizedPhotoPrefix,
  spiritPhotoUploadPrefix,
  spiritServicePhotoSrc,
} from "@/components/custom-sites/spirit-acs/service-photos"

/** Une photo de prestation telle que l'admin l'affiche. */
export type SpiritPhotoView = {
  key: string
  title: string
  /** Endroits du site où la photo s'affiche. */
  where: string[]
  /** Photo actuellement affichée (personnalisée ou d'origine). */
  src: string
  custom: boolean
}

export type SpiritPhotosResult = { ok: boolean; error?: string; photos?: SpiritPhotoView[] }

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"])

/** Membre OWNER/ADMIN + tenant Spirit + licence `website` (cf. lib/custom-sites/spirit-editor.ts). */
const requireSpiritEditor = async () => checkSpiritEditor(await requireCompanyMember(["OWNER", "ADMIN"]))

/** Accueil (cartes + configurateur) et pages de prestation. */
const REVALIDATE_PATHS: Array<[string] | [string, "layout"]> = [
  ["/admin/parametres"],
  ["/", "layout"],
  ...SPIRIT_SERVICES.map((s): [string] => [`/prestations/${s.slug}`]),
]

// La carte d'accueil « Protection céramique » n'existe pas (cf. home-page.tsx).
const NO_HOME_CARD = new Set(["protection-ceramique"])

function views(companySlug: string, siteContent: unknown): SpiritPhotoView[] {
  const photos = readSpiritServicePhotos((siteContent as { spiritAcs?: unknown } | null)?.spiritAcs)
  return SPIRIT_PHOTO_SLOTS.map((slot) => {
    const where: string[] = []
    if (slot.familyKey) where.push("Configurateur de devis")
    for (const slug of slot.serviceSlugs) {
      if (!NO_HOME_CARD.has(slug)) where.push("Carte d'accueil")
      const label = SPIRIT_SERVICES.find((s) => s.slug === slug)?.breadcrumbLabel ?? slug
      where.push(`Page « ${label} »`)
    }
    const pathname = photos[slot.key]
    return {
      key: slot.key,
      title: slot.title,
      where,
      src: pathname ? spiritServicePhotoSrc(companySlug, slot.key, pathname) : slot.original,
      custom: Boolean(pathname),
    }
  })
}

async function safeDelete(pathname: string): Promise<void> {
  try {
    await del(pathname)
  } catch (e) {
    console.log("[spirit-photos] échec suppression Blob", pathname, e instanceof Error ? e.message : e)
  }
}

/** Lit le fichier envoyé (≤ 8 Mo, sinon « too_large » sans tout lire). */
async function readUpload(pathname: string): Promise<Uint8Array | "missing" | "too_large"> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200) return "missing"
  if (result.blob.size > SPIRIT_PHOTO_MAX_BYTES) {
    await result.stream.cancel().catch(() => {})
    return "too_large"
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = result.stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > SPIRIT_PHOTO_MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return "too_large"
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/**
 * Pose (`pathname`) ou retire (`null`) la photo `key` dans `companies.siteContent`,
 * ligne verrouillée le temps de la transaction (aucun texte enregistré en même
 * temps n'est écrasé). Renvoie l'ancienne valeur et le contenu écrit.
 * ISOLATION : uniquement l'id du tenant serveur ET `customSiteKey = 'spirit-acs'`.
 */
async function writePhoto(
  companyId: number,
  key: string,
  pathname: string | null,
): Promise<{ previous: unknown; siteContent: Record<string, unknown> }> {
  const scope = and(eq(companies.id, companyId), eq(companies.customSiteKey, SPIRIT_SITE_TEXTS_KEY))
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ siteContent: companies.siteContent }).from(companies).where(scope).limit(1).for("update")
    if (!row) throw new Error("Entreprise introuvable.")
    const next = structuredClone((row.siteContent as Record<string, unknown> | null) ?? {})
    const spiritAcs = isPlainObject(next.spiritAcs) ? next.spiritAcs : (next.spiritAcs = {})
    const photos = isPlainObject(spiritAcs.servicePhotos) ? spiritAcs.servicePhotos : {}
    const previous = Object.prototype.hasOwnProperty.call(photos, key) ? photos[key] : undefined
    if (pathname) photos[key] = pathname
    else delete photos[key]
    if (Object.keys(photos).length > 0) spiritAcs.servicePhotos = photos
    else delete spiritAcs.servicePhotos
    await tx.update(companies).set({ siteContent: next, updatedAt: new Date() }).where(scope)
    return { previous, siteContent: next }
  })
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function revalidate(): void {
  for (const [path, mode] of REVALIDATE_PATHS) {
    if (mode) revalidatePath(path, mode)
    else revalidatePath(path)
  }
}

/** Photos actuelles des 7 prestations (admin). */
export async function getSpiritServicePhotos(): Promise<SpiritPhotosResult> {
  const guard = await requireSpiritEditor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { tenant } = guard.ctx
  return { ok: true, photos: views(tenant.slug, tenant.siteContent) }
}

/**
 * Enregistre la photo `key` à partir du fichier BRUT envoyé par le navigateur
 * (`uploadPathname`, préfixe d'envoi de cette entreprise et de cette clé) :
 * taille ≤ 8 Mo, signature réelle JPG/PNG/WebP, puis ré-encodage WebP ≤ 1600 px.
 * Le brut est toujours supprimé ; l'ancienne photo seulement après succès.
 */
export async function saveSpiritServicePhoto(key: string, uploadPathname: string): Promise<SpiritPhotosResult> {
  const guard = await requireSpiritEditor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { tenant } = guard.ctx

  if (!isSpiritPhotoKey(key)) return { ok: false, error: "Prestation inconnue." }
  // Jamais lu ni supprimé hors du préfixe de CETTE entreprise (peut appartenir à un autre tenant).
  if (
    typeof uploadPathname !== "string" ||
    !uploadPathname.startsWith(spiritPhotoUploadPrefix(tenant.id, key)) ||
    uploadPathname.includes("..")
  ) {
    return { ok: false, error: "Fichier non autorisé." }
  }

  let optimized: Buffer
  try {
    const file = await readUpload(uploadPathname)
    if (file === "missing") return { ok: false, error: "Fichier introuvable. Réessayez l'envoi." }
    if (file === "too_large") return { ok: false, error: "Fichier trop volumineux (8 Mo maximum)." }
    const mime = sniffImageMime(file.subarray(0, 32))
    if (!mime || !ACCEPTED.has(mime)) {
      return { ok: false, error: "Format non accepté : JPG, PNG ou WebP uniquement." }
    }
    const out = await optimizeSpiritPhoto(file)
    if (!out.ok) return { ok: false, error: "Image illisible ou trop grande. Essayez une autre photo." }
    optimized = out.data
  } catch (e) {
    console.log("[spirit-photos] lecture du fichier envoyé impossible", e instanceof Error ? e.message : e)
    return { ok: false, error: "Fichier introuvable. Réessayez l'envoi." }
  } finally {
    await safeDelete(uploadPathname)
  }

  const target = `${spiritOptimizedPhotoPrefix(tenant.id, key)}${randomUUID().replace(/-/g, "")}.webp`
  let stored: string
  try {
    stored = (await put(target, optimized, { access: "private", contentType: "image/webp", addRandomSuffix: false })).pathname
  } catch (e) {
    console.log("[spirit-photos] envoi du WebP impossible", e instanceof Error ? e.message : e)
    return { ok: false, error: "Enregistrement impossible. Réessayez." }
  }
  if (!isSpiritOptimizedPhotoPath(stored, key, tenant.id)) {
    await safeDelete(stored)
    return { ok: false, error: "Enregistrement impossible. Réessayez." }
  }

  let written: Awaited<ReturnType<typeof writePhoto>>
  try {
    written = await writePhoto(tenant.id, key, stored)
  } catch (e) {
    console.log("[spirit-photos] écriture impossible", e instanceof Error ? e.message : e)
    await safeDelete(stored)
    return { ok: false, error: "Enregistrement impossible. Réessayez." }
  }

  if (written.previous !== stored && isSpiritOptimizedPhotoPath(written.previous, key, tenant.id)) {
    await safeDelete(written.previous)
  }
  revalidate()
  return { ok: true, photos: views(tenant.slug, written.siteContent) }
}

/** Revient à la photo d'origine du code ; l'ancien fichier est supprimé après succès. */
export async function resetSpiritServicePhoto(key: string): Promise<SpiritPhotosResult> {
  const guard = await requireSpiritEditor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { tenant } = guard.ctx
  if (!isSpiritPhotoKey(key)) return { ok: false, error: "Prestation inconnue." }

  let written: Awaited<ReturnType<typeof writePhoto>>
  try {
    written = await writePhoto(tenant.id, key, null)
  } catch (e) {
    console.log("[spirit-photos] écriture impossible", e instanceof Error ? e.message : e)
    return { ok: false, error: "Enregistrement impossible. Réessayez." }
  }
  if (isSpiritOptimizedPhotoPath(written.previous, key, tenant.id)) await safeDelete(written.previous)
  revalidate()
  return { ok: true, photos: views(tenant.slug, written.siteContent) }
}
