export const INVOICE_TEMPLATES = [
  "basic",
  "business_pro",
  "signature_premium",
] as const

export type InvoiceTemplate =
  (typeof INVOICE_TEMPLATES)[number]

export type InvoicePermissions = {
  invoice_logo: boolean
  invoice_template_choice: boolean
  invoice_photo: boolean
}

export function resolveInvoicePresentation(
  permissions: InvoicePermissions,
  requested?: string | null,
) {
  const canChoose = permissions.invoice_template_choice

  const selected: InvoiceTemplate =
    !canChoose
      ? "basic"
      : INVOICE_TEMPLATES.includes(requested as InvoiceTemplate)
        ? requested as InvoiceTemplate
        : "business_pro"

  return {
    template: selected,
    availableTemplates: canChoose
      ? [...INVOICE_TEMPLATES]
      : ["basic"] as InvoiceTemplate[],
    logoAllowed: permissions.invoice_logo,
    photoAllowed: canChoose && permissions.invoice_photo,
  }
}
