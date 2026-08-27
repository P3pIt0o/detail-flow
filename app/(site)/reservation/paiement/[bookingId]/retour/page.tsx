import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, Clock } from "lucide-react"
import { resolveRequestTenant } from "@/lib/tenant"
import { getBookingPaymentReturnInfo } from "@/lib/payments/queries"
import { withTenant } from "@/lib/tenant-link"
import { formatPrice, formatDateLong } from "@/lib/format"

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

  // Bornée au tenant : une réservation d'un autre tenant renvoie null → 404.
  const info = await getBookingPaymentReturnInfo(id, tenant.id)
  if (!info) notFound()

  const paid = info.paid

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

        {paid ? (
          <dl className="mx-auto mt-8 max-w-sm space-y-2 rounded-xl border border-border bg-card p-6 text-left text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Montant réglé</dt>
              <dd className="font-semibold text-card-foreground">
                {formatPrice(info.paidCents)}
                {info.type === "deposit" ? " (acompte)" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Référence</dt>
              <dd className="font-medium text-card-foreground">{info.reference}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Rendez-vous</dt>
              <dd className="text-card-foreground">
                <span className="capitalize">{formatDateLong(info.date)}</span> à {info.startTime}
              </dd>
            </div>
            {info.remainingCents > 0 ? (
              <div className="flex justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">Solde sur place</dt>
                <dd className="text-card-foreground">{formatPrice(info.remainingCents)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

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
