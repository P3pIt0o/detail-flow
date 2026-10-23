import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  dragPosition,
  releaseStop,
  stepTo,
  stopProgress,
  swipeStops,
} from "@/components/custom-sites/cleanyzer/visit-3d-swipe"
import { clampPct } from "@/components/custom-sites/cleanyzer/compare-slider"
import { CLZ_TESTIMONIALS, verifiedTestimonials } from "@/components/custom-sites/cleanyzer/content"
import { ZONE } from "@/components/custom-sites/cleanyzer/zones"
import { TILE_TIMEOUT_MS, tileFailure } from "@/components/custom-sites/cleanyzer/zone-map"

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")
const CLZ = "components/custom-sites/cleanyzer"

// Ordre réel des images clés de la visite (visit-3d.tsx) : intro, 4 zones ext., transition, 4 zones int., final.
const KEY_ORDER = [null, "body", "optics", "rims", "engine", null, "mats", "seats", "vents", "leather", null]

describe("L28 — 3D au glissement : étapes", () => {
  const stops = swipeStops(KEY_ORDER)

  it("une étape par zone + intro + choix final, sans la transition intérieure", () => {
    expect(stops).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10])
  })

  it("navigation par flèches/points bornée", () => {
    expect(stepTo(0, -1, stops.length)).toBe(0)
    expect(stepTo(0, 1, stops.length)).toBe(1)
    expect(stepTo(stops.length - 1, 1, stops.length)).toBe(stops.length - 1)
  })

  it("glisser vers la gauche avance, vers la droite recule, bornes respectées", () => {
    const n = stops.length
    expect(releaseStop(3, -200, 360, 0, n)).toBe(4)
    expect(releaseStop(3, 200, 360, 0, n)).toBe(2)
    expect(releaseStop(0, 300, 360, 0, n)).toBe(0)
    expect(releaseStop(n - 1, -300, 360, 0, n)).toBe(n - 1)
  })

  it("petit geste lent = retour à l'étape courante ; geste vif court = étape suivante (inertie)", () => {
    expect(releaseStop(3, -20, 360, 0, 10)).toBe(3)
    expect(releaseStop(3, -20, 360, -0.8, 10)).toBe(4)
    expect(releaseStop(3, 20, 360, 0.8, 10)).toBe(2)
  })

  it("un geste ne saute jamais plus d'une étape", () => {
    expect(releaseStop(3, -2000, 360, -5, 10)).toBe(4)
  })

  it("pendant le glissement la position suit le doigt et reste bornée", () => {
    expect(dragPosition(3, -180, 360, 10)).toBeCloseTo(3.5)
    expect(dragPosition(0, 500, 360, 10)).toBe(0)
    expect(dragPosition(9, -500, 360, 10)).toBe(9)
  })

  it("progression de la caméra : étape → image clé, transition interpolée", () => {
    const nk = KEY_ORDER.length
    expect(stopProgress(stops, 0, nk)).toBe(0)
    expect(stopProgress(stops, stops.length - 1, nk)).toBe(1)
    // Entre « moteur » (4) et « tapis » (6) : passe par la transition (5).
    expect(stopProgress(stops, 4.5, nk)).toBeCloseTo(5 / (nk - 1))
  })
})

describe("L28 — 3D : repli et poids", () => {
  const src = read(`${CLZ}/visit-3d.tsx`)

  it("le modèle de secours de 13,4 Mo est supprimé et plus référencé", () => {
    expect(src).not.toContain("raw-glb")
    expect(existsSync(path.join(process.cwd(), "public/custom-sites/cleanyzer/3d/porsche-911-raw-glb.wasm"))).toBe(false)
    expect(existsSync(path.join(process.cwd(), "public/custom-sites/cleanyzer/3d/porsche-911-glb.wasm"))).toBe(true)
  })

  it("bouton « Réessayer » et image de repli présents", () => {
    expect(src).toContain("Réessayer")
    expect(src).toContain("realisations/gt3rs.webp")
  })

  it("le glissement mobile ne capture pas le défilement vertical", () => {
    expect(read(`${CLZ}/visit-3d.css`)).toMatch(/touch-action:\s*pan-y/)
  })
})

describe("L28 — comparateur avant/après", () => {
  it("valeurs bornées 0–100", () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(140)).toBe(100)
    expect(clampPct(42)).toBe(42)
  })

  it("contrôle clavier natif avec aria-valuenow", () => {
    const src = read(`${CLZ}/compare-slider.tsx`)
    expect(src).toContain('type="range"')
    expect(src).toContain("aria-valuenow")
  })

  it("comparateur ISUZU dans le héros, ancienne section « Le soin en images » supprimée", () => {
    const hero = read(`${CLZ}/hero.tsx`)
    expect(hero).toContain("ClzCompareSlider")
    expect(hero).toContain("isuzu-avant.webp")
    expect(read(`${CLZ}/home-sections.tsx`)).not.toContain("RealisationsPreview")
    expect(read(`${CLZ}/home-page.tsx`)).not.toContain("RealisationsPreview")
  })

  it("le lien « Réalisations » du menu a toujours une cible", () => {
    expect(read(`${CLZ}/realisations-tom.tsx`)).toContain('id="realisations"')
  })
})

describe("L28 — témoignages", () => {
  it("exactement les trois citations validées, mot pour mot", () => {
    expect(CLZ_TESTIMONIALS.map((t) => [t.company, t.quote])).toEqual([
      ["Perrin Electric", "Une prestation soignée et un travail de qualité."],
      ["Trofeo Automobiles", "Un professionnel à la hauteur de nos besoins et de nos attentes."],
      ["Pinto Maçonnerie", "Un professionnel sérieux, à la hauteur de nos attentes."],
    ])
    expect(CLZ_TESTIMONIALS.every((t) => t.verified === true)).toBe(true)
  })

  it("aucun témoignage sans entreprise ni citation ; aucune note ; lien en https seulement", () => {
    for (const t of CLZ_TESTIMONIALS) {
      expect(t.company.trim()).not.toBe("")
      expect(t.quote.trim()).not.toBe("")
      expect(t).not.toHaveProperty("rating")
      if (t.url !== undefined) expect(t.url).toMatch(/^https:\/\//)
    }
  })

  it("seuls les témoignages vérifiés sont affichés", () => {
    const list = [...CLZ_TESTIMONIALS, { company: "Inventé", quote: "Faux avis", verified: false }]
    expect(verifiedTestimonials(list).map((t) => t.company)).not.toContain("Inventé")
  })

  it("section rendue sur l'accueil", () => {
    expect(read(`${CLZ}/home-page.tsx`)).toContain("TemoignagesSection")
    expect(read(`${CLZ}/home-sections.tsx`)).toContain("verifiedTestimonials(")
  })
})

describe("L28 — carte de zone", () => {
  const src = read(`${CLZ}/zone-map.tsx`)

  it("zone de 20 km centrée sur Choisy inchangée", () => {
    expect(ZONE.visualRadiusKm).toBe(20)
    expect(ZONE.base).toMatchObject({ label: "Choisy", lat: 45.993, lng: 6.056 })
  })

  it("MapLibre depuis jsDelivr, relief Terrarium, routes OpenFreeMap, attribution OSM", () => {
    expect(src).toContain("cdn.jsdelivr.net/npm/maplibre-gl@")
    expect(src).toContain("elevation-tiles-prod/terrarium")
    expect(src).toContain("tiles.openfreemap.org")
    expect(src).toContain("© OpenStreetMap")
    expect(src).toContain("hillshade")
  })

  it("tuiles (routes ou relief) en échec avant le premier affichage complet → repli Leaflet", () => {
    expect(tileFailure({ sourceId: "omt" }, false)).toBe(true)
    expect(tileFailure({ sourceId: "dem" }, false)).toBe(true)
    // Après un affichage complet, une tuile isolée en erreur ne fait pas basculer la carte.
    expect(tileFailure({ sourceId: "omt" }, true)).toBe(false)
    // Erreurs sans rapport avec les tuiles (cercle, repères) : pas de repli.
    expect(tileFailure({ sourceId: "zone" }, false)).toBe(false)
    expect(tileFailure({}, false)).toBe(false)
    expect(TILE_TIMEOUT_MS).toBeGreaterThan(0)
    expect(src).toContain('map.on("error"')
  })

  it("crédit OpenMapTiles exigé par OpenFreeMap", () => {
    expect(src).toContain("© OpenMapTiles")
  })

  it("aucune interaction de carte (zoom, rotation, inclinaison, déplacement)", () => {
    for (const opt of ["interactive: false", "pitch: 0"]) expect(src).toContain(opt)
    expect(src).not.toContain('aria-label="Zoomer"')
  })
})
