/**
 * ============================================================================
 *  FACTUR-X / CII — types d'entrée et de sortie du générateur XML
 * ============================================================================
 *  L'entrée est un SOUS-ENSEMBLE de la ligne `invoices` et des lignes
 *  `invoice_items` déjà chargées par les requêtes existantes (scopées tenant).
 *  Volontairement absents : `id`, `companyId`, et toute donnée du tenant
 *  courant (settings, companies, catalogue, fiche client). Le générateur ne
 *  peut donc travailler QUE sur les snapshots figés de la facture.
 * ============================================================================
 */

import type { InvoiceItemRow, InvoiceRow } from "@/lib/invoice/queries"
import type { FacturXProfile } from "./codes"

/** Champs snapshotés de la facture utilisés pour le XML. */
export type FacturXInvoiceSnapshot = Pick<
  InvoiceRow,
  | "number"
  | "status"
  | "documentType"
  | "originalInvoiceId"
  | "creditReason"
  | "currencyCode"
  | "issueDate"
  | "dueDate"
  | "serviceDate"
  // Acheteur (snapshot)
  | "customerName"
  | "customerEmail"
  | "customerAddress"
  | "customerType"
  | "customerCountry"
  | "customerLegalRegistrationNumber"
  | "customerLegalRegistrationScheme"
  | "customerVatNumber"
  | "customerComment"
  // Vendeur (snapshot)
  | "issuerName"
  | "issuerEmail"
  | "issuerAddress"
  | "issuerIban"
  | "issuerBic"
  | "issuerCountry"
  | "issuerLegalRegistrationNumber"
  | "issuerLegalRegistrationScheme"
  | "issuerVatNumber"
  // Fiscalité (snapshot)
  | "vatEnabled"
  | "vatRate"
  | "taxTreatment"
  | "taxLegalMention"
  // Montants (centimes, snapshot)
  | "itemsTotalCents"
  | "discountCents"
  | "netCents"
  | "vatCents"
  | "totalCents"
  | "depositCents"
  | "paidCents"
  | "balanceCents"
>

/** Champs snapshotés d'une ligne de facture utilisés pour le XML. */
export type FacturXInvoiceItem = Pick<
  InvoiceItemRow,
  "kind" | "label" | "description" | "quantity" | "unitPriceCents" | "sortOrder"
>

/** Référence de la facture d'origine (avoirs uniquement), snapshot. */
export type FacturXOriginalInvoiceRef = Pick<InvoiceRow, "number" | "issueDate">

export interface BuildFacturXXmlInput {
  invoice: FacturXInvoiceSnapshot
  items: readonly FacturXInvoiceItem[]
  originalInvoice?: FacturXOriginalInvoiceRef | null
}

/** Codes d'erreur stables (exploitables par l'UI / les tests). */
export type FacturXErrorCode =
  | "INVOICE_NOT_ISSUED"
  | "INVOICE_CANCELLED"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "MISSING_FIELD"
  | "INVALID_FIELD"
  | "UNKNOWN_LEGAL_SCHEME"
  | "TAX_TREATMENT_MISSING"
  | "TAX_DATA_CONFLICT"
  | "AMOUNT_MISMATCH"
  | "MISSING_PAYMENT_DUE_DATE"
  /** Avoir DetailFlow réel (sans échéance) : mapping règlement/BT-115 à trancher. */
  | "CREDIT_NOTE_SETTLEMENT_UNDECIDED"
  | "ORIGINAL_INVOICE_REFERENCE_MISSING"
  | "INVALID_XML_CHARACTER"

export interface FacturXError {
  code: FacturXErrorCode
  /** Chemin de la donnée concernée (ex. "invoice.issuerCountry", "items[2].label"). */
  field: string
  /** Règle EN16931 / Factur-X concernée quand elle existe (ex. "BR-11"). */
  rule?: string
  /** Message FR lisible. */
  message: string
}

export type BuildFacturXXmlResult =
  | { ok: true; xml: string; profile: FacturXProfile }
  | { ok: false; errors: FacturXError[] }
