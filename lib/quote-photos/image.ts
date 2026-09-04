/**
 * Optimisation d'image CÔTÉ NAVIGATEUR (aucun import serveur).
 *
 * Réduit le temps d'envoi et le stockage des photos volumineuses de smartphone
 * AVANT l'envoi direct vers le Blob :
 *   - respect de l'orientation EXIF (createImageBitmap { imageOrientation }) ;
 *   - plus grand côté limité à MAX_DIMENSION (jamais d'agrandissement) ;
 *   - ré-encodage JPEG à OUTPUT_QUALITY (supprime les métadonnées EXIF, dont la
 *     géolocalisation) ;
 *   - conservé UNIQUEMENT si réellement plus léger que l'original ;
 *   - libération systématique des ObjectURL / bitmaps / canvas.
 *
 * HEIC/HEIF ne sont pas décodables de façon fiable multi-navigateur : on
 * conserve l'original tel quel (passthrough) sans jamais planter.
 */

import {
  MAX_DIMENSION,
  OUTPUT_QUALITY,
  OPTIMIZABLE_MIME_TYPES,
} from "./config"

export interface OptimizedImage {
  /** Données finales à envoyer (optimisées ou original). */
  blob: Blob
  contentType: string
  width: number | null
  height: number | null
  optimized: boolean
}

/** Promisifie canvas.toBlob. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

/**
 * Décode le fichier en respectant l'orientation EXIF. Utilise createImageBitmap
 * quand disponible (rapide, EXIF géré nativement), sinon un <img> + ObjectURL.
 */
async function decode(file: Blob): Promise<{ draw: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    // `imageOrientation: "from-image"` applique la rotation EXIF au bitmap.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    return {
      draw: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode-failed"))
      el.src = url
    })
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

/**
 * Optimise une image si possible. Ne lève jamais pour une raison "attendue" :
 * en cas d'échec de décodage/ré-encodage, renvoie l'original (optimized:false)
 * afin que l'envoi sécurisé de l'original reste possible.
 */
export async function optimizeImage(file: File): Promise<OptimizedImage> {
  const type = file.type || ""
  // Formats non décodables de façon fiable (HEIC/HEIF) ou inconnus : passthrough.
  if (!OPTIMIZABLE_MIME_TYPES.includes(type)) {
    return { blob: file, contentType: type || "application/octet-stream", width: null, height: null, optimized: false }
  }

  let decoded: Awaited<ReturnType<typeof decode>> | null = null
  let canvas: HTMLCanvasElement | null = null
  try {
    decoded = await decode(file)
    const { draw, width, height } = decoded
    if (!width || !height) throw new Error("no-dimensions")

    const largest = Math.max(width, height)
    // Jamais d'agrandissement.
    const scale = largest > MAX_DIMENSION ? MAX_DIMENSION / largest : 1
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no-2d-context")
    ctx.drawImage(draw, 0, 0, targetW, targetH)

    // Ré-encodage JPEG : universel, supprime l'EXIF (géoloc incluse).
    const out = await canvasToBlob(canvas, "image/jpeg", OUTPUT_QUALITY)
    if (!out) throw new Error("encode-failed")

    // On ne garde le résultat que s'il est réellement plus léger.
    if (out.size < file.size) {
      return { blob: out, contentType: "image/jpeg", width: targetW, height: targetH, optimized: true }
    }
    // Sinon on conserve l'original mais on connaît ses dimensions.
    return { blob: file, contentType: type, width, height, optimized: false }
  } catch {
    // Échec d'optimisation : on renvoie l'original (jamais de plantage).
    return { blob: file, contentType: type || "application/octet-stream", width: null, height: null, optimized: false }
  } finally {
    // Libération mémoire (téléphones).
    try {
      decoded?.release()
    } catch {
      /* noop */
    }
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
      canvas = null
    }
  }
}

/** Exécute `worker` sur `items` avec une concurrence bornée. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}
