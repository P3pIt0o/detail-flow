import { existsSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CleanyzerHero, heroPoster, heroVideoSources } from "@/components/custom-sites/cleanyzer/hero"

/** L55 — header : nouveaux médias (vidéos + posters), titre en HTML. */

const pub = (src: string) => existsSync(path.join(process.cwd(), "public", src))

describe("L55 — médias du header", () => {
  const h = renderToStaticMarkup(createElement(CleanyzerHero))

  it("posters 720 (téléphone) / 1080 présents et référencés ; anciens posters supprimés", () => {
    expect(heroPoster("720")).toBe("/custom-sites/cleanyzer/neon/hero-poster-720.webp")
    expect(pub(heroPoster("720"))).toBe(true)
    expect(pub(heroPoster("1080"))).toBe(true)
    expect(h).toMatch(/<source media="\(max-width: 760px\)" srcSet="\/custom-sites\/cleanyzer\/neon\/hero-poster-720\.webp"/i)
    expect(h).toMatch(/<img[^>]*src="\/custom-sites\/cleanyzer\/neon\/hero-poster-1080\.webp"[^>]*>/)
    expect(h).not.toMatch(/hero-(arrivee|boucle)-poster/)
    expect(pub("/custom-sites/cleanyzer/neon/hero-arrivee-poster.webp")).toBe(false)
    expect(pub("/custom-sites/cleanyzer/neon/hero-boucle-poster.webp")).toBe(false)
  })

  it("vidéos arrivée/boucle 720 et 1080 présentes", () => {
    for (const w of [390, 1366]) {
      const s = heroVideoSources(w, false)!
      expect(pub(s.arrivee)).toBe(true)
      expect(pub(s.boucle)).toBe(true)
    }
  })

  it("le titre et les boutons restent en HTML", () => {
    expect(h).toMatch(/<h1[^>]*>Nettoyage auto/)
    expect(h).toContain(">CLEANYZER<")
    expect(h).toContain("Réserver mon nettoyage")
  })
})
