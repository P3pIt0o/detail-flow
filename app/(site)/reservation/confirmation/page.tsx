import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, Calendar, MapPin, Clock, Info } from "lucide-react"
import { getBookingByReference } from "@/lib/booking/queries"
import { formatPrice, formatDateLong, formatDuration } from "@/lib/format"
import { siteConfig } from "@/config/site"

export const metadata: Metadata = {
  title: "Réservation confirmée",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams
  if (!ref) notFound()

  const data = await getBookingByReference(ref)
  if (!data) notFound()

  const { booking, items } = data
  const awaitingDeposit = booking.status === "pending_deposit" && booking.depositCents > 0

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-balance font-serif text-3xl font-bold text-foreground">
            Réservation enregistrée
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Merci {booking.customerName.split(" ")[0]} ! Votre demande a bien été prise en compte. Un email de suivi
            vous sera envoyé à <span className="text-foreground">{booking.customerEmail}</span>.
          </p>
          <p className="mt-4 rounded-full bg-muted px-4 py-1.5 text-sm text-muted-foreground">
            Référence : <span className="font-semibold text-foreground">{booking.reference}</span>
          </p>
        </div>

        {awaitingDeposit && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                Acompte de {formatPrice(booking.depositCents)} à régler pour confirmer
              </p>
              <p className="mt-1 text-muted-foreground">
                Votre créneau est réservé provisoirement. Réglez l'acompte via les instructions envoyées par email
                (virement ou Wero). Le rendez-vous sera confirmé dès réception.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold text-card-foreground">Détails du rendez-vous</h2>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-card-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="capitalize">{formatDateLong(booking.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-card-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>
                {booking.startTime} – {booking.endTime} ({formatDuration(booking.totalDurationMin)})
              </span>
            </div>
            <div className="flex items-start gap-2 text-card-foreground sm:col-span-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{booking.address}</span>
            </div>
          </div>

          <ul className="mt-5 space-y-3 border-t border-border pt-5">
            {items.map((it) => (
              <li key={it.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{it.serviceName}</p>
                    <p className="text-xs text-muted-foreground">{it.vehicleTypeName}</p>
                    {it.options.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {it.options.map((o) => (
                          <li key={o.id} className="text-xs text-muted-foreground">
                            + {o.optionName} ({formatPrice(o.priceCents)})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-card-foreground">{formatPrice(it.priceCents)}</span>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-1.5 border-t border-border pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Prestations</dt>
              <dd className="text-card-foreground">{formatPrice(booking.servicesCents + booking.optionsCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Déplacement</dt>
              <dd className="text-card-foreground">
                {booking.travelFeeCents === 0 ? "Offert" : formatPrice(booking.travelFeeCents)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <dt className="text-card-foreground">Total</dt>
              <dd className="text-primary">{formatPrice(booking.totalCents)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retour à l'accueil
          </Link>
          <a
            href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Une question ? Appelez-nous
          </a>
        </div>
      </div>
    </section>
  )
}
