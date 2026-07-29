/**
 * Statuts de réservation : libellés FR et styles de badge partagés.
 * Utilisé par le dashboard (liste, calendrier, détail).
 */
export type BookingStatus =
  | "pending_deposit"
  | "confirmed"
  | "completed"
  | "cancelled"

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; className: string; dot: string }
> = {
  pending_deposit: {
    label: "En attente d'acompte",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    dot: "bg-amber-500",
  },
  confirmed: {
    label: "Confirmée",
    className: "bg-primary/10 text-primary border-primary/20",
    dot: "bg-primary",
  },
  completed: {
    label: "Terminée",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Annulée",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
  },
}

export function statusMeta(status: string) {
  return BOOKING_STATUS_META[status as BookingStatus] ?? BOOKING_STATUS_META.pending_deposit
}
