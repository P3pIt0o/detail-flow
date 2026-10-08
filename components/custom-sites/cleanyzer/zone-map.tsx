"use client"

/**
 * Carte Leaflet de la zone CLEANYZER.
 *  - Vue centrée sur Annecy (esthétique), cercle INDICATIF centré sur Choisy.
 *  - Repère doré pulsant pour la base, points = exemples de communes du secteur.
 *  - Purement visuelle : n'intervient jamais dans le calcul des frais.
 *  - Cercle animé à l'apparition (respecte prefers-reduced-motion).
 *  - Contrôlée : `selected` + `onSelect` (l'état vit dans <CleanyzerZoneModule />).
 * Leaflet est importé dynamiquement (accès au DOM) : aucun rendu côté serveur.
 */

import { useEffect, useRef } from "react"
import "leaflet/dist/leaflet.css"
import type * as Leaflet from "leaflet"
import { ZONE, ZONE_COMMUNES, type ZoneCommune } from "./zones"

type Props = { selected: string; onSelect: (slug: string) => void }

const BLUE = "#0A84FF"


function markerHtml(c: ZoneCommune, active: boolean, showLabel: boolean): string {
  const cls = ["clz-zm-pin", c.status === "base" ? "is-base" : "is-incluse", active ? "is-active" : ""].join(" ")
  const label = showLabel || active ? `<span class="clz-zm-label">${c.name}</span>` : ""
  return `<span class="${cls}"><span class="clz-zm-dot"></span>${c.status === "base" ? '<span class="clz-zm-pulse"></span>' : ""}${label}</span>`
}

export function CleanyzerZoneMap({ selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const LRef = useRef<typeof Leaflet | null>(null)
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map())
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  const selectedRef = useRef(selected)

  const refreshMarkers = () => {
    const map = mapRef.current
    const L = LRef.current
    if (!map || !L) return
    const dense = map.getZoom() < 12
    for (const c of ZONE_COMMUNES) {
      const m = markersRef.current.get(c.slug)
      if (!m) continue
      const active = c.slug === selectedRef.current
      m.setIcon(
        L.divIcon({ className: "clz-zm-icon", html: markerHtml(c, active, !dense || !!c.major), iconSize: [0, 0] }),
      )
      m.setZIndexOffset(active ? 1000 : c.status === "base" ? 500 : 0)
    }
  }

  // Initialisation (une seule fois)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    let observer: IntersectionObserver | null = null

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return
      LRef.current = L
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

      const map = L.map(containerRef.current, {
        center: [ZONE.viewCenter.lat, ZONE.viewCenter.lng],
        zoom: 10,
        scrollWheelZoom: false,
        zoomControl: false,
        attributionControl: true,
      })
      mapRef.current = map

      // Pas de tuiles tierces : les basemaps CARTO renvoyaient un filigrane
      // « API KEY » (usage non autorisé sans licence). Fond bleu nuit en CSS
      // (.clz-zone-map), rendu 100 % local — aucune clé, aucun abonnement.
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')
      map.attributionControl.addAttribution("Carte illustrative — positions approximatives")
      map.setMinZoom(9)
      map.setMaxZoom(14)

      const radius = ZONE.visualRadiusKm * 1000
      for (const km of [5, 10, 15]) {
        L.circle([ZONE.base.lat, ZONE.base.lng], {
          radius: km * 1000,
          color: "#ffffff",
          opacity: 0.08,
          weight: 1,
          fill: false,
          interactive: false,
        }).addTo(map)
      }
      const circle = L.circle([ZONE.base.lat, ZONE.base.lng], {
        radius: reduce ? radius : 0,
        color: BLUE,
        weight: 2,
        dashArray: "8 6",
        fillColor: BLUE,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map)

      L.tooltip({ permanent: true, direction: "bottom", className: "clz-zm-km", offset: [0, 0] })
        .setLatLng([ZONE.base.lat - radius / 111_320 - 0.004, ZONE.base.lng])
        .setContent(`${ZONE.visualRadiusKm} km`)
        .addTo(map)

      for (const c of ZONE_COMMUNES) {
        const m = L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className: "clz-zm-icon", html: "", iconSize: [0, 0] }),
          keyboard: true,
          title: c.name,
          alt: `Sélectionner ${c.name}`,
        })
          .on("click", () => onSelectRef.current(c.slug))
          .addTo(map)
        markersRef.current.set(c.slug, m)
      }
      map.on("zoomend", refreshMarkers)
      refreshMarkers()

      // Animation d'apparition du cercle
      if (!reduce && "IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return
            observer?.disconnect()
            const t0 = performance.now()
            const grow = (t: number) => {
              const p = Math.min(1, (t - t0) / 1100)
              circle.setRadius(radius * (1 - Math.pow(1 - p, 3)))
              if (p < 1) raf = requestAnimationFrame(grow)
            }
            raf = requestAnimationFrame(grow)
          },
          { threshold: 0.35 },
        )
        observer.observe(containerRef.current)
      } else {
        circle.setRadius(radius)
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
      markersRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sélection pilotée de l'extérieur
  useEffect(() => {
    const changed = selectedRef.current !== selected
    selectedRef.current = selected
    refreshMarkers()
    const map = mapRef.current
    const c = ZONE_COMMUNES.find((x) => x.slug === selected)
    if (changed && map && c) {
      map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 12), { duration: 0.8 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const zoom = (d: number) => mapRef.current?.setZoom((mapRef.current?.getZoom() ?? 10) + d)
  const reset = () => mapRef.current?.flyTo([ZONE.viewCenter.lat, ZONE.viewCenter.lng], 10, { duration: 0.8 })

  return (
    <div className="clz-zm">
      <div
        ref={containerRef}
        role="region"
        aria-label={`Carte indicative de la zone d'intervention CLEANYZER autour de ${ZONE.base.label}, Annecy et alentours`}
        className="clz-zone-map"
      />
      <div className="clz-zm-controls">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoomer">+</button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Dézoomer">−</button>
        <button type="button" onClick={reset} aria-label="Recentrer la carte">◎</button>
      </div>
    </div>
  )
}
