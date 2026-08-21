import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { getCustomRequestById } from "@/lib/custom-requests-queries"
import { CustomRequestStatusBadge } from "@/components/admin/custom-request-status-badge"
import { CustomRequestDetail } from "@/components/admin/custom-request-detail"
import { formatDateLong } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"

export const metadata: Metadata = { title: "Demande personnalisée" }
export const dynamic = "force-dynamic"

export default async function DemandeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  const { id } = await params
  const { tenant: tenantParam } = await searchParams
  const requestId = Number.parseInt(id, 10)
  if (!Number.isFinite(requestId)) notFound()

  const req = await getCustomRequestById(requestId, tenant.id)
  if (!req) notFound()

  const tp = tenantParam ?? null
  const detailRows: { label: string; value: string }[] = []
  const push = (label: string, value?: string | null) => {
    if (value && value.trim()) detailRows.push({ label, value })
  }
  push("Type de véhicule", req.vehicleType)
  push("Marque", req.vehicleBrand)
  push("Modèle", req.vehicleModel)
  push("Société / flotte", req.fleetCompanyName)
  push("Nombre de véhicules", req.vehicleCount)
  push("Fréquence", req.frequency)
  push("Numéro d'entreprise / identifiant légal", req.customerLegalRegistrationNumber)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={withTenant("/admin/demandes", tp)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Toutes les demandes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{req.customerName}</h1>
          <p className="text-sm text-muted-foreground">
            {req.typeLabel} · reçue le {formatDateLong(req.createdAt)}
          </p>
        </div>
        <CustomRequestStatusBadge status={req.status} className="h-7 px-3 text-sm" />
      </div>

      {/* Coordonnées + besoin */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" value={req.customerEmail} />
          <Field label="Téléphone" value={req.customerPhone} />
          {detailRows.map((d) => (
            <Field key={d.label} label={d.label} value={d.value} />
          ))}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Besoin décrit</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{req.description}</p>
        </div>
      </section>

      {/* Proposition / acceptation / conversion (interactif) */}
      <CustomRequestDetail
        request={{
          id: req.id,
          status: req.status,
          customerName: req.customerName,
          vehicleBrand: req.vehicleBrand,
          vehicleModel: req.vehicleModel,
          proposalTitle: req.proposalTitle,
          proposalDescription: req.proposalDescription,
          proposalPriceCents: req.proposalPriceCents,
          proposalDurationMin: req.proposalDurationMin,
          proposalMessage: req.proposalMessage,
          bookingId: req.bookingId,
        }}
        tenantParam={tp}
      />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  )
}
