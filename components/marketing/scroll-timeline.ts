/**
 * Timeline centralisée du scrollytelling de la landing DetailFlow.
 *
 * Source UNIQUE des plages de progression (`scrollYProgress`, 0..1) pour :
 * - `scroll-stage.tsx` (timeline globale + panneau persistant)
 * - `detailflow-panel.tsx` (objet 3D persistant)
 * - chaque `scene-*.tsx` (contenu narratif)
 *
 * Règle : ne JAMAIS écrire une plage numérique en dur ailleurs que dans ce
 * fichier. Toute nouvelle étape doit être ajoutée à `STAGE_KEYS` +
 * `STAGE_WEIGHTS`.
 */

export const STAGE_KEYS = ["hero", "overview", "features", "benefits", "partners", "beta", "faq"] as const

export type StageKey = (typeof STAGE_KEYS)[number]

/**
 * Poids relatifs (en unités de 100vh) de chaque étape : les étapes avec plus
 * de contenu (ex. features, 6 items) obtiennent davantage de distance de
 * scroll pour rester lisibles.
 */
const STAGE_WEIGHTS: Record<StageKey, number> = {
  hero: 1.1,
  overview: 0.9,
  features: 1.8,
  benefits: 0.9,
  partners: 1.0,
  beta: 1.15,
  faq: 1.05,
}

const TOTAL_WEIGHT = STAGE_KEYS.reduce((sum, key) => sum + STAGE_WEIGHTS[key], 0)

/** Hauteur totale du conteneur de scroll (en vh). */
export const TOTAL_SCROLL_VH = TOTAL_WEIGHT * 100

/** Plage [start, end] (0..1) de `scrollYProgress` pour chaque étape narrative. */
export const STAGE_RANGE: Record<StageKey, readonly [number, number]> = (() => {
  const ranges = {} as Record<StageKey, readonly [number, number]>
  let cursor = 0
  for (const key of STAGE_KEYS) {
    const start = cursor
    const end = cursor + STAGE_WEIGHTS[key] / TOTAL_WEIGHT
    ranges[key] = [start, end] as const
    cursor = end
  }
  return ranges
})()

/** Points de rupture (8 valeurs) délimitant les 7 étapes, de 0 à 1. */
export const STAGE_BOUNDARIES: number[] = [0, ...STAGE_KEYS.map((key) => STAGE_RANGE[key][1])]

/**
 * Construit les tableaux input/output pour un `useTransform` de type
 * "crossfade" : 0 → 1 → 0, avec un fondu de `fade` (fraction de progression)
 * de part et d'autre de la plage. Garantit un tableau `input` strictement
 * croissant (exigence de Framer Motion).
 *
 * Utilisé pour que les changements de contenu du panneau persistant et des
 * scènes soient toujours des fondus animés, jamais des remplacements bruts.
 */
export function fadeRange(range: readonly [number, number], fade = 0.018) {
  const [start, end] = range
  const margin = Math.min(fade, (end - start) / 2)
  const input: number[] = []
  const output: number[] = []

  if (start > 0) {
    input.push(Math.max(0, start - margin))
    output.push(0)
  }
  input.push(start)
  output.push(1)
  input.push(end)
  output.push(1)
  if (end < 1) {
    input.push(Math.min(1, end + margin))
    output.push(0)
  }

  return { input, output }
}

/**
 * Remappe la sortie 0/1 d'un `fadeRange` vers des valeurs personnalisées
 * (ex. un décalage `y` en pixels), en conservant le même tableau `input`.
 * Permet de dériver plusieurs styles (opacité, y, pointer-events) d'une
 * seule et même plage de fondu, sans dupliquer les points de rupture.
 */
export function mapOutput(fade: { input: number[]; output: number[] }, valueAtZero: number, valueAtOne: number) {
  return {
    input: fade.input,
    output: fade.output.map((v) => (v === 1 ? valueAtOne : valueAtZero)),
  }
}
