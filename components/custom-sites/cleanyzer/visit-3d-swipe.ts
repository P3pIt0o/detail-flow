/**
 * Visite 3D CLEANYZER — étapes du pilotage au glissement (mobile).
 * Fonctions pures : une « étape » est un indice dans `swipeStops()`, la
 * position peut être fractionnaire pendant le geste.
 */

/** Distance minimale (fraction de la largeur) pour changer d'étape sans élan. */
export const SWIPE_THRESHOLD = 0.18
/** Vitesse (px/ms) au-delà de laquelle un geste court change d'étape (inertie). */
export const FLICK_SPEED = 0.4

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Indices d'images clés où l'on s'arrête : intro, chaque zone, final (les transitions sont sautées). */
export function swipeStops(keyOrder: readonly (string | null)[]): number[] {
  const last = keyOrder.length - 1
  return keyOrder.flatMap((z, i) => (z !== null || i === 0 || i === last ? [i] : []))
}

export const stepTo = (stop: number, delta: number, count: number) => clamp(stop + delta, 0, count - 1)

/** Position pendant le geste : suit le doigt (glisser à gauche = avancer). */
export const dragPosition = (stop: number, dx: number, width: number, count: number) =>
  clamp(stop - dx / Math.max(1, width), 0, count - 1)

/** Étape d'arrivée au relâchement : jamais plus d'une étape par geste. */
export function releaseStop(stop: number, dx: number, width: number, vx: number, count: number): number {
  const dist = -dx / Math.max(1, width)
  const dir = Math.abs(vx) > FLICK_SPEED ? -Math.sign(vx) : Math.abs(dist) >= SWIPE_THRESHOLD ? Math.sign(dist) : 0
  return stepTo(stop, dir, count)
}

/** Progression 0–1 de la caméra pour une position d'étape (fractionnaire). */
export function stopProgress(stops: readonly number[], pos: number, keyCount: number): number {
  const p = clamp(pos, 0, stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(p))
  const key = stops[i] + (stops[i + 1] - stops[i]) * (p - i)
  return key / (keyCount - 1)
}
