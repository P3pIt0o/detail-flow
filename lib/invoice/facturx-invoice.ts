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

  // Second verrou explicite pour le moteur reel : désactivé par défaut.
  // Les injections de tests restent possibles uniquement dans le pilote.
  const liveRendererEnabled =
    process.env.FACTURX_C4_FINAL_RENDERER_ENABLED === "true"
  if (!renderers.final && !liveRendererEnabled) {
    return fallback()
  }

  try {
    const input = toFacturXInput(data.invoice, data.items)
    const readiness = checkFacturXReadiness(input)

    if (!readiness.eligible) {
      console.warn("FACTURX_PILOT_FALLBACK", {
        companyId,
        invoiceId: data.invoice.id,
        reason: "INELIGIBLE",
        codes: readiness.codes,
      })
      return fallback()
    }

    const presentation = buildFacturXPresentation(
      data.invoice,
      data.logoDataUrl ?? null
    )

    // Import Node/PDF lourd seulement après les contrôles pilote + éligibilité.
    // Ne jamais importer le prototype dans le flux de facturation réel.
    const renderFinal = renderers.final ?? (
      await import("./facturx-visual-core")
    ).renderFacturXBusinessProPdf

    const pdf = await renderFinal(input, presentation)

    if (
      !Buffer.isBuffer(pdf) ||
      pdf.subarray(0, 5).toString() !== "%PDF-"
    ) {
      throw new Error("FACTURX_INVALID_PDF")
    }

    return pdf
  } catch (error) {
    // Message tronqué au code : ne pas journaliser le snapshot (données client).
    const message = error instanceof Error ? error.message : String(error)
    console.warn("FACTURX_PILOT_FALLBACK", {
      companyId,
      invoiceId: data.invoice.id,
      reason: message.split(":")[0].slice(0, 80),
    })
    return fallback()
  }
}
