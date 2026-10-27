import { describe, expect, it } from "vitest"
import sharp from "sharp"
import {
  SPIRIT_PHOTO_MAX_INPUT_PIXELS,
  SPIRIT_PHOTO_MAX_WIDTH,
  optimizeSpiritPhoto,
} from "@/lib/custom-sites/spirit-photo-optimize"

/**
 * L32 — optimisation à l'enregistrement (vrai `sharp`, aucun mock) : jamais le
 * fichier brut sur le site, toujours un WebP ≤ 1600 px de large.
 */

async function photo(width: number, height: number, format: "jpeg" | "png"): Promise<Buffer> {
  // Bruit aléatoire : simule une vraie photo (incompressible), pas un aplat.
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24
  const img = sharp(raw, { raw: { width, height, channels: 3 } })
  return format === "jpeg" ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer()
}

describe("optimizeSpiritPhoto", () => {
  it.each(["jpeg", "png"] as const)("4000×3000 %s → WebP 1600×1200, nettement plus léger", async (format) => {
    const input = await photo(4000, 3000, format)
    const out = await optimizeSpiritPhoto(input)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const meta = await sharp(out.data).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.width).toBe(SPIRIT_PHOTO_MAX_WIDTH)
    expect(meta.height).toBe(1200)
    expect(out.data.length).toBeLessThan(input.length / 2)
  })

  it("n'agrandit pas une petite image", async () => {
    const out = await optimizeSpiritPhoto(await photo(800, 600, "jpeg"))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const meta = await sharp(out.data).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 800, 600])
  })

  it("refuse une image au-delà de la limite de pixels (bombe d'image)", async () => {
    expect(SPIRIT_PHOTO_MAX_INPUT_PIXELS).toBe(40_000_000)
    // En-tête PNG annonçant 10000×5000 px (50 Mpx) : refusé sans décoder.
    const big = await sharp({ create: { width: 10000, height: 5000, channels: 3, background: "#000" } }).png().toBuffer()
    expect(await optimizeSpiritPhoto(big)).toEqual({ ok: false })
  })

  it("refuse ce qui n'est pas une image", async () => {
    expect(await optimizeSpiritPhoto(Buffer.from("<html>pas une image</html>"))).toEqual({ ok: false })
  })
})
