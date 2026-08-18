import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, Clock } from "lucide-react"
import { resolveRequestTenant } from "@/lib/tenant"
import { bookingHasPaidPayment } from "@/lib/payments/queries"
import { withTenant } from "@/lib/tenant-link"

export const metadata: Metadata = {
  title: "Paiement",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

/**
 * Page de retour après le checkout Stripe. IMPORTANT : la confirmation du
 * paiement fait foi UNIQUEMENT via le webhook signé (jamais via ce retour
 * navigateur). Ici on lit seulement l'état serveur pour informer le client.
 */
export default async function PaiementRetourPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  const id = Number.parseInt(bookingId, 10)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  const paid = await bookingHasPaidPayment(id, tenant.id)

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-lg px-4 text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            paid ? "bg-primary/15" : "bg-muted"
          }`}
        >
          {paid ? (
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
          ) : (
            <Clock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <h1 className="mt-6 text-balance font-serif text-2xl font-bold text-foreground sm:text-3xl">
          {paid ? "Paiement reçu, merci !" : "Paiement en cours de validation"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {paid
            ? "Votre réservation est confirmée. Un email récapitulatif vous a été envoyé."
            : "Votre paiement est en cours de traitement. Vous recevrez un email de confirmation dès qu'il sera validé — inutile de payer à nouveau."}
        </p>
        <div className="mt-8">
          <Link
            href={withTenant("/", tenant.slug)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </section>
  )
}
