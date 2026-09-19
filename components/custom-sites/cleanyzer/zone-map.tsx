"use client"

/**
 * Carte interactive de la zone d'intervention CLEANYZER (cahier §9, §11).
 *
 * RÈGLE MÉTIER (validée par Tom) : la zone incluse est un RAYON de 20 km à
 * l'aller autour d'Annecy (40 km A/R inclus), et NON une liste fermée de
 * communes. On matérialise donc un cercle de 20 km centré sur Annecy — aucune
 * commune n'est affichée comme « validée » individuellement. Au-delà du cercle :
 * 1 €/km supplémentaire A/R (affiché dans la section).
 *
 * Implémentation : Leaflet + tuiles OpenStreetMap (aucune clé API, pas de secret
 * exposé côté client). Initialisation dans un effet après montage pour éviter
 * tout accès à `window` côté serveur. Le zoom molette est désactivé pour ne pas
 * piéger le scroll de la page (activable via les boutons +/-).
 *
 * L'architecture reste prête pour des pages locales validées : la logique de
 * zone est isolée ici et dans `content.ts` (TRAVEL.annecy / rayon).
 */

import { useEffect, useRef } from "react"
import "leaflet/dist/leaflet.css"
import { TRAVEL } from "./content"

const RADIUS_M = TRAVEL.includedKmOneWay * 1000 // 20 km inclus à l'aller

export function CleanyzerZoneMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: import("leaflet").Map | null = null
    let cancelled = false

    // Import dynamique : Leaflet accède au DOM, on le charge donc côté client.
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return

      map = L.map(containerRef.current, {
        center: [TRAVEL.annecy.lat, TRAVEL.annecy.lng],
        zoom: 10,
        scrollWheelZoom: false,
        attributionControl: true,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      // Cercle de zone incluse (20 km) aux couleurs CLEANYZER.
      const circle = L.circle([TRAVEL.annecy.lat, TRAVEL.annecy.lng], {
        radius: RADIUS_M,
        color: "#0A84FF",
        weight: 2,
        fillColor: "#0A84FF",
        fillOpacity: 0.12,
      }).addTo(map)

      // Marqueur central (Annecy) sans icône image pour éviter les assets manquants.
      L.circleMarker([TRAVEL.annecy.lat, TRAVEL.annecy.lng], {
        radius: 6,
        color: "#0A84FF",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip("Annecy — zone incluse : 20 km à l'aller", {
          direction: "top",
          offset: [0, -6],
        })

      // Cadre la vue sur le cercle avec une marge.
      map.fitBounds(circle.getBounds(), { padding: [24, 24] })
    })

    return () => {
      cancelled = true
      if (map) map.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Carte de la zone d'intervention CLEANYZER : rayon de ${TRAVEL.includedKmOneWay} km à l'aller autour d'Annecy`}
      className="clz-zone-map h-full min-h-[320px] w-full"
    />
  )
}
