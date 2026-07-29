"use client"

import { useRouter } from "next/navigation"
import { Calendar, Clock, Car, MapPin, Phone, Mail, Euro } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/admin/status-badge"
import { BookingStatusActions } from "@/components/admin/booking-status-actions"
import { InvoiceButton } from "@/components/admin/invoice-button"
import { formatPrice, formatDateLong, formatDuration } from "@/lib/format"
import type { CalendarBooking } from "@/lib/admin/types"

// Dialogue de détail rapide (calendrier). Pour le détail complet avec lignes,
// on renvoie vers la page dédiée /admin/reservations/[id].
export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: CalendarBooking | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg">{booking.customerName}</DialogTitle>
            <StatusBadge status={booking.status} />
          </div>
          <DialogDescription className="font-mono text-xs">{booking.reference}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <Row icon={Calendar} label={formatDateLong(booking.date)} />
          <Row
            icon={Clock}
            label={`${booking.startTime} – ${booking.endTime} (${formatDuration(booking.totalDurationMin)})`}
          />
          <Row icon={Car} label={`${booking.vehicles} véhicule${booking.vehicles > 1 ? "s" : ""}`} />
          <Row icon={Euro} label={formatPrice(booking.totalCents)} />
        </dl>

        <div className="mt-2 border-t border-border pt-4">
          <BookingStatusActions
            bookingId={booking.id}
            status={booking.status}
            onDone={() => {
              onOpenChange(false)
              router.refresh()
            }}
          />
        </div>

        {booking.status === "completed" && (
          <div className="pt-1">
            <InvoiceButton
              bookingId={booking.id}
              bookingStatus={booking.status}
              variant="outline"
              onNavigate={() => onOpenChange(false)}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push(`/admin/reservations/${booking.id}`)}
          className="mt-1 text-left text-sm font-medium text-primary hover:underline"
        >
          Voir le détail complet →
        </button>
      </DialogContent>
    </Dialog>
  )
}

function Row({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-foreground">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="capitalize">{label}</span>
    </div>
  )
}
