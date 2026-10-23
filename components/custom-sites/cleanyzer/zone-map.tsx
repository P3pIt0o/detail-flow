"use client"

/**
 * Carte de la zone CLEANYZER (L28 : fond bleu 2D avec vrai relief et vraies routes).
 *  - MapLibre GL chargé à la demande depuis jsDelivr (aucune dépendance npm),
 *    seulement quand la carte approche de l'écran.
 *  - Relief : tuiles Terrarium publiques (AWS Terrain Tiles), en ombrage.
 *    Routes et lacs : tuiles vectorielles OpenFreeMap (données OpenStreetMap).
 *    Style entièrement bleu (palette Cleanyzer), aucune clé.
 *  - Vue figée : ni zoom, ni rotation, ni inclinaison, ni déplacement.
 *    Seuls les repères de communes sont cliquables (boutons, clavier).
 *  - Cercle INDICATIF de 20 km centré sur Choisy, animé à l'apparition
 *    (respecte prefers-reduced-motion). Purement visuel : aucun effet sur les frais.
 *  - Repli : si MapLibre ne se charge pas (réseau, WebGL absent), carte Leaflet
 *    sur fond bleu sans tuiles, comme avant L28.
 *  - Contrôlée : `selected` + `onSelect` (l'état vit dans <CleanyzerZoneModule />).
 */

import { useEffect, useRef } from "react"
import "leaflet/dist/leaflet.css"
import { ZONE, ZONE_COMMUNES, type ZoneCommune } from "./zones"

type Props = { selected: string; onSelect: (slug: string) => void }

const BLUE = "#0A84FF"
const MAPLIBRE_CDN = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist"
const OSM_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
const RELIEF_ATTRIBUTION = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Relief : AWS Terrain Tiles</a>'

/** Vue figée : une seule échelle, donc seuls les noms principaux (et la commune choisie) sont affichés. */
function markerHtml(c: ZoneCommune, active: boolean): string {
  const cls = ["clz-zm-pin", c.status === "base" ? "is-base" : "is-incluse", active ? "is-active" : ""].join(" ")
  const label = c.major || active ? `<span class="clz-zm-label">${c.name}</span>` : ""
  return `<span class="${cls}"><span class="clz-zm-dot"></span>${c.status === "base" ? '<span class="clz-zm-pulse"></span>' : ""}${label}</span>`
}

/** Cercle géodésique (approximation sphérique, largement suffisante à 20 km). */
function circleRing(km: number, steps = 96): [number, number][] {
  const { lat, lng } = ZONE.base
  const dLat = km / 111.32
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]
  })
}

const circleFeature = (km: number) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Polygon" as const, coordinates: [circleRing(km)] },
})

/** Fait grandir le cercle de 0 à 20 km (ou directement 20 km si mouvement réduit). */
function animateRadius(setKm: (km: number) => void, reduce: boolean, onFrame: (id: number) => void) {
  if (reduce) return setKm(ZONE.visualRadiusKm)
  const t0 = performance.now()
  const grow = (t: number) => {
    const p = Math.min(1, (t - t0) / 1100)
    setKm(ZONE.visualRadiusKm * (1 - Math.pow(1 - p, 3)))
    if (p < 1) onFrame(requestAnimationFrame(grow))
  }
  onFrame(requestAnimationFrame(grow))
}

const loaded = new Map<string, Promise<void>>()
function addAsset(url: string) {
  let p = loaded.get(url)
  if (!p) {
    p = new Promise<void>((ok, ko) => {
      const css = url.endsWith(".css")
      const el = css ? Object.assign(document.createElement("link"), { rel: "stylesheet", href: url }) : Object.assign(document.createElement("script"), { src: url, async: true })
      el.onload = () => ok()
      el.onerror = () => {
        loaded.delete(url)
        el.remove()
        ko(new Error(url))
      }
      document.head.appendChild(el)
    })
    loaded.set(url, p)
  }
  return p
}

// Style entièrement bleu, 2D. Couleurs dérivées du fond de carte d'origine (#061a3a / #0b3a78).
const MAP_STYLE = {
  version: 8,
  sources: {
    omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 13,
      attribution: RELIEF_ATTRIBUTION,
    },
  },
  layers: [
    { id: "fond", type: "background", paint: { "background-color": "#061a3a" } },
    {
      id: "relief",
      type: "hillshade",
      source: "dem",
      paint: {
        "hillshade-exaggeration": 0.55,
        "hillshade-shadow-color": "#020814",
        "hillshade-highlight-color": "#1f63b8",
        "hillshade-accent-color": "#041430",
        "hillshade-illumination-direction": 315,
      },
    },
    { id: "eau", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#0a2f63", "fill-opacity": 0.9 } },
    {
      id: "routes-secondaires",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      paint: { "line-color": "#3d8de6", "line-opacity": 0.35, "line-width": 0.7 },
    },
    {
      id: "routes-principales",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
      paint: { "line-color": "#6fb6ff", "line-opacity": 0.7, "line-width": 1.3 },
    },
  ],
}

type MapHandle = { select: (slug: string) => void; destroy: () => void }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function initMapLibre(container: HTMLElement, maplibregl: any, onSelect: (slug: string) => void, reduce: boolean): MapHandle {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE,
    center: [ZONE.viewCenter.lng, ZONE.viewCenter.lat],
    zoom: 9,
    pitch: 0,
    bearing: 0,
    maxPitch: 0,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: OSM_ATTRIBUTION }))

  let raf = 0
  const ring = (km: number) => circleFeature(km)
  map.on("load", () => {
    map.addSource("zone", { type: "geojson", data: ring(reduce ? ZONE.visualRadiusKm : 0.01) })
    map.addSource("reperes", { type: "geojson", data: { type: "FeatureCollection", features: [5, 10, 15].map(ring) } })
    map.addLayer({ id: "reperes", type: "line", source: "reperes", paint: { "line-color": "#ffffff", "line-opacity": 0.08, "line-width": 1 } })
    map.addLayer({ id: "zone-fond", type: "fill", source: "zone", paint: { "fill-color": BLUE, "fill-opacity": 0.08 } })
    map.addLayer({ id: "zone-bord", type: "line", source: "zone", paint: { "line-color": BLUE, "line-width": 2, "line-dasharray": [4, 3] } })
    animateRadius((km) => map.getSource("zone")?.setData(ring(km)), reduce, (id) => (raf = id))
  })

  const km = document.createElement("span")
  km.className = "clz-zm-km"
  km.textContent = `${ZONE.visualRadiusKm} km`
  new maplibregl.Marker({ element: km, anchor: "top" })
    .setLngLat([ZONE.base.lng, ZONE.base.lat - ZONE.visualRadiusKm / 111.32 - 0.004])
    .addTo(map)

  const pins = new Map<string, HTMLButtonElement>()
  for (const c of ZONE_COMMUNES) {
    const el = document.createElement("button")
    el.type = "button"
    el.className = "clz-zm-icon"
    el.setAttribute("aria-label", `Sélectionner ${c.name}`)
    el.title = c.name
    el.addEventListener("click", () => onSelect(c.slug))
    pins.set(c.slug, el)
    new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map)
  }

  return {
    select: (slug) => {
      for (const c of ZONE_COMMUNES) {
        const el = pins.get(c.slug)!
        el.innerHTML = markerHtml(c, c.slug === slug)
        el.style.zIndex = c.slug === slug ? "3" : c.status === "base" ? "2" : "1"
        el.setAttribute("aria-pressed", String(c.slug === slug))
      }
    },
    destroy: () => {
      cancelAnimationFrame(raf)
      map.remove()
    },
  }
}

/** Repli : la carte d'avant L28 (Leaflet, fond bleu en CSS, sans tuiles tierces), figée elle aussi. */
async function initLeaflet(container: HTMLElement, onSelect: (slug: string) => void, reduce: boolean): Promise<MapHandle> {
  const L = await import("leaflet")
  const map = L.map(container, {
    center: [ZONE.viewCenter.lat, ZONE.viewCenter.lng],
    zoom: 10,
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
  })
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')
  map.attributionControl.addAttribution("Carte illustrative — positions approximatives")
  for (const km of [5, 10, 15]) {
    L.circle([ZONE.base.lat, ZONE.base.lng], { radius: km * 1000, color: "#ffffff", opacity: 0.08, weight: 1, fill: false, interactive: false }).addTo(map)
  }
  const circle = L.circle([ZONE.base.lat, ZONE.base.lng], {
    radius: 0,
    color: BLUE,
    weight: 2,
    dashArray: "8 6",
    fillColor: BLUE,
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map)
  let raf = 0
  animateRadius((km) => circle.setRadius(km * 1000), reduce, (id) => (raf = id))
  L.tooltip({ permanent: true, direction: "bottom", className: "clz-zm-km", offset: [0, 0] })
    .setLatLng([ZONE.base.lat - ZONE.visualRadiusKm / 111.32 - 0.004, ZONE.base.lng])
    .setContent(`${ZONE.visualRadiusKm} km`)
    .addTo(map)
  const markers = new Map<string, ReturnType<typeof L.marker>>()
  for (const c of ZONE_COMMUNES) {
    const m = L.marker([c.lat, c.lng], {
      icon: L.divIcon({ className: "clz-zm-icon", html: "", iconSize: [0, 0] }),
      keyboard: true,
      title: c.name,
      alt: `Sélectionner ${c.name}`,
    })
      .on("click", () => onSelect(c.slug))
      .addTo(map)
    markers.set(c.slug, m)
  }
  return {
    select: (slug) => {
      for (const c of ZONE_COMMUNES) {
        const active = c.slug === slug
        markers.get(c.slug)!.setIcon(L.divIcon({ className: "clz-zm-icon", html: markerHtml(c, active), iconSize: [0, 0] }))
        markers.get(c.slug)!.setZIndexOffset(active ? 1000 : c.status === "base" ? 500 : 0)
      }
    },
    destroy: () => {
      cancelAnimationFrame(raf)
      map.remove()
    },
  }
}

export function CleanyzerZoneMap({ selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MapHandle | null>(null)
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selected)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Initialisation (une seule fois), quand la carte approche de l'écran.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pick = (slug: string) => onSelectRef.current(slug)

    const ready = (h: MapHandle) => {
      if (cancelled) return h.destroy()
      handleRef.current = h
      h.select(selectedRef.current)
    }
    const fallback = () => {
      if (cancelled) return
      handleRef.current?.destroy()
      handleRef.current = null
      initLeaflet(container, pick, reduce).then(ready)
    }
    const boot = () => {
      Promise.all([addAsset(`${MAPLIBRE_CDN}/maplibre-gl.css`), addAsset(`${MAPLIBRE_CDN}/maplibre-gl.js`)])
        .then(() => {
          if (cancelled) return
          // Sans WebGL, le constructeur de MapLibre lève une erreur → repli Leaflet.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ready(initMapLibre(container, (window as any).maplibregl, pick, reduce))
        })
        .catch(fallback)
    }

    let io: IntersectionObserver | null = null
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return
          io?.disconnect()
          boot()
        },
        { rootMargin: "300px 0px" },
      )
      io.observe(container)
    } else boot()

    return () => {
      cancelled = true
      io?.disconnect()
      handleRef.current?.destroy()
      handleRef.current = null
    }
  }, [])

  // Sélection pilotée de l'extérieur (vue figée : on met en avant le repère, sans déplacer la carte).
  useEffect(() => {
    selectedRef.current = selected
    handleRef.current?.select(selected)
  }, [selected])

  return (
    <div className="clz-zm">
      <div
        ref={containerRef}
        role="region"
        aria-label={`Carte indicative de la zone d'intervention CLEANYZER : ${ZONE.visualRadiusKm} km autour de ${ZONE.base.label}, Annecy et alentours`}
        className="clz-zone-map"
      />
    </div>
  )
}
