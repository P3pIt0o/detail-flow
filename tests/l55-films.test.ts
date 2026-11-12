import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { FILM_SEQUENCES, JOURNEY_ZONES, filmIndex } from "@/components/custom-sites/cleanyzer/journey"

/** L55 — films par prestation : nouvelles bandes, 8 séquences. */

const ROOT = process.cwd()
const FILM = path.join(ROOT, "public/custom-sites/cleanyzer/film")

describe("L55 — séquences du film", () => {
  it("8 séquences dans l'ordre, clips et nombre de bandes de la fiche", () => {
    expect(FILM_SEQUENCES.map((s) => [s.id, s.clip, s.strips])).toEqual([
      ["exterieur", "lavage", 8],
      ["jantes", "jantes", 8],
      ["optiques", "optiques", 8],
      ["habitacle", "habitacle", 6],
      ["sieges", "sieges911", 6],
      ["tapis", "tapis911", 4],
      ["moteur", "moteur911", 6],
      ["diamond", "porsche911", 6],
    ])
  })

  it("chaque bande `${clip}_${n}.webp` existe", () => {
    for (const s of FILM_SEQUENCES)
      for (let n = 1; n <= s.strips; n++) expect(existsSync(path.join(FILM, `${s.clip}_${n}.webp`)), `${s.clip}_${n}`).toBe(true)
  })

  it("plus aucune ancienne bande (fichiers ni références)", () => {
    const old = /^(mousse|tapis|audi|volant|moteur|macan)_\d+\.webp$/
    expect(readdirSync(FILM).filter((f) => old.test(f))).toEqual([])
    const src = readFileSync(path.join(ROOT, "components/custom-sites/cleanyzer/journey.ts"), "utf8")
    expect(src).not.toMatch(/clip: "(mousse|tapis|audi|volant|moteur|macan)"/)
  })

  it("jantes et optiques reliées à leurs zones ; les étapes du film suivent l'ordre des séquences", () => {
    expect(FILM_SEQUENCES[filmIndex("jantes")].zone).toBe("rims")
    expect(FILM_SEQUENCES[filmIndex("optiques")].zone).toBe("optics")
    expect(JOURNEY_ZONES.rims.film).toBe("jantes")
    expect(JOURNEY_ZONES.optics.film).toBe("optiques")
    const film = readFileSync(path.join(ROOT, "components/custom-sites/cleanyzer/prestations-film.tsx"), "utf8")
    const order = [...film.matchAll(/\.\.\.seq\("(\w+)"\)/g)].map((m) => m[1])
    expect(order).toEqual(FILM_SEQUENCES.map((s) => s.id))
  })

  it("optiques : bouton vers la page optiques", () => {
    expect(FILM_SEQUENCES[filmIndex("optiques")].action.href).toBe("/p/cleanyzer/prestations/renovation-optiques-phares-annecy")
  })
})

describe("L55 — plus de vestige « 3D » dans le film", () => {
  it("la classe des liens vers la visite ne s'appelle plus clz-film-3d", () => {
    const dir = path.join(process.cwd(), "components/custom-sites/cleanyzer")
    for (const f of ["prestations-film.tsx", "prestations-film.css"]) {
      const src = readFileSync(path.join(dir, f), "utf8")
      expect(src).not.toContain("clz-film-3d")
      expect(src).toContain("clz-film-visit")
    }
  })
})
