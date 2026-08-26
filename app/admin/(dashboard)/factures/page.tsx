import type { Metadata } from "next"
import Link from "next/link"
import { FileText } from "lucide-react"
import { requireAdmin } from "@/lib/admin"
import { getInvoiceList } from "@/lib/invoice/queries"
import { invoiceStatusMeta } from "@/lib/invoice/calc"
import { formatMoney, formatDateShort } from "@/lib/format"

export const metadata: Metadata = { title: "Factures" }
export const dynamic = "force-dynamic"

export default async function InvoicesPage() {
  await requireAdmin()
  const invoices = await getInvoiceList()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Factures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Générez et suivez vos factures depuis les réservations terminées.
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Aucune facture pour le moment</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Ouvrez une réservation terminée et cliquez sur « Générer la facture » pour créer votre première facture.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 text-right font-medium">Total TTC</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Reste dû</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const meta = invoiceStatusMeta(inv.status)
                return (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/factures/${inv.id}`} className="font-mono font-medium text-primary hover:underline">
                          {inv.number ?? "Brouillon"}
                        </Link>
                        {inv.documentType === "credit_note" && (
                          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            Avoir
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{inv.customerName}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {inv.issueDate ? formatDateShort(inv.issueDate) : formatDateShort(inv.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatMoney(inv.totalCents, inv.currencyCode)}
                    </td>
                    <td className="hidden px-4 py-3 text-right md:table-cell">
                      {inv.balanceCents > 0 ? (
                        <span className="font-medium text-primary">{formatMoney(inv.balanceCents, inv.currencyCode)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
