import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/p/cleanyzer" }))

import { CLZ_TARIFS_HREF, CleanyzerHero } from "@/components/custom-sites/cleanyzer/hero"
import { CLZ_BOOKING_HREF } from "@/components/custom-sites/cleanyzer/tokens"

const css = readFileSync(path.join(process.cwd(), "components/custom-sites/cleanyzer/cleanyzer.css"), "utf8")
const start = css.indexOf("@media (max-width: 760px) {\n  .cleanyzer .clz-neon-hero")
const mobile = css.slice(start, css.indexOf("\n}", start))
const num = (re: RegExp) => {
  const m = mobile.match(re)
  expect(m, String(re)).not.toBeNull()
  return Number(m![1])
}

describe("L71 — Cleanyzer : boutons du hero plus bas sur mobile", () => {
  it("mobile : boutons ancrés en bas du hero, au-dessus des métiers (2 lignes au pire)", () => {
    expect(start).toBeGreaterThan(-1)
    expect(mobile).toMatch(/\.clz-neon-copy \{[^}]*top: 0;[^}]*bottom: 0;/)
    const ctasBottom = num(/\.clz-neon-ctas \{[^}]*position: absolute;[^}]*bottom: calc\((\d+)px/)
    const tradesBottom = num(/\.clz-neon-trades \{[^}]*bottom: calc\((\d+)px/)
    // Métiers sur 2 lignes au pire (≈ 2 × 18px + 6px d'écart) + au moins 12px d'air.
    expect(ctasBottom).toBeGreaterThanOrEqual(tradesBottom + 42 + 12)
  })

  it("mobile : haut des boutons sous la voiture (≈ 57 % du hero), pire cas 360 px sur 2 lignes", () => {
    const heroMin = num(/\.clz-neon-hero \{ height: clamp\((\d+)px/)
    const heroMax = num(/\.clz-neon-hero \{ height: clamp\(\d+px, [\d.]+svh, (\d+)px/)
    const ctasBottom = num(/\.clz-neon-ctas \{[^}]*position: absolute;[^}]*bottom: calc\((\d+)px/)
    const stack = 46 + 10 + 46
    for (const h of [heroMin, 743, heroMax]) {
      const ctasTop = h - ctasBottom - stack
      expect(ctasTop, `hero ${h}px`).toBeGreaterThanOrEqual(h * 0.57)
    }
  })

  it("mobile : bas des boutons visible sans défiler sur 360×640 et 390×844", () => {
    const ctasBottom = num(/\.clz-neon-ctas \{[^}]*position: absolute;[^}]*bottom: calc\((\d+)px/)
    // Hauteur du hero sur chaque écran (fiche : 600 px sur 360×640, ≈ 743 px sur 390×844).
    for (const [viewport, hero] of [[640, 600], [844, 743]]) {
      expect(ctasBottom).toBeGreaterThan(0)
      expect(hero - ctasBottom, `écran ${viewport}px`).toBeLessThanOrEqual(viewport)
    }
  })

  it("ordinateur inchangé : règle .clz-neon-ctas hors mobile identique", () => {
    expect(css).toContain(
      ".cleanyzer .clz-neon-ctas { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 20px; pointer-events: auto; }",
    )
    expect(css).toContain(
      ".cleanyzer .clz-neon-copy { position: absolute; z-index: 4; right: 0; left: 0; top: 50%; transform: translateY(-50%); pointer-events: none; }",
    )
  })

  it("libellés et liens des boutons inchangés", () => {
    const h = renderToStaticMarkup(createElement(CleanyzerHero))
    expect(h).toContain(`href="${CLZ_BOOKING_HREF}"`)
    expect(h).toContain(`href="${CLZ_TARIFS_HREF}"`)
    expect(h).toContain("Réserver mon nettoyage")
    expect(h).toContain("Voir les tarifs")
  })
})
