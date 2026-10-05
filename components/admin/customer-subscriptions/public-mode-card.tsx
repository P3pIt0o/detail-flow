"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { HELP, PUBLIC_MODE_UI } from "@/lib/customer-subscriptions/admin-labels"
import { setPublicModeAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"
import { HelpTip, SectionCard } from "./ui"

const MODES = ["request", "direct", "disabled"] as const

export function PublicModeCard({ mode, canPublish }: { mode: string; canPublish: boolean }) {
  const [current, setCurrent] = useState(mode)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function choose(next: (typeof MODES)[number]) {
    if (next === current) return
    const previous = current
    setCurrent(next)
    setError(null)
    startTransition(async () => {
      const r = await setPublicModeAction(next)
      if (!r.ok) {
        setCurrent(previous)
        setError(r.message)
      }
    })
  }

  return (
    <SectionCard title="Comment vos clients rejoignent une formule" description={<HelpTip>{HELP.publicMode}</HelpTip>}>
      <fieldset className="grid gap-2 sm:grid-cols-3" disabled={pending} aria-busy={pending}>
        <legend className="sr-only">Mode de souscription</legend>
        {MODES.map((m) => {
          const locked = m !== "disabled" && !canPublish
          return (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors",
                current === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                locked && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="public-mode" className="accent-primary" checked={current === m} disabled={locked} onChange={() => choose(m)} />
                <span className="text-sm font-medium text-foreground">{PUBLIC_MODE_UI[m].label}</span>
                {m === "request" && <span className="text-xs text-primary">Recommandé</span>}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{PUBLIC_MODE_UI[m].help}</span>
            </label>
          )
        })}
      </fieldset>
      {!canPublish && (
        <p className="mt-3 text-sm text-muted-foreground">Publiez au moins une formule et connectez les paiements en ligne pour proposer vos formules.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </SectionCard>
  )
}
