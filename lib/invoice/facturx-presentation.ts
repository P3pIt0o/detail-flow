import type { InvoiceRow } from "./queries"

type Fields = Pick<
  InvoiceRow,
  | "issuerPhone"
  | "customerPhone"
  | "vehicleTypeName"
  | "vehicleBrand"
  | "vehicleModel"
  | "vehiclePlate"
  | "footerNote"
  | "legalMentions"
>

export function buildFacturXPresentation(
  invoice: Fields,
  logoDataUrl: string | null
) {
  const vehicle =
    [invoice.vehicleBrand, invoice.vehicleModel]
      .filter(Boolean)
      .join(" ") ||
    invoice.vehicleTypeName ||
    null

  return {
    logoDataUrl,
    issuerPhone: invoice.issuerPhone,
    customerPhone: invoice.customerPhone,
    vehicle,
    vehiclePlate: invoice.vehiclePlate,
    footerNote: invoice.footerNote,
    legalMentions: invoice.legalMentions,
  }
}
