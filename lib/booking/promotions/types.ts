/**
 * ============================================================================
 *  MOTEUR DE PROMOTIONS (L17-B) — TYPES
 * ============================================================================
 *  Module PUR : aucune dépendance base de données, Stripe, Next ou React.
 *  Importable côté serveur (source de vérité) ET côté client (aperçu).
 *
 *  Unités : montants en CENTIMES entiers ; pourcentages en POINTS DE BASE
 *  (10 % = 1000, 100 % = 10000). Aucun nombre flottant n'est stocké.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*  Panier normalisé                                                           */
/* -------------------------------------------------------------------------- */

/** Prestation réservée sur un véhicule, au prix recalculé par le serveur. */
export type CartService = { serviceId: number; priceCents: number }

/** Option réservée sur un véhicule, au prix recalculé par le serveur. */
export type CartOption = { optionId: number; priceCents: number }

/** Un véhicule et son propre panier (panier libre : prestations et options indépendantes). */
export type CartVehicle = {
  /** Identifiant stable du véhicule dans la réservation (uid côté client). */
  key: string
  services: CartService[]
  options: CartOption[]
}

/** Panier complet d'une réservation (déplacement exclu : jamais remisé). */
export type Cart = { vehicles: CartVehicle[] }

/** Référence à un élément du catalogue. */
export type ItemRef = { type: "service" | "option"; id: number }

/**
 * Élément facturable « à plat » (une prestation ou une option d'un véhicule).
 * `key` est unique dans la réservation : `<vehicleKey>|s|<serviceId>` ou `<vehicleKey>|o|<optionId>`.
 */
export type CartUnit = {
  key: string
  vehicleKey: string
  type: "service" | "option"
  id: number
  priceCents: number
}

/* -------------------------------------------------------------------------- */
/*  Règles de panier (équivalences)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Même traitement vendu sous deux formes (ex. prestation « phares » 65 € et
 * option « phares » 50 €). Sur un MÊME véhicule, il n'est jamais facturé deux
 * fois : le moteur garde une seule forme et le signale (jamais de blocage).
 */
export type EquivalenceRule = {
  id: number
  a: ItemRef
  b: ItemRef
  /** Motif affiché (obligatoire, non vide). */
  reason: string
}

/** Trace d'une correction automatique du panier (affichée au client et au pro). */
export type CartAdjustment =
  | {
      kind: "duplicate_merged"
      vehicleKey: string
      item: ItemRef
      /** Prix de l'exemplaire retiré (non facturé). */
      removedPriceCents: number
    }
  | {
      kind: "equivalence_resolved"
      vehicleKey: string
      ruleId: number
      kept: ItemRef
      removed: ItemRef
      /** Prix facturé de la forme conservée (le traitement reste réalisé). */
      keptPriceCents: number
      /** Prix de la forme retirée : montant que le client ne paie pas. */
      removedPriceCents: number
      reason: string
    }

/* -------------------------------------------------------------------------- */
/*  Promotions                                                                 */
/* -------------------------------------------------------------------------- */

export type PromotionKind = "multi_services" | "service_option" | "multi_options"

export type PromotionValue =
  /** Réduction en pourcentage (points de base, 1..10000). */
  | { type: "percent"; bps: number }
  /** Réduction en euros (centimes > 0). */
  | { type: "amount"; cents: number }
  /** PRIX TOTAL des éléments éligibles (centimes > 0) — pas une réduction. */
  | { type: "fixed_total"; cents: number }

/** Palier : s'applique dès `minQuantity` éléments éligibles (« 4 ou plus » = 4). */
export type PromotionTier = { minQuantity: number; value: PromotionValue }

type PromotionBase = {
  id: number
  name: string
  active: boolean
  /** Bornes de validité facultatives (ISO 8601 ou Date). */
  startsAt?: string | Date | null
  endsAt?: string | Date | null
  /** Départage à remise égale : plus grand = prioritaire, puis plus petit id. */
  priority: number
  /**
   * Cumulable avec les AUTRES promotions cumulables. Par défaut false : une
   * offre non cumulable n'est jamais combinée avec une autre.
   */
  stackable: boolean
  /** Cumulable avec un code promo. Par défaut false. */
  stackableWithPromoCode: boolean
}

/** Réduction selon le nombre de prestations éligibles de la réservation. */
export type MultiServicesPromotion = PromotionBase & {
  kind: "multi_services"
  /** null = toutes les prestations. */
  eligibleServiceIds: number[] | null
  /**
   * Les options entrent-elles dans le MONTANT remisé ? (jamais dans le comptage)
   * Par défaut false. Si true : options des véhicules portant au moins une
   * prestation éligible.
   */
  includeOptions: boolean
  /** Modes autorisés : percent, fixed_total. */
  tiers: PromotionTier[]
}

/** Réduction quand une prestation précise et une option précise sont sur le même véhicule. */
export type ServiceOptionPromotion = PromotionBase & {
  kind: "service_option"
  trigger: { serviceId: number; optionId: number; appliesTo: "service" | "option" | "both" }
  /** Un seul palier (minQuantity = 1). Modes autorisés : percent, amount. */
  tiers: PromotionTier[]
}

/** Réduction selon le nombre d'options éligibles de la réservation. */
export type MultiOptionsPromotion = PromotionBase & {
  kind: "multi_options"
  /** null = toutes les options. */
  eligibleOptionIds: number[] | null
  /** Modes autorisés : percent, amount. */
  tiers: PromotionTier[]
}

export type Promotion = MultiServicesPromotion | ServiceOptionPromotion | MultiOptionsPromotion

/* -------------------------------------------------------------------------- */
/*  Résultats                                                                  */
/* -------------------------------------------------------------------------- */

/** Remise d'une promotion, ventilée élément par élément (somme exacte). */
export type AppliedPromotion = {
  promotionId: number
  name: string
  kind: PromotionKind
  tier: PromotionTier
  /** Quantité éligible constatée (prestations, options ou occurrences de la combinaison). */
  quantity: number
  /** Montant éligible avant cette remise. */
  eligibleCents: number
  discountCents: number
  /** clé d'unité → centimes remisés. */
  allocations: Record<string, number>
}

/** Code promo déjà validé par lib/promo/service.ts (montant calculé sur le prix catalogue). */
export type PromoCodeInput = {
  code: string
  discountCents: number
  /** null = code global (prestations + options) ; sinon prestations ciblées (options exclues). */
  targetServiceIds: number[] | null
}

export type PromoCodeOutcome =
  | { status: "none" }
  | { status: "applied"; code: string; discountCents: number; allocations: Record<string, number> }
  /** Code écarté : une promotion non cumulable avec les codes est au moins aussi avantageuse. */
  | { status: "rejected_not_combinable"; code: string; promotionDiscountCents: number; codeDiscountCents: number }
  /** Code écarté : aucun montant restant à remiser sur les éléments qu'il vise. */
  | { status: "rejected_no_eligible_amount"; code: string }

export type PricingResult = {
  /** Panier après fusion des doublons et résolution des équivalences. */
  cart: Cart
  adjustments: CartAdjustment[]
  units: CartUnit[]
  /** Prix normal (prestations + options), déplacement exclu. */
  normalCents: number
  promotions: AppliedPromotion[]
  promotionDiscountCents: number
  promoCode: PromoCodeOutcome
  /** Promotions + code promo. Toujours ≤ normalCents. */
  totalDiscountCents: number
  /** = totalDiscountCents (libellé « économie réalisée »). */
  savingsCents: number
  /** Prix final des éléments (≥ 0), déplacement exclu. */
  finalCents: number
}

/** Suggestion commerciale (aucun ajout automatique au panier). */
export type Suggestion =
  | {
      kind: "next_tier"
      promotionId: number
      name: string
      /** Nombre d'éléments éligibles à ajouter pour atteindre le palier suivant. */
      missingQuantity: number
      itemType: "service" | "option"
      nextTier: PromotionTier
    }
  | {
      kind: "complete_combination"
      promotionId: number
      name: string
      vehicleKey: string
      add: ItemRef
      value: PromotionValue
    }
  | {
      kind: "cheaper_equivalent"
      ruleId: number
      vehicleKey: string
      replace: ItemRef
      by: ItemRef
      savingCents: number
      reason: string
    }
