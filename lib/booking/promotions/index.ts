/**
 * Moteur de promotions DetailFlow (L17-B). Point d'entrée public.
 * PUR : aucune dépendance base de données, Stripe, Next ou React.
 */
export * from "./types"
export { BPS_SCALE, allocate, percentOf } from "./money"
export { validatePromotion, validateValue, validateEquivalence, isPromotionLive, type ValidationResult } from "./validate"
export { normalizeCart, cartUnits, unitKey, InvalidCartError, describeAdjustment, formatEuros } from "./cart"
export { priceCart, previewPromotion, evaluatePromotion, selectPromotions, tierFor, type PriceCartInput } from "./engine"
export { suggestUpsells, type CatalogPrices } from "./suggestions"
