import type { ReactNode } from "react"
import Link from "next/link"
import { InfoRow, ToneBadge } from "./ui"

export type EarlyCancellationCardData = {
  id: number
  subscriptionId: number
  customerName: string
  vehicle: string | null
  planName: string
  requestedAt: string
  commitment: string
  contractEndsAt: string | null
  message: string | null
}

/**
 * Demande de fin anticipée en LECTURE. `actions` est le point d'ancrage prévu
 * pour les futures décisions (accepter / refuser) ; tant qu'il est absent,
 * aucun bouton n'est affiché.
 */
export function EarlyCancellationCard({ request, actions }: { request: EarlyCancellationCardData; actions?: ReactNode }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-semibold text-foreground">{request.customerName}</h3>
          <p className="text-sm text-muted-foreground">Demande d&apos;arrêt anticipé · {request.planName}</p>
        </div>
        <ToneBadge tone="warning">Décision à traiter</ToneBadge>
      </header>

      <dl className="flex flex-col gap-2">
        {request.vehicle && <InfoRow label="Véhicule">{request.vehicle}</InfoRow>}
        <InfoRow label="Demandée le">{request.requestedAt}</InfoRow>
        <InfoRow label="Engagement">{request.commitment}</InfoRow>
        <InfoRow label="Fin prévue au contrat">{request.contractEndsAt ?? "Aucune date fixée"}</InfoRow>
      </dl>

      {request.message && (
        <blockquote className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">« {request.message} »</blockquote>
      )}

      <p className="text-sm font-medium text-foreground">Cette demande n&apos;entraîne aucun remboursement automatique.</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/admin/abonnements-clients/abonnes/${request.subscriptionId}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Voir l&apos;abonnement
        </Link>
        {actions}
      </div>
    </article>
  )
}
