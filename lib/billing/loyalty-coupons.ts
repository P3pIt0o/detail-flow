/**
 * DetailFlow — Coupons Stripe BACKEND de la réduction fidélité (pur).
 *
 * Un coupon par palier de `LOYALTY_DISCOUNT_TIERS` (commercial-rules.ts),
 * `duration = forever`, jamais exposé en Promotion Code public : seul le
 * webhook invoice.created l'applique. Les IDs réels vivent dans les variables
 * d'environnement STRIPE_COUPON_LOYALTY_* (jamais dans Git).
 */

import type Stripe from "stripe"
import { LOYALTY_DISCOUNT_TIERS } from "./commercial-rules"
import { SubscriptionError } from "./subscription-core"

type EnvLike = Record<string, string | undefined>

export interface LoyaltyCouponSpec {
  discountBps: number
  percentOff: number
  envName: string
  /** ID Stripe déterministe demandé à la création (idempotence du script). */
  couponId: string
  name: string
}

function specForTier(discountBps: number): LoyaltyCouponSpec {
  const percentOff = discountBps / 100
  const suffix = String(percentOff).replace(".", "_")
  return {
    discountBps,
    percentOff,
    envName: `STRIPE_COUPON_LOYALTY_${suffix}`,
    couponId: `detailflow_loyalty_${suffix}`,
    name: `DetailFlow — Fidélité ${String(percentOff).replace(".", ",")} %`,
  }
}

/** 5, 10, 15, 17,5 et 20 % — dérivés du barème unique (aucun chiffre dupliqué). */
export const LOYALTY_COUPONS: readonly LoyaltyCouponSpec[] = LOYALTY_DISCOUNT_TIERS.filter((t) => t.discountBps > 0).map(
  (t) => specForTier(t.discountBps),
)

export function getLoyaltyCouponSpec(discountBps: number): LoyaltyCouponSpec | null {
  if (discountBps === 0) return null
  const spec = LOYALTY_COUPONS.find((c) => c.discountBps === discountBps)
  if (!spec) throw new SubscriptionError("COUPON_INVALID", `Aucun coupon fidélité pour ${discountBps} bps.`)
  return spec
}

function readEnv(env: EnvLike, name: string): string | null {
  const value = env[name]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Coupon ID attendu pour un palier ; variable absente => échec (retryable). */
export function resolveLoyaltyCouponId(discountBps: number, env: EnvLike): string | null {
  const spec = getLoyaltyCouponSpec(discountBps)
  if (!spec) return null
  const id = readEnv(env, spec.envName)
  if (!id) {
    throw new SubscriptionError("COUPON_MISSING", `Variable ${spec.envName} manquante : remise fidélité impossible.`, true)
  }
  return id
}

/** IDs des coupons fidélité configurés : seules remises reconnues sur une facture. */
export function readKnownLoyaltyCouponIds(env: EnvLike): Set<string> {
  const ids = new Set<string>()
  for (const spec of LOYALTY_COUPONS) {
    const id = readEnv(env, spec.envName)
    if (id) ids.add(id)
  }
  return ids
}

export function buildLoyaltyCouponCreateParams(spec: LoyaltyCouponSpec): Stripe.CouponCreateParams {
  return {
    id: spec.couponId,
    name: spec.name,
    percent_off: spec.percentOff,
    duration: "forever",
    metadata: {
      app: "detailflow",
      kind: "loyalty",
      discount_bps: String(spec.discountBps),
    },
  }
}

/** Le coupon Stripe doit correspondre EXACTEMENT au palier (sinon refus). */
export function assertLoyaltyCouponValid(coupon: Stripe.Coupon, spec: LoyaltyCouponSpec): void {
  const problems: string[] = []
  if (coupon.valid !== true) problems.push("coupon invalide/expiré")
  if (coupon.percent_off !== spec.percentOff) problems.push(`percent_off ${coupon.percent_off ?? "aucun"} ≠ ${spec.percentOff}`)
  if (coupon.amount_off) problems.push("amount_off présent")
  if (coupon.duration !== "forever") problems.push(`duration ${coupon.duration} ≠ forever`)
  if (coupon.metadata?.app !== "detailflow") problems.push("metadata.app ≠ detailflow")
  if (coupon.metadata?.kind !== "loyalty") problems.push("metadata.kind ≠ loyalty")
  if (coupon.metadata?.discount_bps !== String(spec.discountBps)) problems.push("metadata.discount_bps incohérent")
  if (problems.length > 0) {
    throw new SubscriptionError("COUPON_INVALID", `Coupon ${coupon.id} refusé : ${problems.join(" ; ")}.`, true)
  }
}
