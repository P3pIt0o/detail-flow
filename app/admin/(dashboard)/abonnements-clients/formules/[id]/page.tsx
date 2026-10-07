import type { Metadata } from "next"
import Link from "next/link"
import { withTenant } from "@/lib/tenant-link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { requireAdminCompanyId } from "@/lib/admin/admin-company"
import { getAdminOverview, getPlanForEdit, listServiceOptions, planRowToConfig } from "@/lib/customer-subscriptions/admin-queries"
import { planFormFromConfig } from "@/lib/customer-subscriptions/plan-form"
import { PlanConfigurator } from "@/components/admin/customer-subscriptions/plan-configurator"
import { EmptyState } from "@/components/admin/customer-subscriptions/ui"

export const metadata: Metadata = { title: "Modifier la formule" }
export const dynamic = "force-dynamic"

export default async function EditPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  await requireAdmin()
  const companyId = await requireAdminCompanyId()
  const [{ id }, { tenant = null }] = await Promise.all([params, searchParams])
  const planId = Number(id)
  if (!Number.isInteger(planId) || planId <= 0) notFound()

  const [found, services, overview] = await Promise.all([
    getPlanForEdit(companyId, planId),
    listServiceOptions(companyId),
    getAdminOverview(companyId),
  ])
  if (!found) notFound()
  const { company } = overview
  const paymentsReady = Boolean(company.stripeAccountId && company.stripeChargesEnabled && company.paymentsEnabled)
  const config = planRowToConfig(found.plan)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={withTenant("/admin/abonnements-clients?vue=formules", tenant)} className="text-sm text-muted-foreground hover:text-foreground">
          ← Abonnements clients
        </Link>
        <h1 className="text-2xl font-semibold text-foreground text-balance">{config.name}</h1>
      </div>
      {found.plan.status === "archived" ? (
        <EmptyState title="Cette formule est archivée">Elle n&apos;est plus proposée. Vos abonnés actuels gardent leurs conditions.</EmptyState>
      ) : (
        <PlanConfigurator
          planId={planId}
          initial={planFormFromConfig(config)}
          services={services}
          paymentsReady={paymentsReady}
          hasSubscribers={found.hasSubscribers}
          publicMode={company.publicMode}
        />
      )}
    </div>
  )
}
