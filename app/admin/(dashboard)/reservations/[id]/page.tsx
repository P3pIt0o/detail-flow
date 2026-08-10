import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar, Clock, Mail, MapPin, Phone, User } from "lucide-react"
import { requireAdmin } from "@/lib/admin"
import { getBookingDetail } from "@/lib/admin/queries"
import { getInvoiceByBookingId } from "@/lib/invoice/queries"
import { StatusBadge } from "@/components/admin/status-badge"
import { BookingStatusActions } from "@/components/admin/booking-status-actions"
import { InvoiceButton } from "@/components/admin/invoice-button"
import { BookingNotes } from "@/components/admin/booking-notes"
import { formatPrice, formatDuration, formatDateLong } from "@/lib/format"
import type { BookingStatus } from "@/lib/booking/status"

export const metadata: Metadata = { title: "Détail réservation" }
export const dynamic = "force-dynamic"

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) notFound()

  const data = await getBookingDetail(numId)
  if (!data) notFound()
  const { booking, items } = data
  const existingInvoice = await getInvoiceByBookingId(booking.id)

  return (
    <div className="space-y-6">
      <Link
        href="/admin/reservations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux réservations
      </Link>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{booking.customerName}</h1>
            <StatusBadge status={booking.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{booking.reference}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <InvoiceButton
            bookingId={booking.id}
            bookingStatus={booking.status}
            existingInvoiceId={existingInvoice?.id ?? null}
          />
          <BookingStatusActions bookingId={booking.id} status={booking.status as BookingStatus} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-6 lg:col-span-2">
          {/* Rendez-vous */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Rendez-vous
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info icon={Calendar} label="Date" value={formatDateLong(booking.date)} />
              <Info
                icon={Clock}
                label="Horaire"
                value={`${booking.startTime} – ${booking.endTime} (${formatDuration(booking.totalDurationMin)})`}
              />
              <Info icon={MapPin} label="Adresse" value={booking.address} className="sm:col-span-2" />
            </div>
          </section>

          {/* Prestations */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Prestations ({items.length} véhicule{items.length > 1 ? "s" : ""})
            </h2>
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{item.serviceName}</p>
                      <p className="text-sm text-muted-foreground">{item.vehicleTypeName}</p>
                      {(item.vehicleBrand || item.vehicleModel || item.vehiclePlate) && (
                        <p className="mt-0.5 text-sm text-foreground">
                          {[item.vehicleBrand, item.vehicleModel].filter(Boolean).join(" ")}
                          {item.vehiclePlate ? ` · ${item.vehiclePlate}` : ""}
                        </p>
                      )}
                    </div>
                    <span className="font-medium text-foreground">{formatPrice(item.priceCents)}</span>
                  </div>
                  {item.options.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-3">
                      {item.options.map((opt) => (
                        <li key={opt.id} className="flex justify-between text-sm text-muted-foreground">
                          <span>+ {opt.optionName}</span>
                          <span>{formatPrice(opt.priceCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Notes internes */}
          <BookingNotes bookingId={booking.id} initialNotes={booking.notes ?? ""} />
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          {/* Contact */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Contact
            </h2>
            <div className="space-y-3">
              <Info icon={User} label="Nom" value={booking.customerName} />
              <Info icon={Mail} label="Email" value={booking.customerEmail} href={`mailto:${booking.customerEmail}`} />
              <Info icon={Phone} label="Téléphone" value={booking.customerPhone} href={`tel:${booking.customerPhone}`} />
            </div>
          </section>

          {/* Récapitulatif financier */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Montants
            </h2>
            <dl className="space-y-2 text-sm">
              <Line label="Prestations" value={formatPrice(booking.servicesCents)} />
              {booking.optionsCents > 0 && <Line label="Options" value={formatPrice(booking.optionsCents)} />}
              <Line
                label={`Déplacement${Number(booking.billedDistanceKm) > 0 ? ` (${booking.billedDistanceKm} km)` : ""}`}
                value={booking.travelFeeCents > 0 ? formatPrice(booking.travelFeeCents) : "Offert"}
              />
              <div className="border-t border-border pt-2">
                <Line label="Total" value={formatPrice(booking.totalCents)} strong />
              </div>
              {booking.depositCents > 0 && (
                <Line label="Acompte demandé" value={formatPrice(booking.depositCents)} accent />
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

function Info({
  icon: Icon,
  label,
  value,
  href,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  href?: string
  className?: string
}) {
  const content = href ? (
    <a href={href} className="text-foreground underline-offset-2 hover:underline">
      {value}
    </a>
  ) : (
    <span className="text-foreground">{value}</span>
  )
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-0.5 text-sm">{content}</p>
    </div>
  )
}

function Line({
  label,
  value,
  strong,
  accent,
}: {
  label: string
  value: string
  strong?: boolean
  accent?: boolean
}) {
  return (
    <div className="flex justify-between">
      <dt className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={
          accent
            ? "font-semibold text-primary"
            : strong
              ? "font-semibold text-foreground"
              : "text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  )
}
