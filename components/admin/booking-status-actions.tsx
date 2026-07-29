"use client"

import { useState, useTransition } from "react"
import { Check, X, CheckCheck, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateBookingStatus, type ActionResult } from "@/app/admin/(dashboard)/actions"
import type { BookingStatus } from "@/lib/booking/status"

type Transition = { to: BookingStatus; label: string; icon: typeof Check; variant?: "default" | "outline" | "destructive" }

// Boutons d'action proposés selon le statut courant.
const TRANSITIONS: Record<BookingStatus, Transition[]> = {
  pending_deposit: [
    { to: "confirmed", label: "Confirmer", icon: Check },
    { to: "cancelled", label: "Annuler", icon: X, variant: "destructive" },
  ],
  confirmed: [
    { to: "completed", label: "Marquer terminée", icon: CheckCheck },
    { to: "cancelled", label: "Annuler", icon: X, variant: "destructive" },
  ],
  completed: [],
  cancelled: [{ to: "pending_deposit", label: "Réactiver", icon: RotateCcw, variant: "outline" }],
}

export function BookingStatusActions({
  bookingId,
  status,
  onDone,
}: {
  bookingId: number
  status: string
  onDone?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const transitions = TRANSITIONS[status as BookingStatus] ?? []

  if (transitions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune action disponible.</p>
  }

  function run(to: BookingStatus) {
    setError(null)
    startTransition(async () => {
      const res: ActionResult = await updateBookingStatus(bookingId, to)
      if (!res.ok) setError(res.error ?? "Erreur inconnue.")
      else onDone?.()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => {
          const Icon = t.icon
          return (
            <Button
              key={t.to}
              size="sm"
              variant={t.variant ?? "default"}
              disabled={pending}
              onClick={() => run(t.to)}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {t.label}
            </Button>
          )
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
