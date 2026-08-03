/**
 * ============================================================================
 *  MOTEUR DE FRAIS DE DÉPLACEMENT (100 % SERVEUR)
 * ============================================================================
 *  1. Géocode l'adresse client (et l'adresse pro si non enregistrée).
 *  2. Calcule la distance routière réelle (aller simple).
 *  3. Applique la distance gratuite, le prix/km et l'aller-retour.
 *
 *  Fournisseur de géocodage : Nominatim (OpenStreetMap). Gratuit, sans clé API,
 *  et surtout COUVRE LA FRANCE ET LA SUISSE (et les adresses transfrontalières).
 *  On restreint aux pays fr,ch pour éviter les faux positifs. L'ancien
 *  fournisseur IGN (Géoplateforme) ne couvrait que la France : une adresse
 *  suisse y était mal géocodée vers une rue française homonyme (ex. « Rue de
 *  Zürich, Strasbourg »), d'où des distances fausses ou des refus.
 *
 *  Fournisseur d'itinéraire : OSRM (router.project-osrm.org). Distance routière
 *  RÉELLE, couvrant la France, la Suisse et les trajets transfrontaliers.
 *  Repli Haversine (à vol d'oiseau × 1,3) uniquement si OSRM est injoignable,
 *  pour ne jamais bloquer une réservation par une panne réseau ponctuelle.
 *
 *  La devise et toute la logique tarifaire (km offerts, prix/km en EUR,
 *  aller-retour, distance max) restent INCHANGÉES.
 * ============================================================================
 */

import "server-only"
import type { Settings } from "./queries"
import type { TravelResult } from "./types"

const GEO_SEARCH = "https://nominatim.openstreetmap.org/search"
const OSRM_ROUTE = "https://router.project-osrm.org/route/v1/driving"
// Nominatim exige un User-Agent identifiant l'application.
const GEO_HEADERS = { "User-Agent": "DetailFlow/1.0 (+https://detailflow.fr)" }

type Coords = { lat: number; lng: number }

/** Géocode une adresse en coordonnées. Renvoie null si introuvable. */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  return geocode(address)
}

/**
 * Géocode une adresse (France + Suisse + transfrontalier) via Nominatim.
 * Renvoie null si introuvable. Restreint aux pays fr,ch.
 */
async function geocode(address: string): Promise<Coords | null> {
  const url =
    `${GEO_SEARCH}?q=${encodeURIComponent(address)}` +
    `&format=json&limit=1&countrycodes=fr,ch&addressdetails=0`
  try {
    const res = await fetch(url, { headers: GEO_HEADERS, next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const first = data?.[0]
    if (!first?.lat || !first?.lon) return null
    const lat = Number.parseFloat(first.lat)
    const lng = Number.parseFloat(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

/** Distance à vol d'oiseau (km) — repli si le routeur est injoignable. */
function haversineKm(from: Coords, to: Coords): number {
  const R = 6371
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Distance routière RÉELLE (km, aller simple) entre deux points via OSRM.
 * Couvre FR, CH et transfrontalier. Repli Haversine × 1,3 si OSRM échoue
 * (jamais null : on ne bloque pas une réservation sur une panne réseau).
 */
async function routeDistanceKm(from: Coords, to: Coords): Promise<number | null> {
  const url = `${OSRM_ROUTE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (res.ok) {
      const data = (await res.json()) as { code?: string; routes?: Array<{ distance?: number }> }
      const meters = data.code === "Ok" ? data.routes?.[0]?.distance : undefined
      if (typeof meters === "number") return meters / 1000
    }
  } catch {
    // ignore → repli ci-dessous
  }
  // Repli : distance à vol d'oiseau majorée d'un facteur route (~1,3).
  return haversineKm(from, to) * 1.3
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
