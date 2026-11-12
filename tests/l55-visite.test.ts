import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  KEY_ORDER,
  VISIT_FRAME_COUNT,
  VISIT_STOPS,
  VISIT_TRAVEL_MS,
  VisitVideo,
  frameAtStop,
  visitFrameSrc,
  visitIsStill,
  visitLoadOrder,
} from "@/components/custom-sites/cleanyzer/visit-video"
import { swipeStops } from "@/components/custom-sites/cleanyzer/visit-3d-swipe"
import { CLZ_VISIT_ANCHOR, JOURNEY_ZONES, ZONE_KEYS, visitDeepLink } from "@/components/custom-sites/cleanyzer/journey"

/** L55 — visite Porsche en images (remplace la 3D). */

const ROOT = process.cwd()
const CLZ = "components/custom-sites/cleanyzer"
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")

describe("L55 — arrêts de la visite", () => {
  it("ouverture + 9 zones dans l'ordre de la fiche, puis le choix final sur la dernière image", () => {
    expect(VISIT_STOPS.map((s) => [s.zone, s.frame])).toEqual([
      [null, 7],
      ["body", 31],
      ["optics", 61],
      ["rims", 91],
      ["engine", 133],
      ["entry", 168],
      ["seats", 217],
      ["mats", 257],
      ["vents", 279],
      ["leather", 313],
      [null, 331],
    ])
    expect(VISIT_FRAME_COUNT).toBe(331)
  })

  it("chaque arrêt est une étape de glissement (aucune transition sautée)", () => {
    expect(swipeStops(KEY_ORDER)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it("trajet accéléré d'environ 0,6 s ; pendant le geste l'image suit la position", () => {
    expect(VISIT_TRAVEL_MS).toBe(600)
    expect(frameAtStop(0)).toBe(7)
    expect(frameAtStop(10)).toBe(331)
    expect(frameAtStop(1.5)).toBe(46)
    expect(frameAtStop(-3)).toBe(7)
    expect(frameAtStop(42)).toBe(331)
  })

  it("chemins pc/tel f_0001…f_0331, tous présents", () => {
    expect(visitFrameSrc("pc", 1)).toBe("/custom-sites/cleanyzer/visite-video/pc/f_0001.webp")
    expect(visitFrameSrc("tel", 331)).toBe("/custom-sites/cleanyzer/visite-video/tel/f_0331.webp")
    for (const set of ["pc", "tel"] as const)
      for (let n = 1; n <= VISIT_FRAME_COUNT; n++) expect(existsSync(path.join(ROOT, "public", visitFrameSrc(set, n)))).toBe(true)
  })

  it("chargement : première image, autres arrêts, puis toutes les images une seule fois", () => {
    const order = visitLoadOrder()
    expect(order[0]).toBe(7)
    expect(order.slice(0, VISIT_STOPS.length)).toEqual(VISIT_STOPS.map((s) => s.frame))
    expect(new Set(order).size).toBe(VISIT_FRAME_COUNT)
    expect(order).toHaveLength(VISIT_FRAME_COUNT)
  })

  it("repli sans animation si mouvement réduit ou économie de données", () => {
    expect(visitIsStill(true, false)).toBe(true)
    expect(visitIsStill(false, true)).toBe(true)
    expect(visitIsStill(false, false)).toBe(false)
  })

  it("repli : seules les 11 images d'arrêt sont chargées (pas les 331)", () => {
    expect(visitLoadOrder(true)).toEqual(VISIT_STOPS.map((s) => s.frame))
  })
})

describe("L55 — zones et liens profonds", () => {
  it("zone « entry » ajoutée avec des textes existants ; ordre des zones = ordre de la visite", () => {
    expect(JOURNEY_ZONES.entry.side).toBe("int")
    expect(JOURNEY_ZONES.entry.formulas.premium).toBeTruthy()
    expect(ZONE_KEYS).toEqual(KEY_ORDER.filter(Boolean))
  })

  it("lien profond #zone=entry et ancre inchangée", () => {
    expect(visitDeepLink("entry", "x")).toBe("/p/cleanyzer#zone=entry&from=x")
    expect(CLZ_VISIT_ANCHOR).toBe("visite-3d")
  })

  it("numérotation n / 9 dans l'ordre de la vidéo (ajout 1)", () => {
    expect(ZONE_KEYS.map((k, i) => `${i + 1} ${JOURNEY_ZONES[k].name}`)).toEqual([
      "1 Carrosserie",
      "2 Optiques",
      "3 Jantes",
      "4 Moteur",
      "5 Portières & seuils",
      "6 Sièges",
      "7 Tapis",
      "8 Aérations",
      "9 Volant & commandes",
    ])
  })

  it("panneau de zone compact sur téléphone : hauteur limitée, défilable, placé en bas (ajout 2)", () => {
    const css = read(`${CLZ}/visit-video.css`)
    const mobile = css.slice(css.indexOf("@media (max-width:760px){"))
    expect(mobile).toMatch(/\.v3-card\{bottom:[^}]*max-height:[^}]*overflow-y:auto/)
  })
})

describe("L55 — rendu serveur", () => {
  const h = renderToStaticMarkup(createElement(VisitVideo))

  it("aucune image chargée au rendu serveur ; un canvas", () => {
    expect(h).toMatch(/<canvas/)
    expect(h).not.toContain("visite-video/")
    expect(h).not.toMatch(/<img/)
  })

  it("aucun « 3D » visible ni crédit du modèle", () => {
    // Texte ET attributs (aria-label) ; l'ancre technique « visite-3d » est en minuscules.
    expect(h).not.toMatch(/3D/)
    expect(h).not.toMatch(/sketchfab/i)
    expect(read(`${CLZ}/prestations-film.tsx`)).not.toMatch(/en 3D/)
    expect(read(`${CLZ}/service-page.tsx`)).not.toMatch(/3D/)
  })

  it("navigation clavier et boutons précédent/suivant en mode par arrêts ; glissement sans bloquer le défilement", () => {
    const src = read(`${CLZ}/visit-video.tsx`)
    expect(src).toContain('"ArrowRight"')
    expect(src).toContain("Étape précédente")
    expect(read(`${CLZ}/visit-video.css`)).toMatch(/touch-action:\s*pan-y/)
  })

  it("plus de Three.js ni de fichiers 3D ; l'accueil monte la visite directement", () => {
    expect(existsSync(path.join(ROOT, `${CLZ}/visit-3d.tsx`))).toBe(false)
    expect(existsSync(path.join(ROOT, `${CLZ}/visit-3d-lazy.tsx`))).toBe(false)
    expect(existsSync(path.join(ROOT, "public/custom-sites/cleanyzer/3d"))).toBe(false)
    expect(read(`${CLZ}/visit-video.tsx`)).not.toMatch(/three|<video/i)
    expect(read(`${CLZ}/home-page.tsx`)).toMatch(/from "\.\/visit-video"/)
  })
})
