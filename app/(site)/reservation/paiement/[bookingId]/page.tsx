import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CreditCard } from "lucide-react"
import { resolveRequestTenant } from "@/lib/tenant"
import { getBookingByReference } from "@/lib/booking/queries"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { formatPrice, formatDateLong } from "@/lib/format"
import { PaymentCheckout } from "@/components/booking/payment-checkout"
import { PaymentModeChoice } from "@/components/booking/payment-mode-choice"
import { STRIPE_MIN_CENTS } from "@/lib/payments/mode"

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
  const isChoice = cfg.paymentMode === "choice"
  const isDeposit = cfg.paymentMode === "deposit"
  // Acompte plafonné au total (jamais > total), cohérent avec le serveur.
  const depositCents = Math.min(booking.depositCents, booking.totalCents)
  const amountCents = isDeposit ? depositCents : booking.totalCents
  const remainingCents = Math.max(0, booking.totalCents - depositCents)

  // Snapshot promo durable enregistré sur la réservation (jamais recalculé).
  const promo = booking.promoCodeSnapshot as { code?: string } | null
  const promoCode = promo?.code ?? null
  const discountCents = booking.discountCents ?? 0
  // Prix initial = assiette avant remise et hors déplacement (services + options).
  const initialCents = booking.subtotalCents ?? booking.servicesCents + booking.optionsCents
  const travelFeeCents = booking.travelFeeCents ?? 0

  // Montant minimum encaissable par Stripe (0,50 € pour EUR). En dessous, on
  // n'ouvre PAS Stripe (qui refuserait) et on affiche une règle métier claire,
  // sans jamais substituer silencieusement un autre montant.
  const belowStripeMin = amountCents < STRIPE_MIN_CENTS
  // Mode "choice" : disponibilité de chaque option (encaissable en ligne).
  const depositAvailable = depositCents >= STRIPE_MIN_CENTS
  const fullAvailable = booking.totalCents >= STRIPE_MIN_CENTS

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
              <dt className="text-muted-foreground">Prix initial</dt>
              <dd className="text-card-foreground">{formatPrice(initialCents)}</dd>
            </div>
            {discountCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {promoCode ? `Code promo ${promoCode}` : "Remise"}
                </dt>
                <dd className="text-primary">−{formatPrice(discountCents)}</dd>
              </div>
            ) : null}
            {travelFeeCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Déplacement</dt>
                <dd className="text-card-foreground">{formatPrice(travelFeeCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="text-muted-foreground">{discountCents > 0 ? "Total après remise" : "Total de la prestation"}</dt>
              <dd className="text-card-foreground">{formatPrice(booking.totalCents)}</dd>
            </div>
            {isDeposit ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reste à payer sur place</dt>
                <dd className="text-card-foreground">{formatPrice(remainingCents)}</dd>
              </div>
            ) : null}
            {!isChoice ? (
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt className="text-card-foreground">{isDeposit ? "Acompte à payer maintenant" : "À payer maintenant"}</dt>
                <dd className="text-primary">{formatPrice(amountCents)}</dd>
              </div>
            ) : (
              <p className="mt-1 border-t border-border pt-3 text-sm text-muted-foreground">
                Choisissez ci-dessous de régler l&apos;acompte ou la totalité.
              </p>
            )}
          </dl>
        </div>

        {/* Checkout embarqué Stripe — sauf si le montant est sous le minimum Stripe */}
        <div className="mt-8">
          {isChoice ? (
            <PaymentModeChoice
              bookingId={id}
              depositLabel={formatPrice(depositCents)}
              totalLabel={formatPrice(booking.totalCents)}
              remainingLabel={formatPrice(remainingCents)}
              depositAvailable={depositAvailable && depositCents > 0}
              fullAvailable={fullAvailable}
              belowMinLabel={`Montant inférieur au minimum accepté en ligne (${formatPrice(STRIPE_MIN_CENTS)})`}
            />
          ) : belowStripeMin ? (
            <div
              role="alert"
              className="rounded-xl border border-border bg-muted/50 p-6 text-sm leading-relaxed text-muted-foreground"
            >
              <p className="font-semibold text-foreground">Paiement en ligne indisponible pour ce montant</p>
              <p className="mt-2">
                Le montant à régler ({formatPrice(amountCents)}) est inférieur au minimum accepté par notre
                prestataire de paiement ({formatPrice(STRIPE_MIN_CENTS)}). Votre réservation reste enregistrée :
                le règlement sera effectué directement auprès du professionnel. Aucun autre montant ne vous sera
                prélevé en ligne.
              </p>
            </div>
          ) : (
            <PaymentCheckout bookingId={id} />
          )}
        </div>
      </div>
    </section>
  )
}
