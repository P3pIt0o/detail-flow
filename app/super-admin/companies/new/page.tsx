import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { CreateCompanyForm } from "@/components/super-admin/create-company-form"

export const dynamic = "force-dynamic"

export default function NewCompanyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href="/super-admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Créer une entreprise</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provisionne l&apos;entreprise, son propriétaire, ses réglages et (au choix) un jeu de
          données de démonstration complet.
        </p>
      </div>
      <CreateCompanyForm rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null} />
    </div>
  )
}
