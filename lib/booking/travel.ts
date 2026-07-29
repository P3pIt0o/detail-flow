/**
 * ============================================================================
 *  MOTEUR DE FRAIS DE DÉPLACEMENT (100 % SERVEUR)
 * ============================================================================
 *  1. Géocode l'adresse client (et l'adresse pro si non enregistrée).
 *  2. Calcule la distance routière réelle (aller simple).
 *  3. Applique la distance gratuite, le prix/km et l'aller-retour.
 *
 *  Fournisseur par défaut : Géoplateforme (IGN / gouvernement français).
 *  Gratuit, sans clé API, adapté aux adresses françaises.
 *    - Géocodage : https://data.geopf.fr/geocodage/search
 *    - Itinéraire : https://data.geopf.fr/navigation/itineraire
 *
 *  Pour couvrir d'autres pays ou passer sur un autre fournisseur (Google
 *  Maps, Mapbox…), il suffit de remplacer geocode()/routeDistanceKm().
 *  L'interface publique de ce module (computeTravel) ne change pas.
 * ============================================================================
 */

import "server-only"
import type { Settings } from "./queries"
import type { TravelResult } from "./types"

const GEO_SEARCH = "https://data.geopf.fr/geocodage/search"
const GEO_ROUTE = "https://data.geopf.fr/navigation/itineraire"

type Coords = { lat: number; lng: number }

/** Géocode une adresse en coordonnées. Renvoie null si introuvable. */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  return geocode(address)
}

/** Géocode une adresse en coordonnées. Renvoie null si introuvable. */
async function geocode(address: string): Promise<Coords | null> {
  const url = `${GEO_SEARCH}?q=${encodeURIComponent(address)}&limit=1`
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>
    }
    const coords = data.features?.[0]?.geometry?.coordinates
    if (!coords) return null
    // GeoJSON = [longitude, latitude]
    return { lat: coords[1], lng: coords[0] }
  } catch {
    return null
  }
}

/** Distance routière (km, aller simple) entre deux points. null si échec. */
async function routeDistanceKm(from: Coords, to: Coords): Promise<number | null> {
  const url =
    `${GEO_ROUTE}?resource=bdtopo-osrm` +
    `&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}` +
    `&profile=car&optimization=fastest&geometryFormat=geojson`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = (await res.json()) as { distance?: number; distanceUnit?: string }
    if (typeof data.distance !== "number") return null
    // La distance est renvoyée en mètres par défaut.
    const meters = data.distanceUnit === "kilometer" ? data.distance * 1000 : data.distance
    return meters / 1000
  } catch {
    return null
  }
}

/** Résout les coordonnées du point de départ (pro). */
async function getBusinessCoords(settings: Settings): Promise<Coords | null> {
  if (settings.businessLat && settings.businessLng) {
    return { lat: Number.parseFloat(settings.businessLat), lng: Number.parseFloat(settings.businessLng) }
  }
  if (settings.businessAddress) return geocode(settings.businessAddress)
  return null
}

/**
 * Calcule les frais de déplacement pour une adresse client.
 * Ne lève jamais : renvoie toujours un TravelResult avec ok/error.
 */
export async function computeTravel(address: string, settings: Settings): Promise<TravelResult> {
  const base: TravelResult = {
    ok: false,
    address,
    lat: null,
    lng: null,
    distanceKm: 0,
    billedDistanceKm: 0,
    feeCents: 0,
  }

  const clean = address.trim()
  if (clean.length < 5) return { ...base, error: "address_not_found" }

  const [from, to] = await Promise.all([getBusinessCoords(settings), geocode(clean)])

  if (!to) return { ...base, error: "address_not_found" }
  if (!from) return { ...base, error: "route_failed" }

  const distanceKm = await routeDistanceKm(from, to)
  if (distanceKm === null) return { ...base, lat: to.lat, lng: to.lng, error: "route_failed" }

  const maxKm = Number.parseFloat(settings.maxDistanceKm)
  if (maxKm > 0 && distanceKm > maxKm) {
    return { ...base, lat: to.lat, lng: to.lng, distanceKm, error: "out_of_range" }
  }

  const freeKm = Number.parseFloat(settings.freeDistanceKm)
  const chargeableOneWay = Math.max(0, distanceKm - freeKm)
  const billedDistanceKm = settings.roundTrip ? chargeableOneWay * 2 : chargeableOneWay
  const feeCents = Math.round(billedDistanceKm * settings.pricePerKmCents)

  return {
    ok: true,
    address: clean,
    lat: to.lat,
    lng: to.lng,
    distanceKm: Math.round(distanceKm * 10) / 10,
    billedDistanceKm: Math.round(billedDistanceKm * 10) / 10,
    feeCents,
  }
}
