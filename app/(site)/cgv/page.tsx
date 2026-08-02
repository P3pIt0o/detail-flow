import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"
import { getCurrentTenant } from "@/lib/tenant"

export const metadata: Metadata = {
  title: "Conditions Générales de Vente",
  description: "Conditions générales de vente.",
  alternates: { canonical: "/cgv" },
  robots: { index: false, follow: true },
}

export default async function CgvPage() {
  // ISOLATION : on n'affiche QUE les CGV de l'entreprise résolue pour ce site.
  const tenant = await getCurrentTenant()
  const cgv = tenant?.cgv?.trim() || ""

  const lastUpdated = tenant?.updatedAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(
        new Date(tenant.updatedAt),
      )
    : null

  return (
    <>
      <PageHeader
        title="Conditions Générales de Vente"
        description={lastUpdated ? `Dernière mise à jour : ${lastUpdated}` : undefined}
      />
      <LegalContent>
        {cgv ? (
          // Texte libre saisi par l'entreprise : on préserve les sauts de ligne.
          <p className="whitespace-pre-wrap">{cgv}</p>
        ) : (
          <p>
            Les conditions générales de vente ne sont pas encore renseignées. Elles seront publiées ici prochainement.
          </p>
        )}
      </LegalContent>
    </>
  )
}
