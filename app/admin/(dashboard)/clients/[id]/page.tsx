import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireCompanyMember } from "@/lib/admin"
import { getClientProfileByClientId } from "@/lib/admin/client-profile"
import { ClientProfileView } from "@/components/admin/client-profile-view"

export const metadata: Metadata = { title: "Fiche client" }
export const dynamic = "force-dynamic"

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  // Tenant résolu côté serveur (jamais depuis le navigateur).
  const { tenant } = await requireCompanyMember()
  const { id } = await params
  const { tenant: tenantParam } = await searchParams
  const clientId = Number(id)
  if (!Number.isInteger(clientId) || clientId <= 0) notFound()

  // Profil calculé, STRICTEMENT scopé au tenant courant. Un id d'une autre
  // entreprise renvoie null → notFound (résultat neutre, aucune fuite).
  const profile = await getClientProfileByClientId(clientId, tenant.id)
  if (!profile) notFound()

  return <ClientProfileView profile={profile} tenantParam={tenantParam ?? null} tenantSlug={tenant.slug} />
}
