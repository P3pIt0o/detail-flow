import { cn } from "@/lib/utils"
import {
  FOLLOW_UP_BUCKET_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type FollowUpBucket,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/model"

/**
 * Badges PURS du CRM prospects (statut, source, relance). Aucune logique, aucun
 * hook : importables côté serveur comme côté client. Couleurs strictement issues
 * des tokens de thème (aucune couleur brute).
 */

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-primary/10 text-primary",
  CONTACTED: "bg-secondary text-secondary-foreground",
  APPOINTMENT_BOOKED: "bg-foreground/10 text-foreground",
  CLIENT: "bg-primary text-primary-foreground",
  LOST: "bg-destructive/10 text-destructive",
}

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}

export function LeadSourceBadge({ source, className }: { source: LeadSource; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground whitespace-nowrap",
        className,
      )}
    >
      {LEAD_SOURCE_LABELS[source]}
    </span>
  )
}

const FOLLOW_UP_STYLES: Record<Exclude<FollowUpBucket, "none">, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-primary/10 text-primary",
  upcoming: "bg-muted text-muted-foreground",
}

export function FollowUpBadge({ bucket, className }: { bucket: FollowUpBucket; className?: string }) {
  if (bucket === "none") return null
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        FOLLOW_UP_STYLES[bucket],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      À relancer · {FOLLOW_UP_BUCKET_LABELS[bucket]}
    </span>
  )
}
