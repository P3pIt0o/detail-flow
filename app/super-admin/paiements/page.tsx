import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireSuperAdmin } from "@/lib/admin"
import { getPlatformPaymentsOverview } from "@/lib/payments/config"
import { PaymentsOverview } from "@/components/super-admin/payments-overview"

export const dynamic = "force-dynamic"

export default async function SuperAdminPaymentsPage() {
  await requireSuperAdmin()
  const data = await getPlatformPaymentsOverview()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Paiements en ligne</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Commission de la plateforme et suivi des encaissements par entreprise.
        </p>
      </div>

      <PaymentsOverview data={data} />
    </div>
  )
}
