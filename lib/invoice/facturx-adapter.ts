import type {
  InvoiceRow,
  InvoiceItemRow,
} from "@/lib/invoice/queries"

import type {
  BuildFacturXXmlInput,
} from "./facturx/types"

/**
 * Convertit une facture deja chargee et scopee
 * au tenant en snapshot Factur-X.
 * Aucun acces DB, aucun recalcul de montants.
 */
export function toFacturXInput(
  inv: InvoiceRow,
  rows: readonly InvoiceItemRow[],
): BuildFacturXXmlInput {
  return {
    invoice: {
      number: inv.number,
      status: inv.status,
      documentType: inv.documentType,
      originalInvoiceId: inv.originalInvoiceId,
      creditReason: inv.creditReason,
      currencyCode: inv.currencyCode,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      serviceDate: inv.serviceDate,

      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      customerAddress: inv.customerAddress,
      customerType: inv.customerType,
      customerCountry: inv.customerCountry,
      customerLegalRegistrationNumber:
        inv.customerLegalRegistrationNumber,
      customerLegalRegistrationScheme:
        inv.customerLegalRegistrationScheme,
      customerVatNumber: inv.customerVatNumber,
      customerComment: inv.customerComment,

      issuerName: inv.issuerName,
      issuerEmail: inv.issuerEmail,
      issuerAddress: inv.issuerAddress,
      issuerIban: inv.issuerIban,
      issuerBic: inv.issuerBic,
      issuerCountry: inv.issuerCountry,
      issuerLegalRegistrationNumber:
        inv.issuerLegalRegistrationNumber,
      issuerLegalRegistrationScheme:
        inv.issuerLegalRegistrationScheme,
      issuerVatNumber: inv.issuerVatNumber,

      vatEnabled: inv.vatEnabled,
      vatRate: inv.vatRate,
      taxTreatment: inv.taxTreatment,
      taxLegalMention: inv.taxLegalMention,

      itemsTotalCents: inv.itemsTotalCents,
      discountCents: inv.discountCents,
      netCents: inv.netCents,
      vatCents: inv.vatCents,
      totalCents: inv.totalCents,
      depositCents: inv.depositCents,
      paidCents: inv.paidCents,
      balanceCents: inv.balanceCents,
    },

    items: rows.map((item) => ({
      kind: item.kind,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      sortOrder: item.sortOrder,
    })),
  }
}
