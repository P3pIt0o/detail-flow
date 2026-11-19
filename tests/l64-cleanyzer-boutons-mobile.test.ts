import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CleanyzerHero, CLZ_TARIFS_HREF } from "@/components/custom-sites/cleanyzer/hero"
import { CLZ_BOOKING_HREF } from "@/components/custom-sites/cleanyzer/tokens"

/** L64 — boutons du haut de page Cleanyzer visibles sur téléphone, ancrés en bas, sans recouvrir la voiture. */

const css = readFileSync(path.join(process.cwd(), "components/custom-sites/cleanyzer/cleanyzer.css"), "utf8")
const start = css.indexOf("/*  L35 — univers « néon »")
const mobileStart = css.indexOf("@media (max-width: 760px) {", start)
const mobileEnd = css.indexOf("\n}\n", mobileStart)
const mobile = css.slice(mobileStart, mobileEnd)
const desktop = css.slice(start, mobileStart)
const small = css.slice(css.indexOf("@media (max-width: 340px) {", mobileEnd))

describe("L64 — boutons du hero sur mobile", () => {
  it("le bloc mobile ne masque plus les boutons", () => {
    expect(mobile).not.toMatch(/\.clz-neon-ctas\s*\{[^}]*display:\s*none/)
  })

  it("boutons de 44 px minimum, texte 15 px, ancrés par le bas avec la zone sûre", () => {
    expect(mobile).toMatch(/\.clz-neon-ctas \.clz-neon-btn\s*\{[^}]*min-height:\s*44px/)
    expect(mobile).toMatch(/\.clz-neon-ctas \.clz-neon-btn\s*\{[^}]*font-size:\s*15px/)
    const rule = mobile.match(/\.clz-neon-ctas\s*\{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toMatch(/position:\s*absolute/)
    expect(rule).toMatch(/bottom:\s*calc\([^)]*env\(safe-area-inset-bottom/)
    expect(rule).not.toMatch(/\btop:/)
  })

  it("boutons au-dessus de la ligne des métiers (≥ 16 px d'écart)", () => {
    const trades = Number(mobile.match(/\.clz-neon-trades\s*\{[^}]*bottom:\s*calc\((\d+)px/)?.[1])
    const ctas = (mobile.match(/\.clz-neon-ctas\s*\{[^}]*bottom:\s*calc\(([^)]*?)\s*\+\s*env/)?.[1] ?? "")
      .split("+")
      .reduce((n, p) => n + parseInt(p, 10), 0)
    expect(trades).toBeGreaterThan(0)
    expect(ctas).toBeGreaterThanOrEqual(trades + 16)
  })

  it("« Voir les tarifs » en contour bleu, fond transparent ; libellé long masqué", () => {
    expect(mobile).toMatch(/\.clz-neon-btn-ghost\s*\{[^}]*background:\s*transparent[^}]*border-color:\s*var\(--clz-neon-blue\)/)
    expect(mobile).toMatch(/\.clz-neon-cta-long\s*\{\s*display:\s*none/)
  })

  it("empilement sous 340 px", () => {
    expect(small).toMatch(/\.clz-neon-ctas\s*\{[^}]*flex-direction:\s*column/)
  })

  it("règle ordinateur inchangée : visible, alignée à droite, jamais masquée hors media", () => {
    expect(desktop).toMatch(/\.clz-neon-ctas\s*\{ display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 20px; pointer-events: auto; \}/)
    expect(desktop).not.toMatch(/\.clz-neon-cta-long/)
  })

  it("le hero rendu contient les deux liens (réservation et tarifs)", () => {
    const h = renderToStaticMarkup(createElement(CleanyzerHero))
    expect(h).toMatch(new RegExp(`href="${CLZ_BOOKING_HREF}"[^>]*>Réserver<span class="clz-neon-cta-long"> mon nettoyage</span>`))
    expect(h).toMatch(new RegExp(`href="${CLZ_TARIFS_HREF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>Voir les tarifs`))
  })
})
