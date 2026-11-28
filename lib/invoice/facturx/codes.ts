/**
 * ============================================================================
 *  FACTUR-X / CII — listes de codes (constantes PURES, aucune I/O)
 * ============================================================================
 *  Seules les correspondances nécessaires au profil EN16931 du LOT A figurent
 *  ici. Aucune valeur n'est déduite d'un pays, d'un type de client ou d'un
 *  paramètre courant : chaque code est la traduction mécanique d'une donnée
 *  déjà SNAPSHOTÉE sur la facture DetailFlow.
 *
 *  Évolutions prévues (LOT B/C) : profil EXTENDED-CTC-FR, codes de motif
 *  d'exonération (VATEX), cadre de facturation français. Ajouter ici de
 *  nouvelles tables plutôt que modifier le générateur.
 * ============================================================================
 */

import type { TaxTreatment } from "@/lib/invoice/tax-treatment"

/** Profils Factur-X pris en charge. LOT A : EN16931 uniquement. */
export type FacturXProfile = "EN16931"

/** Identifiant de spécification (BT-24) par profil Factur-X 1.0x. */
export const FACTURX_GUIDELINE_ID: Record<FacturXProfile, string> = {
  EN16931: "urn:cen.eu:en16931:2017",
}

/** Code type de document UNTDID 1001 (BT-3). */
export const DOCUMENT_TYPE_CODE = {
  invoice: "380", // Facture commerciale
  credit_note: "381", // Avoir
} as const

/**
 * Catégorie de TVA UNTDID 5305 (BT-118 / BT-151 / BT-95) à partir du
 * traitement fiscal EXPLICITE snapshoté sur la facture. Aucune inférence.
 */
export const VAT_CATEGORY_BY_TREATMENT: Record<TaxTreatment, "S" | "E" | "AE" | "O"> = {
  STANDARD: "S",
  EXEMPT: "E",
  REVERSE_CHARGE: "AE",
  OUT_OF_SCOPE: "O",
}

/**
 * Identifiants légaux DetailFlow -> code ICD ISO/IEC 6523 (attribut schemeID).
 * GENERIC => null : l'identifiant est émis SANS schemeID (aucun scheme inventé).
 *
 * Mapping EN16931 uniquement (identifiant légal BT-30 / BT-47). Il n'est PAS
 * prêt pour la réforme française : le placement SIREN/SIRET exigé par
 * EXTENDED-CTC-FR sera défini séparément au LOT B. Ces identifiants ne sont
 * jamais utilisés comme identifiant fiscal BT-32.
 */
export const LEGAL_SCHEME_ICD: Record<string, string | null> = {
  FR_SIREN: "0002",
  FR_SIRET: "0009",
  BE_BCE: "0208",
  CH_UID: "0183",
  GENERIC: null,
}

/**
 * Unité de quantité UN/ECE Rec 20 (BT-130). Les quantités DetailFlow sont des
 * nombres entiers de prestations/options : « C62 » = unité (one).
 */
export const UNIT_CODE_PIECE = "C62"

/** Moyen de paiement UNTDID 4461 (BT-81) : virement (IBAN snapshoté). */
export const PAYMENT_MEANS_CREDIT_TRANSFER = "30"

/** Libellé de la remise globale (BT-97), identique au libellé du PDF. */
export const DOCUMENT_DISCOUNT_REASON = "Remise"

/** Schéma de l'adresse électronique (BT-34 / BT-49) : e-mail. */
export const ELECTRONIC_ADDRESS_SCHEME_EMAIL = "EM"
