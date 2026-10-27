import "server-only"

import sharp from "sharp"

/**
 * Optimisation des photos de prestations Spirit (L32) à l'ENREGISTREMENT :
 * `images.unoptimized` est global dans next.config, donc next/image ne réduit
 * rien. Le site ne reçoit jamais le fichier brut : WebP ≤ 1600 px de large,
 * orientation EXIF appliquée, métadonnées retirées (défaut sharp).
 */

export const SPIRIT_PHOTO_MAX_WIDTH = 1600
/** Garde-fou contre les « bombes » d'image (décodage géant à partir d'un petit fichier). */
export const SPIRIT_PHOTO_MAX_INPUT_PIXELS = 40_000_000

export async function optimizeSpiritPhoto(
  input: Uint8Array,
): Promise<{ ok: true; data: Buffer } | { ok: false }> {
  try {
    const data = await sharp(input, { limitInputPixels: SPIRIT_PHOTO_MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: SPIRIT_PHOTO_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    return { ok: true, data }
  } catch {
    return { ok: false }
  }
}
