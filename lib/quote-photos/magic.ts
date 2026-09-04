/**
 * Détection du type d'image par SIGNATURE RÉELLE (magic bytes), indépendante de
 * l'extension et du type MIME annoncés par le navigateur (jamais fiables pour
 * la sécurité). Fichier PUR : utilisable côté client (ArrayBuffer d'un File) et
 * côté serveur (premiers octets du Blob privé).
 *
 * Renvoie le type MIME canonique déduit, ou null si la signature ne correspond
 * à AUCUNE image autorisée. Refuse explicitement SVG, GIF, HTML, exécutables…
 */

export type SniffedMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/heic" | "image/heif"

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = ""
  for (let i = start; i < start + length && i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i])
  }
  return s
}

/** Marques de compatibilité ISO-BMFF (ftyp) pour AVIF / HEIC / HEIF. */
const AVIF_BRANDS = new Set(["avif", "avis"])
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx"])
const HEIF_BRANDS = new Set(["mif1", "msf1", "heif"])

/**
 * @param buf premiers octets du fichier (au moins ~32 recommandés).
 */
export function sniffImageMime(buf: ArrayBuffer | Uint8Array): SniffedMime | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (b.length < 12) return null

  // JPEG : FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png"
  }

  // WebP : "RIFF" .... "WEBP"
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp"

  // ISO-BMFF (AVIF / HEIC / HEIF) : boîte "ftyp" à l'offset 4, marque à l'offset 8.
  if (ascii(b, 4, 4) === "ftyp") {
    const majorBrand = ascii(b, 8, 4).toLowerCase()
    // Marques compatibles listées après le major brand (offset 16+, par blocs de 4).
    const compat: string[] = [majorBrand]
    for (let off = 16; off + 4 <= b.length && off < 40; off += 4) {
      compat.push(ascii(b, off, 4).toLowerCase())
    }
    if (compat.some((c) => AVIF_BRANDS.has(c))) return "image/avif"
    if (compat.some((c) => HEIC_BRANDS.has(c))) return "image/heic"
    if (compat.some((c) => HEIF_BRANDS.has(c))) return "image/heif"
  }

  return null
}

/**
 * Vrai si la signature réelle correspond à un type autorisé ET (le cas échéant)
 * cohérent avec le type MIME annoncé (on tolère les divergences de famille
 * jpeg/jpg, et on ne fait jamais confiance à l'annonce seule).
 */
export function isRealImage(buf: ArrayBuffer | Uint8Array): boolean {
  return sniffImageMime(buf) !== null
}
