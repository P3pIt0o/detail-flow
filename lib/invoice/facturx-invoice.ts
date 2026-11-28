import type { InvoicePdfData } from "./pdf"
import type { BuildFacturXXmlInput } from "./facturx/types"
import { buildFacturXXml } from "./facturx/xml"
import { canUseFacturX } from "./facturx-rollout"
import { checkFacturXReadiness } from "./facturx-eligibility"
import { toFacturXInput } from "./facturx-adapter"

type Renderers = {
  legacy?: (data: InvoicePdfData) => Promise<Buffer>
  final?: (data: InvoicePdfData, input: BuildFacturXXmlInput) => Promise<Buffer>
}

/**
 * Moteur Factur-X réel : le modèle de facture unique (`pdf.tsx`) avec police
 * incorporée, puis XML EN16931 embarqué (PDF/A-3b). Imports lourds différés.
 */
async function renderFacturXPdf(data: InvoicePdfData, input: BuildFacturXXmlInput): Promise<Buffer> {
  const xml = buildFacturXXml(input)
  if (!xml.ok) throw new Error("FACTURX_INVALID_SNAPSHOT")

  const { renderInvoicePdf } = await import("./pdf")
  const source = await renderInvoicePdf({ ...data, embeddedFonts: true })

  const { embedFacturXXmlInPdf } = await import("./facturx-pdfa")
  return embedFacturXXmlInPdf({ sourcePdf: source, xml: xml.xml, title: input.invoice.number ?? "Facture" })
}

/**
 * PDF d'une facture : Factur-X pour les seuls pilotes et factures éligibles,
 * sinon (ou en cas d'erreur) le PDF classique d'aujourd'hui.
 * `companyId` vient de l'appelant (contexte membre), la facture est déjà
 * chargée et scopée à ce tenant. Le journal ne contient que des identifiants
 * et des codes (aucune donnée client).
 */
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

  // Jamais activé hors pilote.
  if (!canUseFacturX(companyId)) {
    return fallback()
  }

  // Le repli est appelé HORS du try : une panne du PDF classique remonte telle
  // quelle et n'est jamais rejouée deux fois.
  let pdf: Buffer | null = null
  try {
    const input = toFacturXInput(pdfData.invoice, pdfData.items, pdfData.originalRef ?? null)
    const readiness = checkFacturXReadiness(input)

    if (!readiness.eligible) {
      console.warn("FACTURX_PILOT_FALLBACK", {
        companyId,
        invoiceId: pdfData.invoice.id,
        reason: "INELIGIBLE",
        codes: readiness.codes,
      })
    } else {
      const renderFinal = renderers.final ?? renderFacturXPdf
      const rendered = await renderFinal(pdfData, input)
      if (!Buffer.isBuffer(rendered) || rendered.subarray(0, 5).toString() !== "%PDF-") {
        throw new Error("FACTURX_INVALID_PDF")
      }
      pdf = rendered
    }
  } catch (error) {
    // Code uniquement : jamais le message brut ni le snapshot (données client).
    const raw = error instanceof Error ? error.message : ""
    const reason = /^FACTURX_[A-Z_]+$/.test(raw) ? raw : "RENDER_ERROR"
    console.warn("FACTURX_PILOT_FALLBACK", {
      companyId,
      invoiceId: pdfData.invoice.id,
      reason,
    })
  }

  return pdf ?? fallback()
}
