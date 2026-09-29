import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { withTenant } from "@/lib/tenant-link"
import { CustomWebsiteForm } from "./custom-website-form"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Site personnalisé — DetailFlow",
  description: "Décrivez votre projet de site sur mesure : notre équipe l'étudie et revient vers vous.",
}

export default async function CustomWebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await searchParams
  const { user, tenant: company } = await requireCompanyMember()
  const backHref = withTenant("/admin", tenant ?? null)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour au tableau de bord
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Votre site personnalisé</h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Un site sur mesure DetailFlow est conçu spécifiquement pour votre activité. Décrivez votre projet ci-dessous :
          notre équipe l&apos;étudie et revient vers vous pour définir la suite. Pendant ce temps, votre espace
          (réservations, clients, facturation) reste pleinement utilisable.
        </p>
      </header>

      <CustomWebsiteForm
        defaults={{
          companyName: company.name ?? "",
          city: company.city ?? "",
          currentSite: company.websiteUrl ?? "",
          contactName: user.name ?? "",
          contactEmail: user.email ?? "",
          contactPhone: company.phone ?? "",
        }}
      />
    </div>
  )
}
