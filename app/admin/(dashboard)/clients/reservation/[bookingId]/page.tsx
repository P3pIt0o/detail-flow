import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireCompanyMember } from "@/lib/admin"
import { getClientProfileByBookingId } from "@/lib/admin/client-profile"
import { ClientProfileView } from "@/components/admin/client-profile-view"

export const metadata: Metadata = { title: "Fiche client" }
export const dynamic = "force-dynamic"

/**
 * Fiche VIRTUELLE d'un client issu uniquement des réservations.
 *
 * L'identifiant de route est une RÉSERVATION représentative (jamais l'email ni
 * le téléphone du client). Anti-IDOR : le tenant est résolu côté serveur, la
 * réservation est chargée avec son filtre companyId, et une réservation
 * appartenant à un autre tenant renvoie notFound() (résultat neutre).
 */
export default async function ClientReservationFichePage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  const { bookingId } = await params
  const { tenant: tenantParam } = await searchParams
  const numId = Number(bookingId)
  if (!Number.isInteger(numId) || numId <= 0) notFound()

  const profile = await getClientProfileByBookingId(numId, tenant.id)
  if (!profile) notFound()

  return <ClientProfileView profile={profile} tenantParam={tenantParam ?? null} tenantSlug={tenant.slug} />
}
