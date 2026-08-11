import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicCustomRequestsConfig } from "@/lib/site-content"
import { activeTypes, resolveCustomRequestTexts } from "@/lib/custom-requests"
import { CustomRequestForm } from "@/components/custom-request-form"

export const metadata: Metadata = {
  title: "Demande personnalisée",
  description: "Décrivez votre besoin et recevez une proposition adaptée.",
}

export const dynamic = "force-dynamic"

export default async function DemandePage() {
  const config = await getPublicCustomRequestsConfig()

  // Fonctionnalité désactivée par l'entreprise → la page n'existe pas.
  if (!config.enabled) notFound()

  const types = activeTypes(config)
  if (types.length === 0) notFound()

  const texts = resolveCustomRequestTexts(config)

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center">
          <h1 className="text-balance font-serif text-3xl font-bold text-foreground sm:text-4xl">{texts.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">{texts.description}</p>
        </div>
        <div className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <CustomRequestForm types={types} />
        </div>
      </div>
    </section>
  )
}
