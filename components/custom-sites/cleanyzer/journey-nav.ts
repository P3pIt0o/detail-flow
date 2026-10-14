"use client"

/**
 * Navigation partagée Visite 3D ↔ Film ↔ pages de prestation (CLEANYZER).
 * État du parcours conservé en sessionStorage : le visiteur retrouve sa
 * dernière sélection et dispose d'un retour contextuel.
 */

import { useSyncExternalStore } from "react"
import type { FilmStepId, ZoneKey } from "./journey"

export type JourneyOrigin =
  | { kind: "visit"; zone: ZoneKey | "final" }
  | { kind: "film"; step: FilmStepId }
  | { kind: "page"; slug: string }
  | null

type State = { origin: JourneyOrigin; zone: ZoneKey | null; step: FilmStepId | null }

const KEY = "clz-journey"
const EMPTY: State = { origin: null, zone: null, step: null }
let state: State = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function read(): State {
  if (!loaded && typeof window !== "undefined") {
    loaded = true
    try {
      const raw = window.sessionStorage.getItem(KEY)
      if (raw) state = { ...EMPTY, ...JSON.parse(raw) }
    } catch {
      /* stockage indisponible */
    }
  }
  return state
}

function write(next: Partial<State>) {
  state = { ...read(), ...next }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignoré */
  }
  listeners.forEach((l) => l())
}

let filmHandler: ((step: FilmStepId) => void) | null = null
let visitHandler: ((zone: ZoneKey | "final") => void) | null = null

export function registerFilm(fn: (step: FilmStepId) => void) {
  filmHandler = fn
  return () => {
    if (filmHandler === fn) filmHandler = null
  }
}
export function registerVisit(fn: (zone: ZoneKey | "final") => void) {
  visitHandler = fn
  return () => {
    if (visitHandler === fn) visitHandler = null
  }
}

/** Ouvre la séquence exacte du film, en mémorisant d'où vient le visiteur. */
export function goFilm(step: FilmStepId, origin: JourneyOrigin) {
  write({ step, origin })
  filmHandler?.(step)
}

/** Amène la visite 3D sur une zone (ou sur le choix de formule final). */
export function goVisit(zone: ZoneKey | "final", origin: JourneyOrigin) {
  write({ zone: zone === "final" ? read().zone : zone, origin })
  visitHandler?.(zone)
}

/** Mémorise la zone / l'étape couramment affichée (sans changer l'origine). */
export function noteZone(zone: ZoneKey) {
  if (read().zone !== zone) write({ zone })
}
export function noteStep(step: FilmStepId) {
  if (read().step !== step) write({ step })
}

export function clearOrigin() {
  if (read().origin) write({ origin: null })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useJourney(): State {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}
