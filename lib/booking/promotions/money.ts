/**
 * Arithmétique monétaire du moteur de promotions (PURE, centimes entiers).
 */

export const BPS_SCALE = 10_000

// Entiers SÛRS uniquement (≤ 2^53 − 1) : un 1e300 n'est jamais un montant ni un id.
export const isNonNegInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0
export const isPosInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0

/** Pourcentage en points de base, arrondi à l'inférieur (jamais en faveur d'une remise excessive). */
export function percentOf(amountCents: number, bps: number): number {
  if (amountCents <= 0 || bps <= 0) return 0
  return Math.floor((amountCents * bps) / BPS_SCALE)
}

/**
 * Ventile `total` centimes sur des éléments, proportionnellement à leur poids,
 * sans jamais dépasser le poids d'un élément. Méthode des plus forts restes :
 * la somme des parts vaut EXACTEMENT min(total, Σ poids). Déterministe
 * (égalité de reste → ordre d'entrée).
 */
export function allocate(total: number, weights: { key: string; cents: number }[]): Record<string, number> {
  const items = weights.filter((w) => w.cents > 0)
  const sum = items.reduce((s, w) => s + w.cents, 0)
  const target = Math.max(0, Math.min(Math.trunc(total), sum))
  const out: Record<string, number> = {}
  if (target === 0 || sum === 0) return out
  let given = 0
  const rests: { key: string; rest: number; idx: number }[] = []
  items.forEach((w, idx) => {
    const exact = (target * w.cents) / sum
    const base = Math.floor(exact)
    out[w.key] = (out[w.key] ?? 0) + base
    given += base
    rests.push({ key: w.key, rest: exact - base, idx })
  })
  rests.sort((a, b) => b.rest - a.rest || a.idx - b.idx)
  let left = target - given
  for (const r of rests) {
    if (left <= 0) break
    const cap = items[r.idx].cents
    if (out[r.key] < cap) {
      out[r.key] += 1
      left -= 1
    }
  }
  return out
}

export const sumValues = (rec: Record<string, number>): number => Object.values(rec).reduce((s, v) => s + v, 0)
