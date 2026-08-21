import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/admin"
import { requireCompanyId } from "@/lib/tenant"
import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { ClientForm } from "@/components/admin/client-form"

export const metadata: Metadata = { title: "Modifier un client" }
export const dynamic = "force-dynamic"

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  await requireAdmin()
  const companyId = await requireCompanyId()
  const { id } = await params
  const clientId = Number(id)
  if (!Number.isInteger(clientId) || clientId <= 0) notFound()

  // Anti-IDOR : lecture STRICTEMENT scopée au tenant courant.
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
    .limit(1)
  if (!client) notFound()

  const { tenant } = await searchParams
  const backHref = tenant ? `/admin/clients?tenant=${tenant}` : "/admin/clients"

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour aux clients
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Modifier un client</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Mettez à jour la fiche et confirmez le type de client pour votre facturation.
        </p>
      </div>
      <ClientForm
        initial={{
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          notes: client.notes,
          customerType: client.customerType,
          country: client.country,
          legalRegistrationNumber: client.legalRegistrationNumber,
          legalRegistrationScheme: client.legalRegistrationScheme,
          vatNumber: client.vatNumber,
        }}
      />
    </div>
  )
}
