import type { Metadata } from "next"
import Link from "next/link"
import { requireCompanyMember } from "@/lib/admin"
import { listCustomRequests } from "@/lib/custom-requests-queries"
import { CustomRequestStatusBadge } from "@/components/admin/custom-request-status-badge"
import { formatDateShort } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"

export const metadata: Metadata = { title: "Demandes personnalisées" }
export const dynamic = "force-dynamic"

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  const { tenant: tenantParam } = await searchParams
  const rows = await listCustomRequests(tenant.id)

  const href = (path: string) => withTenant(path, tenantParam ?? null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Demandes personnalisées</h1>
        <p className="text-sm text-muted-foreground">
          Demandes sur mesure reçues depuis votre site. Envoyez une proposition, puis convertissez-la en
          rendez-vous une fois acceptée.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune demande pour le moment. Activez la fonctionnalité dans Paramètres → Demandes pour afficher le
            formulaire sur votre site.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Reçue le</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.customerName}</div>
                    <div className="text-xs text-muted-foreground">{r.customerEmail}</div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{r.typeLabel}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {formatDateShort(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <CustomRequestStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={href(`/admin/demandes/${r.id}`)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
