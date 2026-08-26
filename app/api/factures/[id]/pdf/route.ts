import { type NextRequest, NextResponse } from "next/server"
import { getCompanyMemberContext } from "@/lib/admin"
import { getInvoiceDetail } from "@/lib/invoice/queries"
import { renderInvoicePdf } from "@/lib/invoice/pdf"
import { getLogoDataUrl } from "@/lib/invoice/logo"

// @react-pdf/renderer nécessite le runtime Node.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth + appartenance à l'entreprise courante (résolue par hostname).
  const ctx = await getCompanyMemberContext()
  if (!ctx) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 })
  }

  // Facture strictement scopée à l'entreprise : une facture d'un autre tenant
  // renvoie 404, même pour un utilisateur authentifié.
  const data = await getInvoiceDetail(numId, ctx.tenant.id)
  if (!data) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
  }

  const logoDataUrl = await getLogoDataUrl(data.invoice.issuerLogoPathname)
  const originalRef = data.originalInvoice
    ? { number: data.originalInvoice.number, issueDate: data.originalInvoice.issueDate }
    : null
  const pdf = await renderInvoicePdf({ invoice: data.invoice, items: data.items, logoDataUrl, originalRef })

  const filename = `${data.invoice.number || `facture-${numId}`}.pdf`
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
