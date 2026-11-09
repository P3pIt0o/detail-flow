/**
 * Moteur de mouvement de la carte 3D (L45) — fonctions PURES, testées sans navigateur.
 * Le composant `tilt-card.tsx` les appelle à chaque image (rAF).
 */

import type { DigitalCardStyle } from "@/lib/digital-card"

export type Tilt = { x: number; y: number }
export type Orientation = { beta: number; gamma: number }
export type SpringState = { value: number; velocity: number }

/** Inclinaison maximale (degrés). */
export const MAX_TILT = 18
/** Variation de cible ignorée (degrés) : aucun tremblement au repos. */
export const DEAD_ZONE = 0.4
export const STIFFNESS = 0.075
export const DAMPING = 0.8
/** Flottement vertical (px) et sa période (s). */
export const FLOAT_AMPLITUDE = 2.5
export const FLOAT_PERIOD_S = 5

// `|| 0` évite les -0 (rendu « -0deg » et comparaisons).
const clampTilt = (v: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, v)) || 0
const round2 = (v: number) => Math.round(v * 100) / 100 || 0
/** Ramène un écart d'angle dans [-range/2, range/2] (beta : 360°, gamma : 180°). */
const wrap = (d: number, range: number) => ((((d + range / 2) % range) + range) % range) - range / 2

/** Cible d'inclinaison relative à la position neutre (1er évènement = calibrage). */
export function orientationTarget(ev: Orientation, neutral: Orientation): Tilt {
  return {
    x: clampTilt(-wrap(ev.beta - neutral.beta, 360)),
    y: clampTilt(wrap(ev.gamma - neutral.gamma, 180)),
  }
}

/** Souris : coordonnées normalisées dans la carte ([-1, 1]) → inclinaison. */
export function pointerTarget(px: number, py: number): Tilt {
  return { x: clampTilt(-py * MAX_TILT), y: clampTilt(px * MAX_TILT) }
}

/** Zone morte : la cible ne bouge que si l'écart dépasse DEAD_ZONE. */
export function applyDeadZone(current: number, raw: number): number {
  return Math.abs(raw - current) > DEAD_ZONE ? raw : current
}

/** Une image de ressort amorti, borné à ±MAX_TILT, arrondi à 0,01°, figé une fois arrivé. */
export function stepSpring(s: SpringState, target: number): SpringState {
  const velocity = (s.velocity + (target - s.value) * STIFFNESS) * DAMPING
  const value = round2(clampTilt(s.value + velocity))
  if (Math.abs(target - value) < 0.01 && Math.abs(velocity) < 0.01) return { value: target, velocity: 0 }
  return { value, velocity }
}

/** Flottement vertical continu (px). 0 si mouvement réduit / refusé. */
export function floatOffset(tSeconds: number, reduced: boolean): number {
  if (reduced) return 0
  return round2(Math.sin((tSeconds * 2 * Math.PI) / FLOAT_PERIOD_S) * FLOAT_AMPLITUDE)
}

/** Ombre portée : décalée à l'opposé de l'inclinaison, resserrée quand la carte monte (float < 0). */
export function shadowTransform(tilt: Tilt, float: number) {
  return {
    x: round2(-tilt.y * 1.1),
    y: round2(-tilt.x * 0.6),
    scale: 1 + float / 40,
    opacity: 0.85 + float / 25,
  }
}

/**
 * Décalage du reflet spéculaire, en % de son calque (2 × la carte, centré).
 * Statique si mouvement réduit : point lumineux en haut à gauche (30 % / 20 % de la carte).
 */
export function specularOffset(tilt: Tilt, reduced: boolean): Tilt {
  if (reduced) return { x: -10, y: -15 }
  return { x: round2(tilt.y * 1.3), y: round2(-tilt.x * 1.3) }
}

/** Reflet irisé : rotation (deg) et décalage (%) selon l'angle. */
export function holoTransform(tilt: Tilt) {
  return { rotate: round2(tilt.y * 6 + tilt.x * 4), x: round2(-tilt.y * 2), y: round2(tilt.x * 2) }
}

/** Calques de reflet : spéculaire toujours, holographique seulement pour ce style. */
export function layersFor(style: DigitalCardStyle) {
  return { specular: true, holographic: style === "holographic" }
}
