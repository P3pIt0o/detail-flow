"use client"

import { useState, useTransition } from "react"
import { Check, Loader2, MessageSquare, X } from "lucide-react"
import { confirmSmsRechargeAction, cancelSmsRechargeAction } from "@/app/super-admin/actions"
import type { SmsRechargeRow } from "@/lib/super-admin/queries"

function euros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
}

export function SmsRechargesSection({ requests }: { requests: SmsRechargeRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function confirm(req: SmsRechargeRow) {
    if (!window.confirm(`Confirmer la réception du paiement et créditer ${req.quantity} SMS à ${req.companyName} ?`)) return
    setError(null)
    setBusyId(req.id)
    startTransition(async () => {
      const res = await confirmSmsRechargeAction(req.id)
      setBusyId(null)
      if (!res.ok) setError(res.error)
    })
  }

  function cancel(req: SmsRechargeRow) {
    if (!window.confirm("Annuler cette demande de recharge ?")) return
    setError(null)
    setBusyId(req.id)
    startTransition(async () => {
      const res = await cancelSmsRechargeAction(req.id)
      setBusyId(null)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Recharges SMS</h2>
        {requests.length > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {requests.length} en attente
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune demande de recharge en attente.
        </div>
      ) : (
        <div className="grid gap-3">
          {requests.map((req) => {
            const isBusy = isPending && busyId === req.id
            return (
              <div
                key={req.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-foreground">{req.companyName}</p>
                  <p className="text-sm text-muted-foreground">
                    {req.quantity} SMS · {euros(req.amountCents)} ·{" "}
                    <span className="font-mono font-semibold text-foreground">{req.reference}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {req.companyEmail ?? "—"} · {new Date(req.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => confirm(req)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Paiement reçu — créditer les SMS
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => cancel(req)}
                    aria-label="Annuler la demande"
                    title="Annuler"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <X className="size-4" />
                    Annuler
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
