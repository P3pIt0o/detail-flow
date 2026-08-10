/**
 * Timeline centralisée du scrollytelling immersif DetailFlow (V2).
 *
 * Source UNIQUE des plages de progression (`scrollYProgress`, 0..1) de la
 * scène immersive `ScrollStage` (hero → « un seul outil » → fonctionnalités →
 * finale). Le formulaire Beta et la FAQ NE font PAS partie de cette timeline :
 * ce sont des sections DOM normales rendues APRÈS le ScrollStage.
 *
 * Règle : ne JAMAIS écrire une plage numérique en dur ailleurs que dans ce
 * fichier. Toute nouvelle étape doit être ajoutée à `STAGE_KEYS` +
 * `STAGE_WEIGHTS`.
 */

export const STAGE_KEYS = ["hero", "overview", "features", "finale"] as const

export type StageKey = (typeof STAGE_KEYS)[number]

/**
 * Poids relatifs (en unités de 100vh) de chaque acte. `features` contient
 * plusieurs « moments » et obtient donc davantage de distance de scroll ;
 * chaque portion de scroll doit provoquer quelque chose de perceptible.
 */
const STAGE_WEIGHTS: Record<StageKey, number> = {
  hero: 1.15,
  overview: 1.35,
  features: 2.6,
  finale: 1.25,
}

const TOTAL_WEIGHT = STAGE_KEYS.reduce((sum, key) => sum + STAGE_WEIGHTS[key], 0)

/** Hauteur totale du conteneur de scroll immersif (en vh). */
export const TOTAL_SCROLL_VH = TOTAL_WEIGHT * 100

/** Plage [start, end] (0..1) de `scrollYProgress` pour chaque acte. */
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

/** Nombre de « moments » fonctionnalités mis en scène dans l'acte features. */
export const FEATURE_MOMENTS = 3

/** Renvoie une sous-plage absolue [a,b] à l'intérieur d'une plage [s,e]. */
export function subRange(range: readonly [number, number], from: number, to: number): readonly [number, number] {
  const [s, e] = range
  const span = e - s
  return [s + span * from, s + span * to] as const
}

/**
 * Construit des tableaux input/output pour `useTransform` à partir de points
 * exprimés en fractions (0..1) de la plage `range`. Garantit un `input`
 * strictement croissant (exigence de Framer Motion).
 */
export function keyframes(range: readonly [number, number], points: Array<readonly [number, number]>) {
  const [s, e] = range
  const span = e - s
  const input: number[] = []
  const output: number[] = []
  let prev = -Infinity
  for (const [frac, value] of points) {
    let x = s + span * frac
    if (x <= prev) x = prev + 1e-5 // force strictement croissant
    input.push(x)
    output.push(value)
    prev = x
  }
  return { input, output }
}

/**
 * Fondu d'entrée/sortie d'un contenu synchronisé sur une plage : 0 → 1 → 1 → 0.
 * `margin` = fraction de la plage consacrée à chaque fondu.
 */
export function stageFade(range: readonly [number, number], margin = 0.16) {
  const [start, end] = range
  const span = end - start
  const m = Math.min(margin, 0.49) * span
  const input: number[] = []
  const output: number[] = []

  // Entrée : fondu depuis 0 seulement si la plage NE commence PAS au tout
  // début de la timeline. Un acte qui démarre à 0 (le hero) doit être
  // pleinement visible dès le chargement — pas de fondu d'entrée.
  if (start > 0) {
    input.push(start)
    output.push(0)
    input.push(start + m)
    output.push(1)
  } else {
    input.push(0)
    output.push(1)
  }

  // Sortie : fondu vers 0 sauf si la plage va jusqu'à la fin de la timeline.
  if (end < 1) {
    input.push(end - m)
    output.push(1)
    input.push(end)
    output.push(0)
  } else {
    input.push(1)
    output.push(1)
  }

  // garantir strictement croissant
  for (let i = 1; i < input.length; i++) {
    if (input[i] <= input[i - 1]) input[i] = input[i - 1] + 1e-5
  }

  return { input, output }
}

/** Remappe la sortie 0/1 d'un `stageFade` vers des valeurs personnalisées. */
export function mapOutput(fade: { input: number[]; output: number[] }, valueAtZero: number, valueAtOne: number) {
  return {
    input: fade.input,
    output: fade.output.map((v) => valueAtZero + (valueAtOne - valueAtZero) * v),
  }
}
