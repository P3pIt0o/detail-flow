/**
 * PERSONNALISATION AVANCÉE DE L'IMAGE DE FOND DU HERO (tenants STANDARD).
 *
 * Module PUR (aucune dépendance DB, React ou Next). Source unique de vérité
 * pour :
 *   - les bornes et valeurs par défaut des réglages ;
 *   - la validation/normalisation côté serveur (jamais confiance au client) ;
 *   - la résolution de l'image (image personnalisée DB vs fallback historique) ;
 *   - le calcul des styles CSS appliqués au rendu (object-position / scale) ;
 *   - la résolution du cadrage mobile (héritage du desktop si non défini).
 *
 * RÈGLE DE RÉTROCOMPATIBILITÉ CENTRALE : des réglages ABSENTS (null) doivent
 * reproduire EXACTEMENT le comportement historique. Le cadrage n'est appliqué
 * QUE lorsqu'au moins une valeur de cadrage existe ; sinon on laisse le Hero
 * se rendre comme avant (y compris le hack JustClean, géré par l'appelant).
 */

// ------------------------------ Bornes ------------------------------------

/** Position horizontale/verticale : 0..100, 50 = centré (comportement neutre). */
export const POSITION_MIN = 0
export const POSITION_MAX = 100
export const POSITION_DEFAULT = 50

/** Zoom : 100..180 (%). 100 = aucune mise à l'échelle (comportement actuel). */
export const ZOOM_MIN = 100
export const ZOOM_MAX = 180
export const ZOOM_DEFAULT = 100

/** Assombrissement : 0..80 (%). Commun desktop/mobile en V1. */
export const OVERLAY_MIN = 0
export const OVERLAY_MAX = 80
/** Valeur proposée par défaut dans l'UI quand une image personnalisée existe. */
export const OVERLAY_DEFAULT = 40

/** Classe CSS déterministe appliquée à l'image de fond ajustable du Hero. */
export const HERO_ADJUST_CLASS = "hero-bg-adjust"

/** Réglages bruts tels que stockés en base (chaque champ nullable). */
export type HeroImageSettingsRaw = {
  heroImageUrl: string | null
  heroPositionX: number | null
  heroPositionY: number | null
  heroZoom: number | null
  heroMobilePositionX: number | null
  heroMobilePositionY: number | null
  heroMobileZoom: number | null
  heroOverlayOpacity: number | null
}

/** Un jeu de cadrage résolu (desktop ou mobile) prêt pour le rendu. */
export type ResolvedFraming = { positionX: number; positionY: number; zoom: number }

// --------------------------- Validation -----------------------------------

/**
 * Valide UNE valeur entière bornée reçue du client.
 * - `null`/chaîne vide → `{ ok: true, value: null }` (réglage effacé, fallback).
 * - entier valide dans [min,max] → `{ ok: true, value }`.
 * - tout le reste (non entier, hors bornes) → `{ ok: false }` (REJET serveur).
 *
 * On REJETTE (au lieu de clamder silencieusement) pour ne jamais enregistrer
 * une intention ambiguë : l'admin est informé plutôt que de voir une valeur
 * modifiée à son insu.
 */
export function validateBoundedInt(
  raw: unknown,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw === "string") {
    const t = raw.trim()
    if (t === "") return { ok: true, value: null }
    if (!/^-?\d+$/.test(t)) return { ok: false }
    raw = Number(t)
  }
  if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false }
  if (raw < min || raw > max) return { ok: false }
  return { ok: true, value: raw }
}

export const validatePosition = (raw: unknown) => validateBoundedInt(raw, POSITION_MIN, POSITION_MAX)
export const validateZoom = (raw: unknown) => validateBoundedInt(raw, ZOOM_MIN, ZOOM_MAX)
export const validateOverlay = (raw: unknown) => validateBoundedInt(raw, OVERLAY_MIN, OVERLAY_MAX)

/** Formats d'image acceptés pour l'upload du Hero. */
export const HERO_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const
/** Taille max de l'image Hero (octets). Cohérent avec un fond plein écran. */
export const HERO_IMAGE_MAX_BYTES = 6 * 1024 * 1024 // 6 Mo

export function isAllowedHeroMime(type: string | null | undefined): boolean {
  return !!type && (HERO_IMAGE_MIME as readonly string[]).includes(type)
}

// --------------------------- Résolution ------------------------------------

/**
 * Indique si un jeu de réglages contient AU MOINS une valeur de cadrage.
 * Faux ⇒ l'appelant doit rendre le Hero exactement comme avant (aucun style
 * appliqué), préservant le comportement historique et le hack JustClean.
 */
export function hasFramingSettings(s: HeroImageSettingsRaw | null | undefined): boolean {
  if (!s) return false
  return (
    s.heroPositionX != null ||
    s.heroPositionY != null ||
    s.heroZoom != null ||
    s.heroMobilePositionX != null ||
    s.heroMobilePositionY != null ||
    s.heroMobileZoom != null
  )
}

/**
 * URL publique de l'image de fond à afficher.
 * - `heroImageUrl` défini ⇒ image personnalisée servie par slug via la route
 *   publique (jamais le pathname Blob directement).
 * - sinon ⇒ image de fallback historique fournie par l'appelant
 *   (lib/tenant-hero.getTenantHeroImage), inchangée.
 */
export function resolveHeroImageSrc(args: {
  heroImageUrl: string | null | undefined
  slug: string | null | undefined
  fallbackSrc: string
}): { src: string; isCustom: boolean } {
  const { heroImageUrl, slug, fallbackSrc } = args
  if (heroImageUrl && slug) {
    return { src: `/api/company-hero?company=${encodeURIComponent(slug)}`, isCustom: true }
  }
  return { src: fallbackSrc, isCustom: false }
}

/** Résout le cadrage desktop en comblant les trous par les valeurs neutres. */
export function resolveDesktopFraming(s: HeroImageSettingsRaw): ResolvedFraming {
  return {
    positionX: s.heroPositionX ?? POSITION_DEFAULT,
    positionY: s.heroPositionY ?? POSITION_DEFAULT,
    zoom: s.heroZoom ?? ZOOM_DEFAULT,
  }
}

/**
 * Résout le cadrage mobile. Chaque axe non défini HÉRITE de la valeur desktop
 * correspondante (déjà résolue), garantissant un rendu cohérent si l'admin ne
 * règle que le desktop.
 */
export function resolveMobileFraming(s: HeroImageSettingsRaw): ResolvedFraming {
  const desktop = resolveDesktopFraming(s)
  return {
    positionX: s.heroMobilePositionX ?? desktop.positionX,
    positionY: s.heroMobilePositionY ?? desktop.positionY,
    zoom: s.heroMobileZoom ?? desktop.zoom,
  }
}

/** Style inline d'un cadrage donné (utilisé aussi par l'aperçu admin). */
export function framingToStyle(f: ResolvedFraming): { objectPosition: string; transform: string } {
  return {
    objectPosition: `${f.positionX}% ${f.positionY}%`,
    // scale() borné côté validation : overflow-hidden du conteneur évite tout
    // débordement hors du Hero.
    transform: `scale(${(f.zoom / 100).toFixed(3)})`,
  }
}

/**
 * Génère le CSS scopé (classe déterministe) appliquant le cadrage desktop et,
 * via un media query mobile, le cadrage mobile. Aucune image régénérée : on
 * agit uniquement en CSS (object-position + transform), compatible next/image.
 */
export function buildHeroAdjustCss(s: HeroImageSettingsRaw, className = HERO_ADJUST_CLASS): string {
  const d = framingToStyle(resolveDesktopFraming(s))
  const m = framingToStyle(resolveMobileFraming(s))
  return (
    `.${className}{object-position:${d.objectPosition};transform:${d.transform};transform-origin:center;will-change:transform}` +
    `@media (max-width:767px){.${className}{object-position:${m.objectPosition};transform:${m.transform}}}`
  )
}

/**
 * Résout l'opacité du scrim d'assombrissement additionnel.
 * `null` ⇒ `null` (aucun scrim ajouté : voile historique strictement inchangé).
 * Sinon ⇒ ratio 0..0.8 appliqué à un calque noir superposé.
 */
export function resolveOverlayOpacityRatio(raw: number | null | undefined): number | null {
  if (raw == null) return null
  const clamped = Math.min(OVERLAY_MAX, Math.max(OVERLAY_MIN, raw))
  return clamped / 100
}
