"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BellOff } from "lucide-react"
import { FOLLOW_UP_PRESETS } from "@/lib/leads/model"
import { setLeadFollowUpAction } from "@/app/admin/(dashboard)/leads/actions"

/**
 * Contrôles de relance : presets (aujourd'hui / demain / +3j / +1 semaine),
 * date personnalisée et suppression. Les dates sont résolues dans le fuseau
 * métier du tenant CÔTÉ SERVEUR.
 */
export function LeadFollowUpControls({
  leadId,
  currentLabel,
}: {
  leadId: number
  currentLabel: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState("")

  function run(fd: FormData) {
    setError(null)
    fd.set("leadId", String(leadId))
    startTransition(async () => {
      const res = await setLeadFollowUpAction(fd)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function setPreset(days: number) {
    const fd = new FormData()
    fd.set("followUpInDays", String(days))
    run(fd)
  }

  function setCustom() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      setError("Choisissez une date valide.")
      return
    }
    const fd = new FormData()
    fd.set("followUpDate", customDate)
    run(fd)
  }

  function clear() {
    const fd = new FormData()
    fd.set("clear", "1")
    run(fd)
  }

  return (
    <div className="flex flex-col gap-3">
      {currentLabel ? (
        <p className="text-sm text-foreground">
          Relance prévue : <span className="font-medium">{currentLabel}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune relance planifiée.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FOLLOW_UP_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={pending}
            onClick={() => setPreset(p.addDays)}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          aria-label="Date de relance personnalisée"
        />
        <button
          type="button"
          disabled={pending || !customDate}
          onClick={setCustom}
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Planifier
        </button>
        {currentLabel ? (
          <button
            type="button"
            disabled={pending}
            onClick={clear}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <BellOff className="size-4" aria-hidden="true" />
            Supprimer
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
