/**
 * Optimisation d'image CÔTÉ NAVIGATEUR avant upload (galerie Avant/Après).
 *
 * Objectif : les photos de smartphone (souvent 4–12 Mo, 4000+ px) passent
 * sous la limite serveur sans perte visible pour une galerie web.
 *
 * - Décodage via `createImageBitmap({ imageOrientation: "from-image" })` :
 *   l'orientation EXIF (photos iPhone/Android en portrait) est appliquée, donc
 *   plus de photo « couchée ».
 * - Redimensionnement si le plus grand côté dépasse `maxDimension`.
 * - Compression JPEG progressive jusqu'à passer sous `maxBytes`.
 * - Ne ré-encode PAS une image déjà légère et de dimensions raisonnables.
 * - En cas d'échec de décodage (ex. HEIC sur Chrome), renvoie le fichier
 *   d'origine : c'est l'appelant qui valide alors la taille et affiche l'erreur.
 *
 * Formats gérés : JPEG, PNG, WEBP. Le HEIC/HEIF n'est PAS décodé ici (voir note
 * dans le composant) ; sur iOS Safari, la sélection convertit déjà en JPEG.
 */

export type OptimizeOptions = {
  /** Plus grand côté maximal en pixels (défaut 2000). */
  maxDimension?: number
  /** Taille cible maximale en octets (défaut 6 Mo). */
  maxBytes?: number
  /** Qualité JPEG initiale entre 0 et 1 (défaut 0.82). */
  quality?: number
}

const PROCESSABLE = /^image\/(jpe?g|png|webp)$/

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

export async function optimizeImage(file: File, opts: OptimizeOptions = {}): Promise<File> {
  const maxDimension = opts.maxDimension ?? 2000
  const maxBytes = opts.maxBytes ?? 6 * 1024 * 1024
  const quality = opts.quality ?? 0.82

  // On ne touche qu'aux formats matriciels connus et décodables.
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return file
  if (!PROCESSABLE.test(file.type)) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    // Décodage impossible (ex. HEIC hors Safari) → on laisse l'original.
    return file
  }

  const { width, height } = bitmap
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const needsResize = scale < 1
  // Image déjà confortablement sous la limite ET pas trop grande : on garde.
  if (!needsResize && file.size <= maxBytes * 0.85) {
    bitmap.close?.()
    return file
  }

  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close?.()

  // Compression JPEG progressive jusqu'à passer sous la cible.
  const type = "image/jpeg"
  let q = quality
  let blob = await canvasToBlob(canvas, type, q)
  while (blob && blob.size > maxBytes && q > 0.5) {
    q = Math.round((q - 0.1) * 100) / 100
    blob = await canvasToBlob(canvas, type, q)
  }
  if (!blob) return file

  // Si on n'a pas redimensionné et que le ré-encodage n'aide pas, garder l'original.
  if (!needsResize && blob.size >= file.size) return file

  const base = file.name.replace(/\.[^.]+$/, "") || "image"
  return new File([blob], `${base}.jpg`, { type, lastModified: Date.now() })
}

/** Formatage lisible d'une taille en Mo (base 1024) pour les messages. */
export function formatMo(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
