import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const DIR = "components/custom-sites/cleanyzer"
const read = (f: string) => readFileSync(join(DIR, f), "utf8")
const files = readdirSync(DIR)
const css = files.filter((f) => f.endsWith(".css")).map(read).join("\n")
const tsx = files.filter((f) => f.endsWith(".tsx")).map((f) => [f, read(f)] as const)

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe("L62 C1 : un seul noir, aucune rupture", () => {
  it("les anciens noirs de section ont disparu", () => {
    for (const old of ["#070911", "#0a0b0d", "#070b14", "#05070d", "#0b1430"]) expect(css).not.toContain(old)
    expect(css).toMatch(/--clz-surface-2:\s*var\(--clz-neon-ink\)/)
    expect(css).toMatch(/--clz-ink:\s*var\(--clz-neon-ink\)/)
  })
  it("aucune <section> ne porte un fond opaque", () => {
    for (const [f, src] of tsx) expect(src, f).not.toMatch(/<section[^>]*bg-\[var\(--clz-(surface-2|bg|ink)\)\]/)
  })
  it(".clz-dark* est transparent (pas de lueur dans le fond)", () => {
    expect(css).toMatch(/\.cleanyzer \.clz-dark,\s*\.cleanyzer \.clz-dark-strong\s*\{\s*background: transparent/)
    expect(css).not.toMatch(/\.clz-dark(-strong)?\s*\{[^}]*radial-gradient/)
  })
  it("la lueur est un ::before borné : < 100 % de large, 0 % d'opacité au bord, pas d'overflow", () => {
    const m = css.match(/\.clz-sec::before\s*\{[^}]*\}/)![0]
    expect(m).toMatch(/width: 40%/)
    expect(m).toMatch(/height: min\(70%/)
    expect(m).toMatch(/closest-side[^;]*transparent\)/)
    expect(m).not.toMatch(/overflow/)
  })
})

describe("L62 C2 : alternance rouge/bleu et tubes", () => {
  const home = readFileSync(join(DIR, "home-page.tsx"), "utf8")
  const secs = [...home.matchAll(/className="clz-sec clz-sec-(red|blue)([^"]*)"/g)]
  it("14 sections, alternance stricte rouge puis bleu", () => {
    expect(secs.length).toBe(14)
    secs.forEach((m, i) => expect(m[1]).toBe(i % 2 === 0 ? "red" : "blue"))
  })
  it("au plus 2 tubes dans les sections (+ celui de la vidéo du hero = 3 max)", () => {
    expect(secs.filter((m) => m[2].includes("clz-tube")).length).toBeLessThanOrEqual(2)
  })
  it("les tubes sont sur Témoignages et la boîte finale (aperçu validé)", () => {
    expect(home).toMatch(/clz-tube">\s*<TemoignagesSection/)
    expect(home).toMatch(/clz-tube">\s*<FinalCta/)
    expect(home).not.toMatch(/clz-tube">\s*<ClzFournisseurs/)
  })
  it("sur-titres teintés par section et « + » FAQ rouge néon", () => {
    expect(css).toMatch(/\.clz-sec-red \.clz-eyebrow\s*\{\s*color: #ff7a8c/)
    expect(css).toMatch(/\.clz-sec-blue \.clz-eyebrow\s*\{\s*color: #6fb6ff/)
    expect(css).toMatch(/\.lucide-plus\s*\{\s*color: var\(--clz-neon-red\)/)
  })
  it("le tube est sur le côté, jamais sur le contenu", () => {
    expect(css).toMatch(/\.clz-sec-red\.clz-tube::after\s*\{\s*right: 6px/)
    expect(css).toMatch(/\.clz-sec-blue\.clz-tube::after\s*\{\s*left: 6px/)
  })
})

describe("L62 C3 : cartes et contraste", () => {
  it("contour dégradé bleu → rouge au repos", () => {
    expect(css).toMatch(/\.clz-card::before\s*\{[^}]*linear-gradient\(135deg, var\(--clz-neon-blue\), var\(--clz-neon-red\)\)/)
  })
  it("accents de section AA (≥ 4,5:1) sur #04050a", () => {
    expect(contrast("#ff2b45", "#04050a")).toBeGreaterThanOrEqual(4.5)
    expect(contrast("#1f7bff", "#04050a")).toBeGreaterThanOrEqual(4.5)
  })
})

describe("L62 C4 : header 16:9 sans zoom", () => {
  const dir = "public/custom-sites/cleanyzer/neon"
  it("médias 1080 présents", () => {
    for (const f of ["hero-arrivee-1080.mp4", "hero-boucle-1080.mp4", "hero-poster-1080.webp"]) expect(statSync(join(dir, f)).size).toBeGreaterThan(10_000)
  })
  it("cadrage 16:9 et aucun scale/zoom animé sur le hero", () => {
    expect(css).toMatch(/\.clz-neon-scene \{[^}]*aspect-ratio: 1672 \/ 941/)
    const hero = readFileSync(join(DIR, "hero.tsx"), "utf8")
    expect(hero).not.toMatch(/scale/i)
    expect(css).not.toMatch(/\.clz-neon-(scene|hero)[^{]*\{[^}]*animation:[^}]*zoom/i)
  })
})
