"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatEuros, perIntervalShort } from "@/lib/customer-subscriptions/plan-form"
import type { PlanChange } from "@/lib/customer-subscriptions/admin-view"
import { acceptRequestAction, rejectRequestAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"
import { InfoRow, ToneBadge } from "./ui"

export type RequestCardData = {
  id: number
  customerName: string
  customerEmail: string
  customerPhone: string | null
  vehicle: string
  message: string | null
  createdAt: string
  expiresAt: string | null
  planName: string
  priceCents: number
  intervalUnit: string
  intervalCount: number
  planAvailable: boolean
  changes: PlanChange[]
}

type Mode = "idle" | "accept" | "reject"

export function RequestCard({ request }: { request: RequestCardData }) {
  const [mode, setMode] = useState<Mode>("idle")
  const [customerMessage, setCustomerMessage] = useState("")
  const [confirmChange, setConfirmChange] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hasChanges = request.changes.length > 0

  function submit() {
    setError(null)
    startTransition(async () => {
      const input = { customerMessage: customerMessage.trim() || undefined }
      const r =
        mode === "accept"
          ? await acceptRequestAction(request.id, { ...input, confirmPlanChange: hasChanges ? confirmChange : undefined })
          : await rejectRequestAction(request.id, input)
      if (!r.ok) return setError(r.message)
      setWarning(r.warning ?? null)
      setDone(mode === "accept" ? "accepted" : "rejected")
    })
  }

  if (done) {
    return (
      <article className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" aria-live="polite">
        {warning ?? (
          <>
            Demande de {request.customerName} {done === "accepted" ? "acceptée. Votre client reçoit un email pour finaliser son paiement." : "refusée. Votre client en est informé par email."}
          </>
        )}
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-semibold text-foreground">{request.customerName}</h3>
          <p className="truncate text-sm text-muted-foreground">
            Souhaite rejoindre <span className="font-medium text-foreground">{request.planName}</span> · {formatEuros(request.priceCents)}{" "}
            {perIntervalShort(request.intervalUnit, request.intervalCount)}
          </p>
        </div>
        <ToneBadge tone="info">Nouvelle demande</ToneBadge>
      </header>

      <dl className="flex flex-col gap-2">
        <InfoRow label="Véhicule">{request.vehicle}</InfoRow>
        <InfoRow label="Contact">
          <a href={`mailto:${request.customerEmail}`} className="text-primary underline-offset-4 hover:underline">
            {request.customerEmail}
          </a>
          {request.customerPhone && (
            <>
              {" · "}
              <a href={`tel:${request.customerPhone}`} className="text-primary underline-offset-4 hover:underline">
                {request.customerPhone}
              </a>
            </>
          )}
        </InfoRow>
        <InfoRow label="Reçue le">{request.createdAt}</InfoRow>
        {request.expiresAt && <InfoRow label="Sans réponse, expire le">{request.expiresAt}</InfoRow>}
      </dl>

      {request.message && (
        <blockquote className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">« {request.message} »</blockquote>
      )}

      {!request.planAvailable && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Cette formule n&apos;est plus proposée. Vous pouvez seulement refuser la demande.
        </p>
      )}

      {request.planAvailable && hasChanges && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium text-foreground">Vous avez modifié cette formule depuis la demande</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {request.changes.map((c) => (
              <li key={c.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <span className="text-muted-foreground sm:w-40 sm:shrink-0">{c.label}</span>
                <span className="text-foreground">
                  <span className="line-through decoration-muted-foreground/60">{c.before}</span> → <span className="font-medium">{c.after}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">Si vous acceptez, votre client verra les nouvelles conditions avant de payer.</p>
        </div>
      )}

      {mode === "idle" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setMode("reject")}>
            Refuser
          </Button>
          {request.planAvailable && <Button onClick={() => setMode("accept")}>Accepter</Button>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {mode === "accept"
              ? "Votre client recevra un email avec un lien pour payer et activer sa formule."
              : "Votre client recevra un email l'informant que sa demande n'a pas été retenue."}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`msg-${request.id}`}>Message pour votre client (facultatif)</Label>
            <Textarea id={`msg-${request.id}`} rows={2} maxLength={1000} value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} />
          </div>
          {mode === "accept" && hasChanges && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={confirmChange} onChange={(e) => setConfirmChange(e.target.checked)} />
              J&apos;accepte avec les nouvelles conditions de la formule.
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
              Retour
            </Button>
            <Button
              variant={mode === "reject" ? "destructive" : "default"}
              onClick={submit}
              disabled={pending || (mode === "accept" && hasChanges && !confirmChange)}
            >
              {pending ? "Envoi…" : mode === "accept" ? "Confirmer l'acceptation" : "Confirmer le refus"}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
