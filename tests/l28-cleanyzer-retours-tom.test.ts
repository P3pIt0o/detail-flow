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
import { AVANT_APRES_PAIRS, ISUZU_PAIR, PAIRS, pairSrc } from "@/components/custom-sites/cleanyzer/realisations-tom"
import { CLZ_TESTIMONIALS, verifiedTestimonials } from "@/components/custom-sites/cleanyzer/content"
import { ZONE } from "@/components/custom-sites/cleanyzer/zones"
import { OVERVIEW_ZOOM, TILE_TIMEOUT_MS, labelsToShow, markerHtml, overviewZoom, tileFailure, viewFor } from "@/components/custom-sites/cleanyzer/zone-map"
import { INITIAL_SELECTION, nextSelection } from "@/components/custom-sites/cleanyzer/zone-module"
import { ZONE_COMMUNES } from "@/components/custom-sites/cleanyzer/zones"

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

  it("aucun comparateur dans le héros (vidéo seule) ; ancienne section « Le soin en images » supprimée", () => {
    const hero = read(`${CLZ}/hero.tsx`)
    expect(hero).not.toContain("ClzCompareSlider")
    expect(hero).not.toContain("isuzu")
    expect(read(`${CLZ}/home-sections.tsx`)).not.toContain("RealisationsPreview")
    expect(read(`${CLZ}/home-page.tsx`)).not.toContain("RealisationsPreview")
  })

  it("la section avant/après est la première section sous le héros", () => {
    const page = read(`${CLZ}/home-page.tsx`)
    const order = [...page.matchAll(/^\s*<(\w+) \/>$/gm)].map((m) => m[1])
    expect(order.slice(0, 3)).toEqual(["CleanyzerHero", "AvantApresSection", "UniversSection"])
    // La galerie reste à sa place (après le film des prestations).
    expect(order.indexOf("RealisationsTom")).toBe(order.indexOf("PrestationsFilm") + 1)
  })

  it("avant/après : ISUZU intérieur puis les 3 paires de Tom, grille 2 × 2 sur ordinateur, empilée sur mobile", () => {
    expect(AVANT_APRES_PAIRS.map((p) => p.before)).toEqual([ISUZU_PAIR.before, "phare-avant-1", "phare-avant-2", "siege-avant"])
    expect(ISUZU_PAIR).toMatchObject({ title: "Nettoyage intérieur", detail: "Sièges, tapis, plastiques et recoins", kind: "interieur" })
    expect(pairSrc(ISUZU_PAIR.before)).toBe("/custom-sites/cleanyzer/isuzu-avant.webp")
    const src = read(`${CLZ}/realisations-tom.tsx`)
    const start = src.indexOf("export function AvantApresSection")
    const body = src.slice(start, src.indexOf("\n}\n", start))
    expect(body).toContain('id="avant-apres"')
    expect(body).toContain("grid gap-8 md:grid-cols-2")
    expect(body).not.toMatch(/(md|lg):grid-cols-[34]/)
  })

  it("les pages prestations gardent leurs paires (ISUZU absente de PAIRS)", () => {
    expect(PAIRS.map((p) => p.before)).toEqual(["phare-avant-1", "phare-avant-2", "siege-avant"])
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

describe("L28 avenant — logos, comparateur pleine largeur, carte", () => {
  it("chaque témoignage a un logo autorisé présent dans public/", () => {
    expect(CLZ_TESTIMONIALS.map((t) => t.logo)).toEqual([
      "/custom-sites/cleanyzer/temoignages/perrin-electric.png",
      "/custom-sites/cleanyzer/temoignages/trofeo-automobiles.png",
      "/custom-sites/cleanyzer/temoignages/pinto-maconnerie.png",
    ])
    for (const t of CLZ_TESTIMONIALS) expect(existsSync(path.join(process.cwd(), "public", t.logo!))).toBe(true)
  })

  it("témoignages : logo, 3 colonnes sur ordinateur, défilement horizontal accroché sur mobile, sans étoile", () => {
    const sec = read(`${CLZ}/home-sections.tsx`)
    const start = sec.indexOf("export function TemoignagesSection")
    const body = sec.slice(start, sec.indexOf("\n}\n", start))
    expect(body).toContain("t.logo")
    expect(body).toContain("snap-x")
    expect(body).toContain("md:grid-cols-3")
    expect(body).not.toContain("Star")
  })

  it("plus aucun style de comparateur de héros", () => {
    expect(read(`${CLZ}/cleanyzer.css`)).not.toContain("clz-hero-cmp")
  })

  it("tous les points de communes sont rendus, chacun avec son nom (affiché ou au survol)", () => {
    for (const c of ZONE_COMMUNES) expect(markerHtml(c, false)).toContain(`>${c.name}<`)
  })

  // Repères projetés à l'écran (px) : nom à droite du point.
  const pt = (slug: string, x: number, y: number) => {
    const c = ZONE_COMMUNES.find((k) => k.slug === slug)!
    return { slug: c.slug, name: c.name, major: !!c.major, base: c.status === "base", x, y }
  }

  it("vue d'ensemble : seuls les noms des communes principales (+ la commune choisie)", () => {
    const pts = ZONE_COMMUNES.map((c, i) => ({ slug: c.slug, name: c.name, major: !!c.major, base: c.status === "base", x: 0, y: i * 100 }))
    const shown = labelsToShow(pts, false, null)
    expect([...shown].sort()).toEqual(ZONE_COMMUNES.filter((c) => c.major).map((c) => c.slug).sort())
    expect(labelsToShow(pts, false, "seynod").has("seynod")).toBe(true)
  })

  it("vue rapprochée : les autres noms apparaissent s'ils ont la place", () => {
    const shown = labelsToShow([pt("seynod", 0, 0), pt("meythet", 0, 200)], true, null)
    expect(shown).toEqual(new Set(["seynod", "meythet"]))
  })

  it("aucun chevauchement : en cas de collision, la commune choisie puis la base puis les principales gagnent", () => {
    // Annecy (principale) et Cran-Gevrier au même endroit : un seul nom.
    expect(labelsToShow([pt("cran-gevrier", 0, 0), pt("annecy", 5, 2)], true, null)).toEqual(new Set(["annecy"]))
    expect(labelsToShow([pt("cran-gevrier", 0, 0), pt("annecy", 5, 2)], true, "cran-gevrier")).toEqual(new Set(["cran-gevrier"]))
    expect(labelsToShow([pt("choisy", 0, 0), pt("cruseilles", 4, 0)], false, null)).toEqual(new Set(["choisy"]))
    // Le nom d'une commune secondaire ne recouvre pas le point d'une autre commune.
    expect(labelsToShow([pt("seynod", 0, 0), pt("meythet", 40, 0)], true, null)).toEqual(new Set(["meythet"]))
  })

  it("vue : commune choisie = centrée et rapprochée ; aucune = vue d'ensemble", () => {
    const overview = viewFor(null)
    expect(overview.center).toEqual([ZONE.viewCenter.lng, ZONE.viewCenter.lat])
    const seynod = ZONE_COMMUNES.find((c) => c.slug === "seynod")!
    const v = viewFor("seynod")
    expect(v.center).toEqual([seynod.lng, seynod.lat])
    expect(v.zoom).toBeGreaterThan(overview.zoom)
    expect(viewFor("inconnue")).toEqual(overview)
  })

  it("clic sur une commune = sélection + zoom ; nouveau clic sur la commune zoomée = vue d'ensemble", () => {
    const zoomed = nextSelection({ selected: "annecy", focused: true }, "annecy")
    expect(zoomed).toEqual({ selected: null, focused: false })
    expect(nextSelection({ selected: "annecy", focused: true }, "seynod")).toEqual({ selected: "seynod", focused: true })
    expect(nextSelection({ selected: null, focused: false }, "choisy")).toEqual({ selected: "choisy", focused: true })
  })

  // Retour revue-metier (MAJEUR) : au chargement Annecy est sélectionnée mais la carte n'est pas zoomée ;
  // le premier clic sur Annecy doit zoomer, pas désélectionner.
  it("premier clic sur Annecy (sélection par défaut, carte non zoomée) = zoom, pas désélection", () => {
    expect(INITIAL_SELECTION).toEqual({ selected: "annecy", focused: false })
    expect(nextSelection(INITIAL_SELECTION, "annecy")).toEqual({ selected: "annecy", focused: true })
  })

  it("au chargement : Annecy dans l'encart, carte en vue d'ensemble ; lien « Vue d'ensemble » seulement si zoomée", () => {
    const mod = read(`${CLZ}/zone-module.tsx`)
    expect(mod).toContain("useState(INITIAL_SELECTION)")
    expect(mod).toMatch(/sel\.focused && \(/)
    expect(mod).toMatch(/Vue d(&apos;|')ensemble/)
  })

  // Retour revue-metier (MAJEUR) : à 360 px le cercle de 20 km était coupé en vue d'ensemble.
  it("vue d'ensemble : le cercle de 20 km tient entièrement dans la carte, quelle que soit sa largeur", () => {
    const lat = ZONE.viewCenter.lat
    const kmLng = 111.32 * Math.cos((lat * Math.PI) / 180)
    const halfX = ZONE.visualRadiusKm + Math.abs(ZONE.base.lng - ZONE.viewCenter.lng) * kmLng
    const halfY = ZONE.visualRadiusKm + Math.abs(ZONE.base.lat - ZONE.viewCenter.lat) * 111.32
    for (const [w, h] of [[320, 336], [360, 378], [390, 410], [600, 620], [1280, 620]]) {
      const z = overviewZoom(w, h)
      const pxPerKm = (512 * 2 ** z) / (40075.017 * Math.cos((lat * Math.PI) / 180))
      expect(halfX * pxPerKm).toBeLessThanOrEqual(w / 2)
      expect(halfY * pxPerKm).toBeLessThanOrEqual(h / 2)
    }
    // Grand écran : l'échelle d'origine est conservée.
    expect(overviewZoom(1000, 1000)).toBe(OVERVIEW_ZOOM)
    expect(viewFor(null, overviewZoom(360, 378)).zoom).toBe(overviewZoom(360, 378))
  })

  it("crédits compacts (bouton « i »), sans doublon", () => {
    const src = read(`${CLZ}/zone-map.tsx`)
    expect(src).toContain("compact: true")
    expect(src).not.toContain("customAttribution")
  })
})
