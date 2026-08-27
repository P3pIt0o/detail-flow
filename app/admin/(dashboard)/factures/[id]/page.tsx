import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { getInvoiceDetail } from "@/lib/invoice/queries"
import { InvoiceEditor } from "@/components/admin/invoice-editor"
import { InvoiceView } from "@/components/admin/invoice-view"
import { withTenant } from "@/lib/tenant-link"

export const metadata: Metadata = { title: "Facture" }
export const dynamic = "force-dynamic"

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  // Garde d'auth/tenant (l'accès à la facture est scopé companyId dans getInvoiceDetail).
  await requireCompanyMember()
  const { id } = await params
  const { tenant } = await searchParams
  const numId = Number(id)
  if (!Number.isInteger(numId)) notFound()

  const data = await getInvoiceDetail(numId)
  if (!data) notFound()

  return (
    <div className="space-y-6">
      <Link
        href={withTenant("/admin/factures", tenant ?? null)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux factures
      </Link>

      {data.invoice.status === "draft" ? (
        <InvoiceEditor invoice={data.invoice} items={data.items} originalInvoice={data.originalInvoice} />
      ) : (
        <InvoiceView
          invoice={data.invoice}
          items={data.items}
          payments={data.payments}
          events={data.events}
          creditNotes={data.creditNotes}
          creditSummary={data.creditSummary}
          originalInvoice={data.originalInvoice}
        />
      )}
    </div>
  )
}
