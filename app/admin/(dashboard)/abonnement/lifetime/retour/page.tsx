import type { Metadata } from "next"
import { requireCompanyMember } from "@/lib/admin"
import { getLifetimeAllocationForCheckoutSession } from "@/lib/billing/lifetime-server"
import { describeLifetimeReturnState, type LifetimeReturnState } from "@/lib/billing/lifetime-checkout-core"

export const metadata: Metadata = { title: "Licence Lifetime", robots: { index: false } }
export const dynamic = "force-dynamic"

const MESSAGES: Record<LifetimeReturnState, { title: string; body: string }> = {
  active: {
    title: "Licence Lifetime activée",
    body: "Votre paiement est confirmé. Votre espace dispose désormais de la licence Lifetime.",
  },
  pending: {
    title: "Paiement en cours de confirmation",
    body: "Stripe nous confirme le paiement dans quelques instants. Actualisez cette page si besoin.",
  },
  failed: {
    title: "Paiement non abouti",
    body: "Ce paiement n'a pas été finalisé. Aucune licence n'a été attribuée.",
  },
  cancelled: {
    title: "Paiement annulé",
    body: "Vous avez quitté le paiement. Aucun montant n'a été prélevé.",
  },
  unknown: {
    title: "Paiement introuvable",
    body: "Aucun paiement Lifetime ne correspond à cette session pour votre entreprise.",
  },
}

/**
 * Affichage de l'état DB UNIQUEMENT. Cette page n'active jamais de licence :
 * seule la confirmation signée du webhook Billing le peut.
 */
export default async function LifetimeReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; annule?: string }>
}) {
  const { tenant } = await requireCompanyMember(["OWNER"])
  const params = await searchParams
  const sessionId = typeof params.session_id === "string" && params.session_id.startsWith("cs_") ? params.session_id : null

  const allocation = sessionId
    ? await getLifetimeAllocationForCheckoutSession({ companyId: tenant.id, checkoutSessionId: sessionId })
    : null
  const state = describeLifetimeReturnState(allocation, params.annule === "1")
  const message = MESSAGES[state]

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-12">
      <h1 className="text-balance text-2xl font-semibold text-foreground">{message.title}</h1>
      <p className="text-pretty leading-relaxed text-muted-foreground">{message.body}</p>
    </main>
  )
}
