import Link from "next/link"
import { listCompanies, listBetaLeads, getPlatformStats } from "@/lib/super-admin/queries"
import { buttonVariants } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { CompanyCard } from "@/components/super-admin/company-card"
import { BetaLeadsSection } from "@/components/super-admin/beta-leads-section"

export const dynamic = "force-dynamic"

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  )
}

export default async function SuperAdminDashboard() {
  const [stats, companies, leads] = await Promise.all([getPlatformStats(), listCompanies(), listBetaLeads()])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entreprises</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les entreprises de la plateforme, les demandes beta et les accès clients.
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

      {/* Workflow de validation des demandes beta */}
      <BetaLeadsSection leads={leads} rootDomain={ROOT_DOMAIN} />

      {/* Tableau de bord des entreprises */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Toutes les entreprises</h2>
        {companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucune entreprise pour le moment.
          </div>
        ) : (
          <div className="grid gap-3">
            {companies.map((c) => (
              <CompanyCard key={c.id} company={c} rootDomain={ROOT_DOMAIN} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
