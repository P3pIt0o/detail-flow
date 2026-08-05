import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/admin"
import { ClientForm } from "@/components/admin/client-form"

export const metadata: Metadata = { title: "Ajouter un client" }
export const dynamic = "force-dynamic"

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  await requireAdmin()
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
        <h1 className="text-2xl font-semibold text-foreground">Ajouter un client</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Créez une fiche client réutilisable pour vos réservations, devis et factures.
        </p>
      </div>
      <ClientForm />
    </div>
  )
}
