/**
 * L73 — première date disponible (logique PURE : la disponibilité d'un jour est
 * injectée, aucun accès base ici). Le plafond est fixé côté serveur : jamais
 * fourni par le navigateur.
 */

import { dateWindow } from "@/lib/booking/v2"

/** Horizon maximal de recherche (identique au plafond des flèches de dates). */
export const SEARCH_MAX_DAYS = 180
/** Taille d'un paquet de jours examinés (une fenêtre de l'écran). */
export const SEARCH_PACK_DAYS = 14

/** Jours examinés en parallèle au maximum. */
export const SEARCH_CONCURRENCY = 4

export type DayLike = { date: string; available: boolean; slots: string[] }

export type FirstAvailableInput = {
  from: Date
  durationMin: number
  vehicleCount: number
  /** Disponibilité d'UN jour pour CE professionnel (résolu par la requête). */
  getDay: (date: string, durationMin: number, vehicleCount: number) => Promise<DayLike>
}

/** Paramètres valides : durée > 0 et nombre de véhicules entier ≥ 1. */
export function isValidSearch(durationMin: unknown, vehicleCount: unknown): boolean {
  return (
    typeof durationMin === "number" &&
    Number.isFinite(durationMin) &&
    durationMin > 0 &&
    typeof vehicleCount === "number" &&
    Number.isInteger(vehicleCount) &&
    vehicleCount >= 1 &&
    vehicleCount <= 50
  )
}

/** Première date (YYYY-MM-DD) avec au moins un créneau dans les 180 prochains jours, sinon null. */
export async function findFirstAvailableDate({ from, durationMin, vehicleCount, getDay }: FirstAvailableInput): Promise<string | null> {
  if (!isValidSearch(durationMin, vehicleCount)) return null
  for (let offset = 0; offset < SEARCH_MAX_DAYS; offset += SEARCH_PACK_DAYS) {
    const count = Math.min(SEARCH_PACK_DAYS, SEARCH_MAX_DAYS - offset)
    const dates = dateWindow(from, offset, count)
    // Au plus SEARCH_CONCURRENCY jours en parallèle (5 requêtes BDD chacun) : ne sature pas le pool partagé.
    for (let i = 0; i < dates.length; i += SEARCH_CONCURRENCY) {
      const days = await Promise.all(dates.slice(i, i + SEARCH_CONCURRENCY).map((d) => getDay(d, durationMin, vehicleCount)))
      const hit = days.find((d) => d.available && d.slots.length > 0)
      if (hit) return hit.date
    }
  }
  return null
}
