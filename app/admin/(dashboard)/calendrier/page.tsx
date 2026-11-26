import Link from "next/link"
import { Smartphone } from "lucide-react"
import { getBookingsBetween } from "@/lib/admin/queries"
import { AdminCalendar } from "@/components/admin/admin-calendar"
import { buttonVariants } from "@/components/ui/button"

export const metadata = { title: "Calendrier" }
export const dynamic = "force-dynamic"

export default async function CalendrierPage() {
  // On charge une large fenêtre (±3 mois) pour naviguer sans recharger.
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString().slice(0, 10)
  const bookings = await getBookingsBetween(start, end)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href="/admin/mon-agenda" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Smartphone className="size-4" /> Relier à mon téléphone
        </Link>
      </div>
      <AdminCalendar bookings={bookings} />
    </div>
  )
}
