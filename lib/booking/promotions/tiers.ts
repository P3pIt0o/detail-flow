/**
 * Analyse des paliers pour l'assistant admin (PURE). Ne bloque jamais
 * l'enregistrement : une configuration incohérente reste valide (le moteur
 * applique toujours le palier atteint le plus avantageux au client, D-B1 a),
 * mais le pro est alerté clairement. L'affichage se fera dans L17-F.
 */

import { formatEuros } from "./cart"
import type { Promotion, PromotionTier, PromotionValue } from "./types"

export type TierWarning = {
  /** warning = configuration incohérente à corriger ; info = effet à connaître. */
  severity: "warning" | "info"
  code: "not_more_advantageous" | "total_decreases" | "tier_never_used" | "tier_step" | "starts_at_one" | "free"
  /** Palier concerné. */
  minQuantity: number
  message: string
}

/** 1000 → « 10 % », 1250 → « 12,5 % », 1005 → « 10,05 % » (sans dépendance à la locale). */
export function formatPercent(bps: number): string {
  const int = Math.floor(bps / 100)
  const rest = bps % 100
  const dec = String(rest).padStart(2, "0").replace(/0$/, "")
  return `${int}${rest ? `,${dec}` : ""} %`
}

function unitWord(p: Promotion, n: number): string {
  const w = p.kind === "multi_options" ? "option" : "prestation"
  return `${n} ${w}${n > 1 ? "s" : ""}`
}

function lastMin(p: Promotion): number {
  return Math.max(...p.tiers.map((t) => t.minQuantity))
}

function describe(p: Promotion, t: PromotionTier): string {
  const v: PromotionValue = t.value
  const what = v.type === "percent" ? `−${formatPercent(v.bps)}` : v.type === "amount" ? `−${formatEuros(v.cents)}` : `${formatEuros(v.cents)} au total`
  return `« ${unitWord(p, t.minQuantity)}${t.minQuantity === lastMin(p) ? " ou plus" : ""} : ${what} »`
}

/**
 * @param opts prix minimal / maximal des éléments éligibles au catalogue
 *             (facultatifs : affinent l'alerte sur les prix totaux fixes).
 */
export function analyzeTiers(
  p: Promotion,
  opts: { minEligiblePriceCents?: number; maxEligiblePriceCents?: number } = {},
): TierWarning[] {
  if (p.kind === "service_option" || !Array.isArray(p.tiers) || p.tiers.length === 0) return []
  const tiers = [...p.tiers].filter((t) => t && Number.isInteger(t.minQuantity)).sort((a, b) => a.minQuantity - b.minQuantity)
  const out: TierWarning[] = []

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const v = t.value
    if (v.type === "percent" && v.bps >= 10000) {
      out.push({ severity: "warning", code: "free", minQuantity: t.minQuantity, message: `Le palier ${describe(p, t)} rend les éléments concernés gratuits.` })
    }
    if (i === 0) {
      if (t.minQuantity === 1) {
        out.push({
          severity: "info",
          code: "starts_at_one",
          minQuantity: 1,
          message: `Le palier ${describe(p, t)} s'applique dès ${p.kind === "multi_options" ? "une seule option" : "une seule prestation"} : c'est une remise permanente.`,
        })
      }
      continue
    }

    if (v.type === "percent" || v.type === "amount") {
      const better = tiers
        .slice(0, i)
        .find((x) =>
          v.type === "percent"
            ? x.value.type === "percent" && x.value.bps >= v.bps
            : x.value.type === "amount" && x.value.cents >= v.cents,
        )
      if (better) {
        out.push({
          severity: "warning",
          code: "not_more_advantageous",
          minQuantity: t.minQuantity,
          message: `Le palier ${describe(p, t)} n'est pas plus avantageux que ${describe(p, better)}. Vos clients garderont automatiquement ${describe(p, better)} : augmentez la réduction de ce palier ou supprimez-le.`,
        })
      }
      continue
    }

    // Prix total fixe.
    const prev = tiers[i - 1]
    if (prev.value.type !== "fixed_total") continue
    const step = v.cents - prev.value.cents
    if (step <= 0) {
      out.push({
        severity: "warning",
        code: "total_decreases",
        minQuantity: t.minQuantity,
        message: `Le prix total ${step === 0 ? "reste identique" : "baisse"} quand le client passe de ${describe(p, prev)} à ${describe(p, t)} : les prestations supplémentaires seraient offertes. Vérifiez vos montants.`,
      })
      continue
    }
    // Le palier précédent couvre jusqu'à (minQuantity de ce palier − 1) prestations, les
    // plus chères ; au-delà, chaque prestation est au tarif normal (D-B1 a). Ce palier
    // n'est donc retenu que si la prestation supplémentaire la moins chère vaut plus que `step`.
    if (opts.maxEligiblePriceCents != null && step > opts.maxEligiblePriceCents) {
      out.push({
        severity: "warning",
        code: "tier_never_used",
        minQuantity: t.minQuantity,
        message: `Le palier ${describe(p, t)} ne servira jamais : il coûte ${formatEuros(step)} de plus que ${describe(p, prev)}, plus que le prix de chacune de vos prestations concernées. Vos clients garderont ${describe(p, prev)} et paieront les prestations suivantes au tarif normal.`,
      })
    } else if (opts.minEligiblePriceCents == null || step > opts.minEligiblePriceCents) {
      out.push({
        severity: "info",
        code: "tier_step",
        minQuantity: t.minQuantity,
        message: `Entre ${describe(p, prev)} et ${describe(p, t)}, le prix total augmente de ${formatEuros(step)}. Ce palier ne s'applique que si la prestation supplémentaire la moins chère vaut plus de ${formatEuros(step)} ; sinon le client garde automatiquement ${describe(p, prev)}, plus avantageux.`,
      })
    }
  }
  return out
}
