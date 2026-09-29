"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  LEAD_LOST_REASONS,
  LEAD_LOST_REASON_LABELS,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/leads/model"
import { changeLeadStatusAction } from "@/app/admin/(dashboard)/leads/actions"

/**
 * Contrôles de statut d'une fiche prospect (pas de drag & drop en V1). Boutons
 * simples et accessibles. « Perdu » propose un motif FACULTATIF. Toute mutation
 * passe par l'action serveur (licence + tenant + validation + activité).
 */
const NEXT_ACTIONS: { status: LeadStatus; label: string }[] = [
  { status: "CONTACTED", label: "Marquer contacté" },
  { status: "APPOINTMENT_BOOKED", label: "Rendez-vous pris" },
  { status: "CLIENT", label: "Marquer comme client" },
]

export function LeadStatusControls({ leadId, current }: { leadId: number; current: LeadStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showLost, setShowLost] = useState(false)
  const [lostReason, setLostReason] = useState<string>("")

  function submit(status: LeadStatus, reason?: string) {
    setError(null)
    const fd = new FormData()
    fd.set("leadId", String(leadId))
    fd.set("status", status)
    if (reason) fd.set("lostReason", reason)
    startTransition(async () => {
      const res = await changeLeadStatusAction(fd)
      if (!res.ok) setError(res.error)
      else {
        setShowLost(false)
        router.refresh()
      }
    })
  }

  const isLost = current === "LOST"
  const isClient = current === "CLIENT"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {NEXT_ACTIONS.filter((a) => a.status !== current).map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={pending}
            onClick={() => submit(a.status)}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}

        {(isLost || isClient) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("NEW")}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Rouvrir
          </button>
        )}

        {!isLost && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowLost((v) => !v)}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            Marquer perdu
          </button>
        )}
      </div>

      {showLost && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <label htmlFor="lost-reason" className="text-sm font-medium text-foreground">
            Motif (facultatif)
          </label>
          <select
            id="lost-reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">Aucun motif</option>
            {LEAD_LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {LEAD_LOST_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("LOST", lostReason || undefined)}
              className="inline-flex min-h-10 items-center rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              Confirmer « {LEAD_STATUS_LABELS.LOST} »
            </button>
            <button
              type="button"
              onClick={() => setShowLost(false)}
              className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
