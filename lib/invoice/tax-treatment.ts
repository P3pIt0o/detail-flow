/**
 * ============================================================================
 *  TRAITEMENT TVA (LOT 2B.4) — helper PUR, générique, sans logique de pays
 * ============================================================================
 *  Le traitement fiscal d'une facture est TOUJOURS un choix EXPLICITE de
 *  l'utilisateur. Ce module ne fait AUCUNE inférence : il ne connaît ni le pays
 *  vendeur, ni le pays client, ni le type de client (B2B/B2C), ni le numéro de
 *  TVA. Il se contente de mapper un traitement choisi vers un comportement de
 *  calcul mécanique (TVA activée / désactivée) et vers un libellé d'affichage.
 *
 *  INTERDIT dans ce fichier : import de country-profiles, sellerCountry,
 *  issuerCountry, customerCountry, customerType, vatNumber, VIES.
 * ============================================================================
 */

export const TAX_TREATMENTS = ["STANDARD", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"] as const

export type TaxTreatment = (typeof TAX_TREATMENTS)[number]

export const TAX_TREATMENT_LABEL: Record<TaxTreatment, string> = {
  STANDARD: "TVA normale",
  EXEMPT: "Sans TVA / exonération",
  REVERSE_CHARGE: "Autoliquidation",
  OUT_OF_SCOPE: "Hors champ",
}

export function isTaxTreatment(value: string): value is TaxTreatment {
  return (TAX_TREATMENTS as readonly string[]).includes(value)
}

/**
 * Normalise une valeur libre vers un TaxTreatment connu, sinon null.
 * null = legacy / non défini (comportement historique conservé).
 */
export function normalizeTaxTreatment(value: string | null | undefined): TaxTreatment | null {
  const normalized = (value ?? "").trim().toUpperCase()
  if (!normalized) return null
  return isTaxTreatment(normalized) ? normalized : null
}

/**
 * Résout le comportement de calcul TVA à partir du traitement choisi.
 * - null (legacy) => conserve exactement l'ancien comportement (vatEnabled fourni).
 * - STANDARD      => TVA activée, taux conservé.
 * - EXEMPT / REVERSE_CHARGE / OUT_OF_SCOPE => TVA désactivée (0).
 * Aucune règle de pays. Taux NaN/Infinity => 0 sûr.
 */
export function resolveTaxCalculation(input: {
  taxTreatment: TaxTreatment | null
  legacyVatEnabled: boolean
  vatRate: number
}): {
  vatEnabled: boolean
  vatRate: number
} {
  const rate = Number.isFinite(input.vatRate) ? input.vatRate : 0

  if (input.taxTreatment == null) {
    return { vatEnabled: input.legacyVatEnabled, vatRate: rate }
  }

  if (input.taxTreatment === "STANDARD") {
    return { vatEnabled: true, vatRate: rate }
  }

  return { vatEnabled: false, vatRate: rate }
}

export function getTaxTreatmentLabel(value: string | null | undefined): string | null {
  const treatment = normalizeTaxTreatment(value)
  return treatment ? TAX_TREATMENT_LABEL[treatment] : null
}
