import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicCustomRequestsConfig } from "@/lib/site-content"
import { activeTypes, findRequestType, resolveCustomRequestTexts } from "@/lib/custom-requests"
import { CustomRequestForm } from "@/components/custom-request-form"
import { clzNeonPage } from "@/components/custom-sites/cleanyzer/neon-page"

export const metadata: Metadata = {
  title: "Demande personnalisée",
  description: "Décrivez votre besoin et recevez une proposition adaptée.",
}

export const dynamic = "force-dynamic"

export default async function DemandePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>
}) {
  const config = await getPublicCustomRequestsConfig()
  const requestedType = (await searchParams).type
  // Présélection acceptée seulement si le type est ACTIF pour ce tenant, sinon premier type.
  const initialType =
    typeof requestedType === "string" ? findRequestType(config, requestedType)?.key : undefined

  // Fonctionnalité désactivée par l'entreprise → la page n'existe pas.
  if (!config.enabled) notFound()

  const types = activeTypes(config)
  if (types.length === 0) notFound()

  const texts = resolveCustomRequestTexts(config)

  // L59 : coquille et thème néon si le site publié du tenant est Cleanyzer ; sinon rendu inchangé.
  return clzNeonPage(
    <section className="min-h-[70vh] bg-background pb-16 pt-24 md:pt-28">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center">
          <h1 className="text-balance font-serif text-3xl font-bold text-foreground sm:text-4xl">{texts.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">{texts.description}</p>
        </div>
        <div className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <CustomRequestForm types={types} initialType={initialType} />
        </div>
      </div>
    </section>,
  )
}
