import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { getClients } from "@/lib/admin/queries"
import { ClientsTable } from "@/components/admin/clients-table"

export const metadata: Metadata = { title: "Clients" }
export const dynamic = "force-dynamic"

export default async function ClientsPage() {
  await requireAdmin()
  const raw = await getClients()

  const clients = raw.map((c) => ({
    email: c.email,
    name: c.name,
    phone: c.phone,
    bookingsCount: Number(c.bookingsCount),
    totalSpentCents: Number(c.totalSpent ?? 0),
    lastDate: c.lastDate,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Vos clients, agrégés par email, avec leur historique.
        </p>
      </div>
      <ClientsTable clients={clients} />
    </div>
  )
}
