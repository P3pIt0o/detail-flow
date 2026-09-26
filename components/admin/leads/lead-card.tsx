import Link from "next/link"
import { Car, ChevronRight, Wrench } from "lucide-react"
import type { FollowUpBucket, LeadSource, LeadStatus } from "@/lib/leads/model"
import { FollowUpBadge, LeadSourceBadge, LeadStatusBadge } from "./lead-badges"

/**
 * Carte compacte d'un prospect dans la liste. Optimisée MOBILE (375 px) : tout
 * est lisible sans tableau large. Le contact (téléphone/email) est affiché mais
 * les actions d'appel/mail vivent sur la fiche pour garder la liste sobre.
 */
export interface LeadCardData {
  id: number
  contactName: string
  status: LeadStatus
  source: LeadSource
  phone: string | null
  email: string | null
  vehicle: string | null
  serviceInterest: string | null
  followUpBucket: FollowUpBucket
  lastActivityLabel: string
}

export function LeadCard({ lead }: { lead: LeadCardData }) {
  return (
    <Link
      href={`/admin/leads/${lead.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 sm:p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-foreground">{lead.contactName}</span>
          <LeadStatusBadge status={lead.status} />
          {lead.followUpBucket !== "none" ? <FollowUpBadge bucket={lead.followUpBucket} /> : null}
        </div>

        {lead.vehicle || lead.serviceInterest ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {lead.vehicle ? (
              <span className="inline-flex items-center gap-1">
                <Car className="size-3.5" aria-hidden="true" />
                {lead.vehicle}
              </span>
            ) : null}
            {lead.serviceInterest ? (
              <span className="inline-flex items-center gap-1">
                <Wrench className="size-3.5" aria-hidden="true" />
                {lead.serviceInterest}
              </span>
            ) : null}
          </div>
        ) : null}

        {lead.phone || lead.email ? (
          <p className="truncate text-xs text-muted-foreground">{lead.phone ?? lead.email}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <LeadSourceBadge source={lead.source} />
          <span className="text-xs text-muted-foreground">{lead.lastActivityLabel}</span>
        </div>
      </div>

      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}
