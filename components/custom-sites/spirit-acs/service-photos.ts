/**
 * PHOTOS DES PRESTATIONS de Spirit ACS (L32) — logique PURE, client + serveur.
 *
 * 7 emplacements : une photo par grande famille du configurateur
 * (`MAIN_FAMILIES`), plus chaque page de prestation dont l'image d'origine
 * n'appartient à aucune famille (aujourd'hui « Protection céramique »).
 * Une photo de famille remplace aussi l'image des pages de prestation qui
 * partagent la MÊME image d'origine (carte d'accueil + page dédiée).
 *
 * Stockage : `companies.siteContent.spiritAcs.servicePhotos.<clé>` = pathname
 * du WebP optimisé dans le Blob privé. Le pathname n'est jamais exposé au
 * navigateur : l'image est servie par `/api/spirit-service-photo`.
 */

import { MAIN_FAMILIES } from "./configurator/flow-data"
import { SPIRIT_SERVICES } from "./seo-content"

export type SpiritPhotoSlot = {
  key: string
  /** Titre affiché (admin) et texte alternatif d'une photo personnalisée. */
  title: string
  /** Image d'origine du code. */
  original: string
  /** Carte du configurateur concernée, ou null. */
  familyKey: string | null
  /** Pages de prestation (carte d'accueil + page dédiée) concernées. */
  serviceSlugs: string[]
}

export const SPIRIT_PHOTO_SLOTS: readonly SpiritPhotoSlot[] = (() => {
  const slots: SpiritPhotoSlot[] = MAIN_FAMILIES.map((f) => ({
    key: f.key,
    title: f.title,
    original: f.image,
    familyKey: f.key,
    serviceSlugs: SPIRIT_SERVICES.filter((s) => s.image === f.image).map((s) => s.slug),
  }))
  const covered = new Set(MAIN_FAMILIES.map((f) => f.image))
  for (const s of SPIRIT_SERVICES) {
    if (s.image && !covered.has(s.image)) {
      slots.push({ key: s.slug, title: s.cardTitle, original: s.image, familyKey: null, serviceSlugs: [s.slug] })
    }
  }
  return Object.freeze(slots)
})()

const SLOT_BY_KEY = new Map(SPIRIT_PHOTO_SLOTS.map((s) => [s.key, s]))

export function isSpiritPhotoKey(key: unknown): key is string {
  return typeof key === "string" && SLOT_BY_KEY.has(key)
}

export function getSpiritPhotoSlot(key: string): SpiritPhotoSlot | undefined {
  return SLOT_BY_KEY.get(key)
}

/** Taille maximale du fichier envoyé (avant optimisation). */
export const SPIRIT_PHOTO_MAX_BYTES = 8 * 1024 * 1024

/** Préfixe du fichier BRUT envoyé par le navigateur (supprimé après traitement). */
export function spiritPhotoUploadPrefix(companyId: number, key: string): string {
  return `spirit-service-photo-upload/company-${companyId}-${key}-`
}

/** Préfixe du WebP OPTIMISÉ, seul fichier référencé en base et servi. */
export function spiritOptimizedPhotoPrefix(companyId: number, key: string): string {
  return `spirit-service-photo/company-${companyId}-${key}-`
}

/**
 * Vrai si `pathname` est un fichier BRUT envoyé pour cette clé et cette entreprise :
 * `<préfixe><horodatage>[-<suffixe aléatoire du stockage>].jpg|png|webp`. Strict, pour
 * que le préfixe de `nettoyage` ne capte pas `nettoyage-textile`.
 */
export function isSpiritPhotoUploadPath(pathname: unknown, key: string, companyId: number): pathname is string {
  if (typeof pathname !== "string") return false
  return new RegExp(
    `^spirit-service-photo-upload/company-${companyId}-${escapeRegExp(key)}-\\d+(?:-[A-Za-z0-9]+)?\\.(?:jpg|png|webp)$`,
  ).test(pathname)
}

/** Vrai si `pathname` est un WebP optimisé de cette clé (et de cette entreprise si fournie). */
export function isSpiritOptimizedPhotoPath(pathname: unknown, key: string, companyId?: number): pathname is string {
  if (typeof pathname !== "string") return false
  const company = companyId === undefined ? "\\d+" : String(companyId)
  return new RegExp(`^spirit-service-photo/company-${company}-${escapeRegExp(key)}-[A-Za-z0-9]+\\.webp$`).test(pathname)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Photos enregistrées valides (clé connue → pathname optimisé) depuis `siteContent.spiritAcs`. */
export function readSpiritServicePhotos(spiritAcsRaw: unknown): Record<string, string> {
  const raw = (spiritAcsRaw as { servicePhotos?: unknown } | null | undefined)?.servicePhotos
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const slot of SPIRIT_PHOTO_SLOTS) {
    const v = Object.prototype.hasOwnProperty.call(raw, slot.key) ? (raw as Record<string, unknown>)[slot.key] : undefined
    if (isSpiritOptimizedPhotoPath(v, slot.key)) out[slot.key] = v
  }
  return out
}

/** Empreinte courte du pathname : l'URL change à chaque nouveau fichier (cache long). */
function version(pathname: string): string {
  let h = 5381
  for (let i = 0; i < pathname.length; i++) h = ((h * 33) ^ pathname.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function spiritServicePhotoSrc(companySlug: string, key: string, pathname: string): string {
  return `/api/spirit-service-photo?company=${encodeURIComponent(companySlug)}&k=${encodeURIComponent(key)}&v=${version(pathname)}`
}

export type SpiritPhotoOverride = { src: string; alt: string }

/** Substitutions à appliquer : par carte du configurateur et par page de prestation. */
export function spiritPhotoOverrides(
  companySlug: string,
  photos: Record<string, string>,
): { families: Record<string, SpiritPhotoOverride>; services: Record<string, SpiritPhotoOverride> } {
  const families: Record<string, SpiritPhotoOverride> = {}
  const services: Record<string, SpiritPhotoOverride> = {}
  for (const slot of SPIRIT_PHOTO_SLOTS) {
    const pathname = photos[slot.key]
    if (!pathname) continue
    const o = { src: spiritServicePhotoSrc(companySlug, slot.key, pathname), alt: slot.title }
    if (slot.familyKey) families[slot.familyKey] = o
    for (const slug of slot.serviceSlugs) services[slug] = o
  }
  return { families, services }
}
