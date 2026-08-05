import type { Metadata } from "next"
import Link from "next/link"
import { UserPlus } from "lucide-react"
import { requireAdmin } from "@/lib/admin"
import { getMergedClients } from "@/lib/admin/queries"
import { ClientsTable } from "@/components/admin/clients-table"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Clients" }
export const dynamic = "force-dynamic"

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  await requireAdmin()
  const clients = await getMergedClients()
  const { tenant } = await searchParams
  const newHref = tenant ? `/admin/clients/new?tenant=${tenant}` : "/admin/clients/new"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Vos fiches clients et les clients issus des réservations, dédoublonnés.
          </p>
        </div>
        <Link href={newHref} className={buttonVariants()}>
          <UserPlus className="size-4" aria-hidden="true" />
          Ajouter un client
        </Link>
      </div>
      <ClientsTable clients={clients} />
    </div>
  )
}
