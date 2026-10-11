import type { InvoicePdfData } from "./pdf"
import type { BuildFacturXXmlInput } from "./facturx/types"
import { canUseFacturX } from "./facturx-rollout"
import { checkFacturXReadiness } from "./facturx-eligibility"
import { toFacturXInput } from "./facturx-adapter"
import { buildFacturXPresentation } from "./facturx-presentation"

type Presentation = ReturnType<typeof buildFacturXPresentation>

type Renderers = {
  legacy?: (data: InvoicePdfData) => Promise<Buffer>
  final?: (
    input: BuildFacturXXmlInput,
    presentation: Presentation
  ) => Promise<Buffer>
}

export async function renderInvoicePdfSafe(
  data: InvoicePdfData & { companyId: number },
  renderers: Renderers = {}
): Promise<Buffer> {
  const { companyId, ...pdfData } = data

  const fallback = async (): Promise<Buffer> => {
    if (renderers.legacy) {
      return renderers.legacy(pdfData)
    }

    const { renderInvoicePdf } = await import("./pdf")
    return renderInvoicePdf(pdfData)
  }

  // Ne jamais activer hors pilote.
  if (!canUseFacturX(companyId)) {
    return fallback()
  }

  // Aucun moteur final raccorde pour le moment.
  // Le prototype de test est interdit ici.
  if (!renderers.final) {
    return fallback()
  }

  try {
    const input = toFacturXInput(data.invoice, data.items)
    const readiness = checkFacturXReadiness(input)

    if (!readiness.eligible) {
      return fallback()
    }

    const presentation = buildFacturXPresentation(
      data.invoice,
      data.logoDataUrl ?? null
    )

    const pdf = await renderers.final(input, presentation)

    if (
      !Buffer.isBuffer(pdf) ||
      pdf.subarray(0, 5).toString() !== "%PDF-"
    ) {
      throw new Error("FACTURX_INVALID_PDF")
    }

    return pdf
  } catch {
    console.warn("FACTURX_PILOT_FALLBACK")
    return fallback()
  }
}
