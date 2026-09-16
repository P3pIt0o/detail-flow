/**
 * Génère l'image Open Graph 1200×630 de Spirit ACS à partir du LOGO EXISTANT.
 *
 * - Réutilise strictement `public/custom-sites/spirit-acs/spirit-logo.png`
 *   (aucun nouveau logo, aucune déformation : ratio préservé via `fit: inside`).
 * - Fond aux couleurs de l'identité Spirit ACS (bleu marine + halo rose).
 * - Sortie : `public/custom-sites/spirit-acs/og-spirit-acs.png`.
 *
 * Usage : node scripts/generate-spirit-og.mjs
 */
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const require = createRequire(import.meta.url)
// Sharp est présent dans le store pnpm ; résolution par chemin absolu.
const sharp = require(
  join(process.cwd(), "node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"),
)

const ROOT = process.cwd()
const DIR = join(ROOT, "public", "custom-sites", "spirit-acs")
const LOGO = join(DIR, "spirit-logo.png")
const OUT = join(DIR, "og-spirit-acs.png")

const W = 1200
const H = 630

// Palette dérivée du logo : bleu marine profond + rose Spirit.
const NAVY_DEEP = "#0a1024"
const NAVY = "#14203c"
const PINK = "#e6197f"

// Fond : dégradé marine + halo rose diffus, discret et premium.
const bgSvg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="${PINK}" stop-opacity="0.22"/>
      <stop offset="45%" stop-color="${PINK}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${NAVY}"/>
      <stop offset="100%" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="20" ry="20"
        fill="none" stroke="${PINK}" stroke-opacity="0.28" stroke-width="2"/>
</svg>`

async function main() {
  const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer()

  // Logo mis à l'échelle DANS une boîte, sans déformation (fit: inside).
  const boxW = 820
  const boxH = 430
  const logo = await sharp(readFileSync(LOGO))
    .resize(boxW, boxH, { fit: "inside", withoutEnlargement: true })
    .toBuffer()
  const meta = await sharp(logo).metadata()

  const left = Math.round((W - (meta.width ?? boxW)) / 2)
  const top = Math.round((H - (meta.height ?? boxH)) / 2)

  const out = await sharp(bg)
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()

  writeFileSync(OUT, out)
  console.log(`[v0] OG Spirit ACS écrite: ${OUT} (${W}x${H}), logo ${meta.width}x${meta.height} @ ${left},${top}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
