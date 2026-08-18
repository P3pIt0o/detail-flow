import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CreditCard } from "lucide-react"
import { resolveRequestTenant } from "@/lib/tenant"
import { getBookingByReference } from "@/lib/booking/queries"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { formatPrice, formatDateLong } from "@/lib/format"
import { PaymentCheckout } from "@/components/booking/payment-checkout"

export const metadata: Metadata = {
  title: "Paiement de votre réservation",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function PaiementPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { bookingId } = await params
  const { ref } = await searchParams
  const id = Number.parseInt(bookingId, 10)
  if (!Number.isInteger(id) || id <= 0 || !ref) notFound()

  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  // Résumé de la réservation (borné au tenant). Montant relu côté serveur.
  const data = await getBookingByReference(ref, tenant.id)
  if (!data || data.booking.id !== id) notFound()

  const cfg = await getCompanyPaymentConfig(tenant.id)
  // Si les paiements ne sont pas disponibles, on ne bloque pas le client :
  // la réservation existe déjà. On renvoie vers la confirmation classique.
  if (!cfg?.paymentsEnabled || !cfg.canCollect || cfg.paymentMode === "none") {
    notFound()
  }

  const { booking, items } = data
  const isDeposit = cfg.paymentMode === "deposit"
  const amountCents = isDeposit ? booking.depositCents : booking.totalCents
  const remainingCents = isDeposit ? Math.max(0, booking.totalCents - booking.depositCents) : 0

  return (
    <section className="min-h-[70vh] bg-background py-12">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <CreditCard className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-balance font-serif text-2xl font-bold text-foreground sm:text-3xl">
            Finalisez votre réservation
          </h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            Référence <span className="font-semibold text-foreground">{booking.reference}</span> ·{" "}
            <span className="capitalize">{formatDateLong(booking.date)}</span> à {booking.startTime}
          </p>
        </div>

        {/* Récapitulatif du montant */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold text-card-foreground">Récapitulatif</h2>
          <ul className="mt-4 space-y-2 border-b border-border pb-4 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3">
                <span className="text-card-foreground">
                  {it.serviceName}
                  <span className="text-muted-foreground"> · {it.vehicleTypeName}</span>
                </span>
                <span className="font-medium text-card-foreground">{formatPrice(it.priceCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total de la prestation</dt>
              <dd className="text-card-foreground">{formatPrice(booking.totalCents)}</dd>
            </div>
            {isDeposit ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reste à payer sur place</dt>
                <dd className="text-card-foreground">{formatPrice(remainingCents)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt className="text-card-foreground">{isDeposit ? "Acompte à payer maintenant" : "À payer maintenant"}</dt>
              <dd className="text-primary">{formatPrice(amountCents)}</dd>
            </div>
          </dl>
        </div>

        {/* Checkout embarqué Stripe */}
        <div className="mt-8">
          <PaymentCheckout bookingId={id} />
        </div>
      </div>
    </section>
  )
}
