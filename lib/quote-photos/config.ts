/**
 * Configuration CENTRALISÉE des photos jointes à une demande de devis.
 *
 * Fichier PUR (aucun import serveur) : importable à la fois par le composant
 * client (uploader) et par le serveur (route de token, action d'association,
 * validation). Toutes les limites sont ici pour être modifiables en un seul
 * endroit.
 */

/** Nombre maximum de photos par demande. */
export const MAX_PHOTOS = 10

/** Taille maximale par photo AVANT optimisation (octets). */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024 // 40 Mo

/** Taille cumulée maximale AVANT optimisation (octets). */
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024 // 200 Mo

/**
 * Marge de sécurité pour la limite serveur du Blob (après optimisation, un
 * fichier ne devrait jamais dépasser sa taille d'origine, mais on autorise la
 * limite individuelle brute côté token pour ne jamais rejeter un original
 * légitime resté sous MAX_PHOTO_BYTES).
 */
export const MAX_UPLOAD_BYTES = MAX_PHOTO_BYTES

/** Optimisation : plus grand côté cible (px). */
export const MAX_DIMENSION = 2560

/** Optimisation : qualité JPEG/WebP (0-1). */
export const OUTPUT_QUALITY = 0.83

/** Concurrence maximale d'optimisation/envoi (préserve la mémoire mobile). */
export const MAX_CONCURRENCY = 2

/** Durée de validité du jeton d'autorisation d'envoi (ms). */
export const GRANT_TTL_MS = 20 * 60 * 1000 // 20 minutes

/**
 * Types MIME réellement acceptés (image uniquement). AVIF est inclus : il n'est
 * accepté que si le navigateur sait l'encoder/afficher (vérifié à l'exécution).
 * HEIC/HEIF sont acceptés en ENVOI de l'original uniquement (pas d'optimisation
 * canvas fiable multi-navigateur) ; ils sont conservés tels quels.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number]

/** Formats que l'on tente d'optimiser côté navigateur (décodables sur canvas). */
export const OPTIMIZABLE_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]

/** Formats conservés tels quels (pas d'optimisation canvas fiable). */
export const PASSTHROUGH_MIME_TYPES: readonly string[] = ["image/heic", "image/heif"]

/** Extension canonique par type MIME (nom de Blob immuable). */
export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
}

export function isAllowedMime(type: string | null | undefined): type is AllowedMime {
  return typeof type === "string" && (ALLOWED_MIME_TYPES as readonly string[]).includes(type)
}

/** Formatte une taille en octets de façon lisible (fr). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

/**
 * Nettoie un nom de fichier d'origine : retire tout chemin, les caractères de
 * contrôle et limite la longueur. Jamais utilisé dans un pathname de Blob (le
 * pathname est un uuid) — seulement conservé pour l'affichage admin.
 */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "photo"
  return (
    base
      // Caractères de contrôle → retirés.
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "photo"
  )
}
