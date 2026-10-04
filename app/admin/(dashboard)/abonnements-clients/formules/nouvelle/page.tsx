import type { Metadata } from "next"
import Link from "next/link"
import { requireAdmin } from "@/lib/admin"
import { requireCompanyId } from "@/lib/tenant"
import { getAdminOverview, listServiceOptions } from "@/lib/customer-subscriptions/admin-queries"
import { DEFAULT_PLAN_FORM } from "@/lib/customer-subscriptions/plan-form"
import { PlanConfigurator } from "@/components/admin/customer-subscriptions/plan-configurator"

export const metadata: Metadata = { title: "Nouvelle formule" }
export const dynamic = "force-dynamic"

export default async function NewPlanPage() {
  await requireAdmin()
  const companyId = await requireCompanyId()
  const [services, overview] = await Promise.all([listServiceOptions(companyId), getAdminOverview(companyId)])
  const { company } = overview
  const paymentsReady = Boolean(company.stripeAccountId && company.stripeChargesEnabled && company.paymentsEnabled)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/abonnements-clients?vue=formules" className="text-sm text-muted-foreground hover:text-foreground">
          ← Abonnements clients
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Nouvelle formule</h1>
      </div>
      <PlanConfigurator
        planId={null}
        initial={DEFAULT_PLAN_FORM}
        services={services}
        paymentsReady={paymentsReady}
        hasSubscribers={false}
        publicMode={company.publicMode}
      />
    </div>
  )
}
