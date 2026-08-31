/**
 * ============================================================================
 *  MOTEUR PROMO (100 % SERVEUR — source de vérité unique)
 * ============================================================================
 *  Toute la logique métier des codes promo vit ici. L'UI n'évalue jamais un
 *  code : elle appelle une Server Action qui délègue à ce module.
 *
 *  V1 : remise pourcentage/fixe, dates, limite globale, activation, minimum de
 *  commande. La structure est volontairement extensible : le champ `rules`
 *  (jsonb) et le point d'entrée unique `validatePromoCode` permettront d'ajouter
 *  plus tard firstBookingOnly, maxUsesPerCustomer, serviceIds, catégories,
 *  types de véhicule, clients ciblés, autoApply... sans refonte du calcul de
 *  prix ni de la réservation.
 * ============================================================================
 */

import "server-only"
import { db } from "@/lib/db"
import { promoCodes } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import type { Quote } from "@/lib/booking/types"

export type PromoDiscountType = "percent" | "fixed"

/** Critères avancés futurs. Non évalués en V1 (réservés pour éviter une migration). */
export type PromoRules = {
  firstBookingOnly?: boolean
  maxUsesPerCustomer?: number
  serviceIds?: number[]
  categoryIds?: number[]
  vehicleTypeIds?: number[]
  customerIds?: number[]
  autoApply?: boolean
  stackingAllowed?: boolean
}

/** Snapshot durable stocké sur la réservation (jamais recalculé a posteriori). */
export type PromoSnapshot = {
  code: string
  discountType: PromoDiscountType
  discountValue: number
  discountCents: number
}

export type PromoValidationResult =
  | {
      valid: true
      promoCodeId: number
      normalizedCode: string
      discountType: PromoDiscountType
      discountValue: number
      discountCents: number
    }
  | { valid: false; reason: PromoInvalidReason }

export type PromoInvalidReason =
  | "empty"
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "max_uses"
  | "min_order"
  | "invalid_config"
  | "no_eligible_amount"
  // Code CIBLÉ « certaines prestations » : aucune prestation éligible dans le
  // panier courant. Jamais de repli automatique en promo globale.
  | "not_applicable_services"

/** Normalise un code : trim + MAJUSCULES (source de vérité serveur). */
export function normalizePromoCode(code: string): string {
  return (code ?? "").trim().toUpperCase()
}

/**
 * Sous-total éligible à la remise, calculé SELON les règles du code.
 *
 *  - Promo GLOBALE (rules absent ou `serviceIds` vide) : comportement historique
 *    INCHANGÉ → services + options (le déplacement n'est jamais remisé). Les
 *    promotions existantes (rules = NULL) restent donc applicables à tout.
 *  - Promo CIBLÉE « certaines prestations » (`rules.serviceIds` non vide) :
 *    assiette = somme du PRIX PRESTATION des seules lignes éligibles. Les
 *    options ET le déplacement sont EXCLUS par défaut (règle LOT C).
 *
 * Dans un panier mixte, seules les lignes dont le `serviceId` est ciblé entrent
 * dans l'assiette : la remise ne touche jamais les lignes non éligibles.
 */
export function computePromoEligibleSubtotal(
  quote: Pick<Quote, "lines" | "servicesCents" | "optionsCents">,
  rules?: PromoRules | null,
): number {
  const serviceIds = rules?.serviceIds
  if (!serviceIds || serviceIds.length === 0) {
    return quote.servicesCents + quote.optionsCents
  }
  const set = new Set(serviceIds)
  return quote.lines.reduce((sum, l) => (set.has(l.serviceId) ? sum + l.priceCents : sum), 0)
}

/** Calcule la remise en centimes, bornée à [0, assiette éligible]. */
export function computeDiscountCents(
  type: PromoDiscountType,
  value: number,
  eligibleSubtotalCents: number,
): number {
  if (eligibleSubtotalCents <= 0) return 0
  let discount = 0
  if (type === "percent") discount = Math.floor((eligibleSubtotalCents * value) / 100)
  else if (type === "fixed") discount = value
  return Math.max(0, Math.min(discount, eligibleSubtotalCents))
}

/**
 * Valide un code (lecture seule, sans consommation) pour un tenant + une assiette.
 * Utilisé pour l'aperçu ("Appliquer") ET revalidé à la création du booking.
 */
export async function validatePromoCode(input: {
  companyId: number
  code: string
  /** Devis courant : l'assiette éligible est recalculée ici selon les règles. */
  quote: Pick<Quote, "lines" | "servicesCents" | "optionsCents">
  now?: Date
}): Promise<PromoValidationResult> {
  const normalizedCode = normalizePromoCode(input.code)
  if (!normalizedCode) return { valid: false, reason: "empty" }

  const [row] = await db
    .select()
    .from(promoCodes)
    .where(and(eq(promoCodes.companyId, input.companyId), eq(promoCodes.code, normalizedCode)))
    .limit(1)

  if (!row) return { valid: false, reason: "not_found" }
  if (!row.active) return { valid: false, reason: "inactive" }

  const now = input.now ?? new Date()
  if (row.startsAt && now < row.startsAt) return { valid: false, reason: "not_started" }
  if (row.endsAt && now > row.endsAt) return { valid: false, reason: "expired" }
  if (row.maxUses != null && row.usageCount >= row.maxUses) return { valid: false, reason: "max_uses" }

  // Assiette éligible calculée CÔTÉ SERVEUR à partir des règles du code (jamais
  // fournie par le navigateur) : globale (services+options) ou ciblée (prix des
  // prestations visées, options/déplacement exclus).
  const rules = (row.rules ?? null) as PromoRules | null
  const targeted = Boolean(rules?.serviceIds && rules.serviceIds.length > 0)
  const eligibleSubtotalCents = computePromoEligibleSubtotal(input.quote, rules)

  // Code ciblé mais aucune prestation éligible dans le panier : refus explicite,
  // jamais de bascule silencieuse en promo globale.
  if (targeted && eligibleSubtotalCents <= 0) {
    return { valid: false, reason: "not_applicable_services" }
  }

  // Minimum d'achat évalué sur l'ASSIETTE ÉLIGIBLE (documenté) : services+options
  // pour une promo globale ; prix des prestations ciblées pour une promo ciblée.
  if (row.minOrderCents != null && eligibleSubtotalCents < row.minOrderCents) {
    return { valid: false, reason: "min_order" }
  }

  const type = row.discountType as PromoDiscountType
  const value = row.discountValue
  const configOk =
    (type === "percent" && value >= 1 && value <= 100) || (type === "fixed" && value > 0)
  if (!configOk) return { valid: false, reason: "invalid_config" }

  // Remise bornée à [0, assiette éligible] : remise fixe plafonnée, jamais négatif.
  const discountCents = computeDiscountCents(type, value, eligibleSubtotalCents)
  if (discountCents <= 0) return { valid: false, reason: "no_eligible_amount" }

  return { valid: true, promoCodeId: row.id, normalizedCode, discountType: type, discountValue: value, discountCents }
}

/**
 * Incrémente le compteur d'utilisation de façon ATOMIQUE, en re-vérifiant dans
 * la même requête l'appartenance au tenant, l'activation et la limite globale.
 * Empêche maxUses=100 de passer à 101 avec deux requêtes concurrentes.
 * Retourne true seulement si l'incrément a réellement eu lieu.
 * `tx` = transaction Drizzle en cours (création du booking).
 */
export async function consumePromoCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
  promoCodeId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await tx
    .update(promoCodes)
    .set({ usageCount: sql`${promoCodes.usageCount} + 1`, updatedAt: now })
    .where(
      and(
        eq(promoCodes.id, promoCodeId),
        eq(promoCodes.companyId, companyId),
        eq(promoCodes.active, true),
        sql`(${promoCodes.maxUses} IS NULL OR ${promoCodes.usageCount} < ${promoCodes.maxUses})`,
      ),
    )
    .returning({ id: promoCodes.id })
  return updated.length > 0
}
