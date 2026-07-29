import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { getAllBookings } from "@/lib/admin/queries"
import { ReservationsTable } from "@/components/admin/reservations-table"

export const metadata: Metadata = { title: "Réservations" }
export const dynamic = "force-dynamic"

export default async function ReservationsPage() {
  await requireAdmin()
  const bookings = await getAllBookings()

  const rows = bookings.map((b) => ({
    id: b.id,
    reference: b.reference,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
    totalCents: b.totalCents,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Réservations</h1>
        <p className="text-sm text-muted-foreground">
          Toutes les demandes de réservation, filtrables par statut.
        </p>
      </div>
      <ReservationsTable rows={rows} />
    </div>
  )
}
