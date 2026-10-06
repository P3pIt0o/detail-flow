"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { decideEarlyCancellationAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"

type Mode = "idle" | "approved" | "rejected"

export function EarlyCancellationDecision({ requestId, contractEndsAt }: { requestId: number; contractEndsAt: string | null }) {
  const [mode, setMode] = useState<Mode>("idle")
  const [customerMessage, setCustomerMessage] = useState("")
  const [internalNote, setInternalNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (mode === "idle") return
    setError(null)
    startTransition(async () => {
      const r = await decideEarlyCancellationAction(requestId, mode, { customerMessage, internalNote })
      if (!r.ok) {
        setError(r.message)
        return
      }
      setNotice(
        r.providerPending
          ? "Décision enregistrée. La mise à jour du prélèvement sera retentée automatiquement."
          : mode === "approved"
            ? "Arrêt anticipé accepté. Votre client est prévenu par email."
            : "Demande refusée. Votre client est prévenu par email.",
      )
      setMode("idle")
    })
  }

  if (notice) {
    return (
      <p role="status" className="text-sm font-medium text-foreground">
        {notice}
      </p>
    )
  }

  if (mode === "idle") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setMode("rejected")}>
          Refuser
        </Button>
        <Button className="w-full sm:w-auto" onClick={() => setMode("approved")}>
          Accepter l&apos;arrêt
        </Button>
      </div>
    )
  }

  const approving = mode === "approved"
  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="text-sm leading-relaxed text-foreground">
        {approving
          ? "L'abonnement s'arrêtera à la fin de la période déjà payée. Aucun remboursement n'est effectué."
          : `L'abonnement continue aux conditions prévues${contractEndsAt ? `, jusqu'au ${contractEndsAt}` : ""}.`}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ec-msg-${requestId}`}>Message pour votre client (facultatif)</Label>
        <Textarea id={`ec-msg-${requestId}`} rows={2} maxLength={1000} value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ec-note-${requestId}`}>Note interne (jamais envoyée)</Label>
        <Textarea id={`ec-note-${requestId}`} rows={2} maxLength={1000} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" variant={approving ? "default" : "destructive"} disabled={pending}>
          {pending ? "Enregistrement…" : approving ? "Confirmer l'arrêt" : "Confirmer le refus"}
        </Button>
      </div>
    </form>
  )
}
