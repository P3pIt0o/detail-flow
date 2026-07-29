import Link from "next/link"
import { listCompanies, getPlatformStats } from "@/lib/super-admin/queries"
import { buttonVariants } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { CompanyRowActions } from "@/components/super-admin/company-row-actions"
import { tenantPublicUrl } from "@/lib/tenant-shared"

export const dynamic = "force-dynamic"

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  BETA: "Beta",
  ACTIVE: "Active",
  SUSPENDED: "Suspendue",
  ARCHIVED: "Archivée",
}

function statusClasses(status: string, expired: boolean): string {
  if (expired) return "bg-destructive/10 text-destructive"
  switch (status) {
    case "ACTIVE":
      return "bg-primary/10 text-primary"
    case "BETA":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    case "SUSPENDED":
      return "bg-destructive/10 text-destructive"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default async function SuperAdminDashboard() {
  const [stats, companies] = await Promise.all([getPlatformStats(), listCompanies()])
  const now = Date.now()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entreprises</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les entreprises de la plateforme et créez des démonstrations.
          </p>
        </div>
        <Link href="/super-admin/companies/new" className={buttonVariants()}>
          <Plus className="size-4" aria-hidden="true" />
          Créer une entreprise
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Beta" value={stats.beta} accent />
        <StatCard label="Actives" value={stats.active} />
        <StatCard label="Suspendues" value={stats.suspended} />
        <StatCard label="Beta expirées" value={stats.betaExpired} />
        <StatCard label="Réservations" value={stats.totalBookings} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Entreprise</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Beta jusqu&apos;au</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Réservations</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune entreprise pour le moment.
                </td>
              </tr>
            )}
            {companies.map((c) => {
              const expired =
                c.status === "BETA" && c.betaEndsAt != null && new Date(c.betaEndsAt).getTime() < now
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <a
                      href={tenantPublicUrl(c.slug, ROOT_DOMAIN)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {c.slug}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(c.status, expired)}`}
                    >
                      {expired ? "Beta expirée" : STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {c.betaEndsAt ? new Date(c.betaEndsAt).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{c.bookingCount}</td>
                  <td className="px-4 py-3">
                    <CompanyRowActions companyId={c.id} status={c.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
