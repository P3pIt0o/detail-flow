import {
  BellOff,
  BellRing,
  CalendarPlus,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Shuffle,
} from "lucide-react"
import {
  LEAD_LOST_REASON_LABELS,
  LEAD_STATUS_LABELS,
  isLeadLostReason,
  isLeadStatus,
  type LeadActivityType,
} from "@/lib/leads/model"

/**
 * Historique chronologique d'un prospect (fiche). PUR : reçoit les activités
 * déjà chargées côté serveur (aucune requête ici). Les libellés sont dérivés du
 * type + metadata — jamais de chaîne FR stockée en base.
 */
export interface ActivityItemData {
  id: number
  type: LeadActivityType
  message: string | null
  metadata: Record<string, unknown> | null
  createdAtLabel: string
}

const ICONS: Record<LeadActivityType, typeof PlusCircle> = {
  CREATED: PlusCircle,
  STATUS_CHANGED: Shuffle,
  NOTE_ADDED: MessageSquare,
  FOLLOW_UP_SET: BellRing,
  FOLLOW_UP_CLEARED: BellOff,
  SOURCE_SYNCED: RefreshCw,
  BOOKING_LINKED: CalendarPlus,
  REOPENED: RotateCcw,
}

function statusLabel(v: unknown): string {
  return isLeadStatus(v) ? LEAD_STATUS_LABELS[v] : String(v ?? "")
}

function describe(item: ActivityItemData): string {
  const m = item.metadata ?? {}
  switch (item.type) {
    case "CREATED":
      return "Prospect créé"
    case "STATUS_CHANGED": {
      const parts = `${statusLabel(m.from)} → ${statusLabel(m.to)}`
      if (isLeadLostReason(m.lostReason)) return `Statut : ${parts} · ${LEAD_LOST_REASON_LABELS[m.lostReason]}`
      return `Statut : ${parts}`
    }
    case "NOTE_ADDED":
      return "Note ajoutée"
    case "FOLLOW_UP_SET":
      return "Relance planifiée"
    case "FOLLOW_UP_CLEARED":
      return "Relance supprimée"
    case "SOURCE_SYNCED":
      return `Synchronisé (${statusLabel(m.from)} → ${statusLabel(m.to)})`
    case "BOOKING_LINKED":
      return "Réservation liée"
    case "REOPENED":
      return `Rouvert (${statusLabel(m.from)} → ${statusLabel(m.to)})`
    default:
      return "Activité"
  }
}

export function LeadActivityList({ activities }: { activities: ActivityItemData[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune activité pour le moment.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {activities.map((item) => {
        const Icon = ICONS[item.type] ?? PlusCircle
        return (
          <li key={item.id} className="flex gap-3">
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm text-foreground">{describe(item)}</p>
              {item.type === "NOTE_ADDED" && item.message ? (
                <p className="rounded-lg bg-muted/60 p-2 text-sm text-foreground whitespace-pre-wrap">
                  {item.message}
                </p>
              ) : null}
              <time className="text-xs text-muted-foreground">{item.createdAtLabel}</time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
