import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * L66 — Cleanyzer, retouches de Tom : plus aucune section pilotée au défilement (visite et film en
 * slider), deux boutons du hero visibles sur mobile, plus d'onglets dans l'en-tête ordinateur.
 */

const nav = vi.hoisted(() => ({ pathname: "/p/cleanyzer" }))
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))

import { CLZ_TARIFS_HREF, CleanyzerHero } from "@/components/custom-sites/cleanyzer/hero"
import { PrestationsFilm, FILM_FPS, filmFrameAt } from "@/components/custom-sites/cleanyzer/prestations-film"
import { CleanyzerShell } from "@/components/custom-sites/cleanyzer/site-shell"
import { CLZ_SITE_NAV_ITEMS } from "@/components/custom-sites/cleanyzer/nav"
import { FILM_SEQUENCES, filmIndex } from "@/components/custom-sites/cleanyzer/journey"
import { EXTERIEUR_FORMULAS, INTERIEUR_FORMULAS } from "@/components/custom-sites/cleanyzer/content"
import { VisitVideo, clzNeedsReveal } from "@/components/custom-sites/cleanyzer/visit-video"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF } from "@/components/custom-sites/cleanyzer/tokens"

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/&#x27;/g, "'")

describe("L66 — visite « zone par zone » en slider partout", () => {
  const css = read(`${CLZ}/visit-video.css`)
  const src = read(`${CLZ}/visit-video.tsx`)

  it("plus de section haute ni d'étage collant : la page défile librement", () => {
    expect(css).not.toMatch(/700vh/)
    expect(css).not.toMatch(/position:\s*sticky/)
  })

  it("mode par arrêts permanent : plus de lecture du défilement ni de détection du tactile", () => {
    expect(src).not.toMatch(/addEventListener\("scroll"/)
    expect(src).not.toMatch(/pointer: coarse/)
    expect(src).not.toMatch(/window\.scrollTo\(/)
    expect(src).not.toMatch(/Faites défiler/)
  })

  it("flèches, points et clavier rendus dès le premier rendu (ordinateur compris)", () => {
    const h = html(createElement(VisitVideo))
    expect(h).toContain('aria-label="Étape précédente"')
    expect(h).toContain('aria-label="Étape suivante"')
    expect(h).toContain('aria-current="step"')
    expect(h).toContain("v3-swipe")
    expect(h).toMatch(/class="v3-stage"[^>]*tabindex="0"/)
    expect(src).toContain('"ArrowLeft"')
    expect(src).toContain('"ArrowRight"')
    expect(css).toMatch(/touch-action:\s*pan-y/)
  })

  it("ordinateur : flèches et points en bas (aperçu validé), carte et écran final remontés pour ne pas les chevaucher", () => {
    const idx = css.indexOf("@media (min-width:761px){")
    expect(idx).toBeGreaterThan(-1)
    const desk = css.slice(idx, css.indexOf("}\n}", idx) + 3)
    expect(desk).toMatch(/\.v3-steps\{[^}]*top:auto[^}]*bottom:/)
    expect(desk).toMatch(/\.v3-card\{[^}]*bottom:calc\(5\.5rem/)
    expect(desk).toMatch(/\.v3-final\{[^}]*bottom:calc\(5\.5rem/)
  })

  it("anneau « % de la visite » : rendu, visible sur ordinateur, masqué seulement sur téléphone", () => {
    expect(html(createElement(VisitVideo))).toContain("% de la visite")
    const outsideMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "")
    expect(outsideMedia).not.toMatch(/\.v3-ring\{display:none\}/)
    expect(css).toMatch(/@media \(max-width:760px\)\{\.v3-swipe \.v3-ring\{display:none\}\}/)
  })

  it("lien vers une zone : on ne fait défiler la page que si la section n'est pas déjà visible", () => {
    // Section entièrement visible : aucun défilement.
    expect(clzNeedsReveal(0, 800, 800)).toBe(false)
    expect(clzNeedsReveal(60, 860, 900)).toBe(false)
    // Section hors écran (au-dessus ou en dessous) ou à moitié visible : on l'amène à l'écran.
    expect(clzNeedsReveal(1500, 2300, 800)).toBe(true)
    expect(clzNeedsReveal(-2000, -1200, 800)).toBe(true)
    expect(clzNeedsReveal(500, 1300, 800)).toBe(true)
  })
})

describe("L66 — « Chaque étape, filmée » en slider", () => {
  const css = read(`${CLZ}/prestations-film.css`)
  const src = read(`${CLZ}/prestations-film.tsx`)
  const h = html(createElement(PrestationsFilm))

  it("plus de hauteur par étape, plus d'écouteur de défilement, plus d'étage collant", () => {
    expect(src).not.toMatch(/STEP_VH/)
    expect(src).not.toMatch(/addEventListener\("scroll"/)
    expect(src).not.toMatch(/window\.scrollTo\(/)
    expect(src).not.toMatch(/Faites défiler/)
    expect(h).not.toMatch(/style="height:\s*\d+vh/)
    expect(css).not.toMatch(/position:\s*sticky/)
  })

  it("flèches précédent / suivant, un point par étape, la première étape active", () => {
    expect(h).toContain('aria-label="Étape précédente"')
    expect(h).toContain('aria-label="Étape suivante"')
    const dots = h.match(/class="clz-film-dot"/g) ?? []
    expect(dots).toHaveLength(FILM_SEQUENCES.length)
    expect(h.match(/aria-current="step"/g)).toHaveLength(1)
    expect(src).toContain('"ArrowLeft"')
    expect(src).toContain('"ArrowRight"')
    expect(css).toMatch(/touch-action:\s*pan-y/)
    expect(h).toMatch(/class="clz-film-stage"[^>]*tabindex="0"/)
  })

  it("8 étapes, même contenu et mêmes prix (citadine par défaut)", () => {
    expect(h.match(/class="clz-film-card[ "]/g)).toHaveLength(8)
    expect(h.match(/class="clz-film-row"/g)).toHaveLength(12)
    for (const s of FILM_SEQUENCES) expect(h).toContain(`href="${s.action.href}"`)
    const prices = [
      ...["eco", "excellence"].map((k) => EXTERIEUR_FORMULAS.find((f) => f.key === k)!.prices.citadine),
      ...["premium", "eco", "excellence"].map((k) => INTERIEUR_FORMULAS.find((f) => f.key === k)!.prices.citadine),
    ]
    for (const p of prices) if (p != null) expect(h).toContain(`${p} €`)
    expect(h).toContain("Sur demande")
  })

  it("cartes inactives hors du parcours clavier", () => {
    expect(h.match(/inert=""/g)).toHaveLength(FILM_SEQUENCES.length - 1)
  })

  it("lien profond vers une étape : chaque identifiant mène à sa propre étape", () => {
    FILM_SEQUENCES.forEach((s, i) => expect(filmIndex(s.id)).toBe(i))
  })

  it("lecture en boucle de la séquence affichée ; image fixe si mouvement réduit", () => {
    expect(FILM_FPS).toBe(12)
    expect(filmFrameAt(0, 64, false)).toBe(0)
    expect(filmFrameAt(1000, 64, false)).toBe(12)
    expect(filmFrameAt(6000, 64, false)).toBe(8) // boucle : 72 images jouées → 8e de la 2e lecture
    expect(filmFrameAt(123456, 64, true)).toBe(0)
    expect(filmFrameAt(-50, 48, false)).toBe(0)
  })
})

describe("L66 — haut de page et en-tête", () => {
  it("mobile : les deux boutons du hero ne sont plus masqués, mêmes liens", () => {
    const css = read(`${CLZ}/cleanyzer.css`)
    const start = css.indexOf("@media (max-width: 760px) {\n  .cleanyzer .clz-neon-hero")
    expect(start).toBeGreaterThan(-1)
    const mobile = css.slice(start)
    expect(mobile).not.toMatch(/\.clz-neon-ctas \{ display: none; \}/)
    const h = html(createElement(CleanyzerHero))
    expect(h).toContain(`href="${CLZ_BOOKING_HREF}"`)
    expect(h).toContain(`href="${CLZ_TARIFS_HREF}"`)
    expect(h).toContain("Réserver mon nettoyage")
    expect(h).toContain("Voir les tarifs")
  })

  it("mobile : les boutons du hero ne chevauchent pas les métiers ni l'avis Google (pire cas 320 px)", () => {
    const css = read(`${CLZ}/cleanyzer.css`)
    const start = css.indexOf("@media (max-width: 760px) {\n  .cleanyzer .clz-neon-hero")
    expect(start).toBeGreaterThan(-1)
    const mobile = css.slice(start, css.indexOf("\n}", start))
    const num = (re: RegExp) => {
      const m = mobile.match(re)
      expect(m, String(re)).not.toBeNull()
      return Number(m![1])
    }
    // Hauteur minimale garantie du hero mobile, quelle que soit la hauteur d'écran (iPhone SE compris).
    const heroMin = num(/\.clz-neon-hero \{ height: clamp\((\d+)px/)
    const copyTop = num(/\.clz-neon-copy \{ top: (\d+)px/)
    const tradesBottom = num(/\.clz-neon-trades \{[^}]*bottom: calc\((\d+)px/)
    // Pire cas à 320 px, estimations hautes : titre 96px·0,86, sous-titre 10+24, trait 14+2,
    // promesse 14 + 3 lignes de 13,5px·1,45, boutons 16 + 2 lignes de 46px + 10 d'écart.
    const stack = 96 * 0.86 + (10 + 24) + (14 + 2) + (14 + 3 * 13.5 * 1.45) + (16 + 46 + 10 + 46)
    const ctasBottom = copyTop + stack
    // Métiers sur 2 lignes au pire (≈ 2 × 18px + 6px d'écart).
    const tradesTop = heroMin - tradesBottom - 42
    expect(ctasBottom + 16).toBeLessThanOrEqual(tradesTop)
  })

  it("ordinateur : plus d'onglets ; logo et les deux boutons restent ; pied de page intact", () => {
    nav.pathname = "/p/cleanyzer"
    const h = html(createElement(CleanyzerShell, { navItems: CLZ_SITE_NAV_ITEMS, immersive: true, contact: null, children: "x" }))
    expect(h).not.toContain('aria-label="Navigation principale"')
    const header = h.slice(h.indexOf("<header"), h.indexOf("</header>"))
    expect(header).toContain("— accueil")
    expect(header).toContain(`href="${CLZ_DEMANDE_HREF}"`)
    expect(header).toContain("Demande personnalisée")
    expect(header).toContain(`href="${CLZ_BOOKING_HREF}"`)
    expect(header).toContain("Réserver un nettoyage auto")
    const footer = h.slice(h.indexOf("<footer"))
    for (const item of CLZ_SITE_NAV_ITEMS) expect(footer).toContain(`href="${item.href ?? `${CLZ_HOME_HREF}#${item.id}`}"`)
    // Menu burger mobile inchangé.
    expect(read(`${CLZ}/site-shell.tsx`)).toContain('aria-label="Navigation mobile"')
  })
})

describe("L66 — aucune mention d'IA", () => {
  it("fichiers modifiés sans « IA », « Claude » ni « intelligence artificielle »", () => {
    for (const f of ["visit-video.tsx", "visit-video.css", "prestations-film.tsx", "prestations-film.css", "site-shell.tsx"]) {
      const s = read(`${CLZ}/${f}`)
      expect(s, f).not.toMatch(/\bIA\b|Claude|intelligence artificielle/)
    }
  })
})
