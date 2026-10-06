"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  confirmRenewalOptOutAction,
  requestEarlyCancellationAction,
  revokeRenewalOptOutAction,
  scheduleCancellationAction,
  withdrawEarlyCancellationAction,
  type CustomerActionResult,
} from "@/app/abonnements/gerer/actions"
import { CustomerCheckout } from "./customer-checkout"
import type { SerializedAction, SerializedPortalActions } from "./serialize"

type Feedback = { tone: "success" | "info" | "error"; message: string } | null

function Notice({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : Info
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${tone === "warning" ? "border-destructive/40 bg-destructive/10 text-foreground" : "border-border bg-muted text-foreground"}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

/** Étape de confirmation en ligne (pas de modale) : la conséquence exacte avant le bouton. */
function ConfirmStep({
  title,
  consequence,
  triggerLabel,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: {
  title: string
  consequence: string
  triggerLabel: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <Button variant={destructive ? "outline" : "default"} className="min-h-11 w-full" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
    )
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="font-medium text-card-foreground">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{consequence}</p>
      <div className="flex flex-col gap-2">
        <Button autoFocus variant={destructive ? "destructive" : "default"} className="min-h-11 w-full" disabled={pending} onClick={onConfirm}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {confirmLabel}
        </Button>
        <Button variant="ghost" className="min-h-11 w-full" disabled={pending} onClick={() => setOpen(false)}>
          Revenir
        </Button>
      </div>
    </div>
  )
}

export function PortalActions({
  actions,
  summary,
}: {
  actions: SerializedPortalActions
  price: { amountCents: number; currency: string }
  summary: { dueTodayCents: number; followingPaymentCents: number | null; currency: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [earlyOpen, setEarlyOpen] = useState(false)

  const handle = (fn: () => Promise<CustomerActionResult>) =>
    startTransition(async () => {
      const r = await fn()
      setFeedback(r.ok ? { tone: r.syncPending ? "info" : "success", message: r.message } : { tone: "error", message: r.message })
      if (r.ok) {
        setEarlyOpen(false)
        router.refresh()
      }
    })

  const renderAction = (a: SerializedAction | null) => {
    if (!a) return null
    switch (a.kind) {
      case "checkout":
        return <CustomerCheckout step={a.step} dueTodayCents={summary.dueTodayCents} followingPaymentCents={summary.followingPaymentCents} currency={summary.currency} />
      case "renewal_opt_out":
        return (
          <ConfirmStep
            title="Ne pas renouveler"
            consequence={a.consequence}
            triggerLabel="Ne pas renouveler"
            confirmLabel="Confirmer le non-renouvellement"
            pending={pending}
            onConfirm={() => handle(confirmRenewalOptOutAction)}
          />
        )
      case "revoke_renewal_opt_out":
        return (
          <ConfirmStep
            title="Continuer mon abonnement"
            consequence={a.consequence}
            triggerLabel="Continuer mon abonnement"
            confirmLabel="Confirmer la poursuite"
            pending={pending}
            onConfirm={() => handle(revokeRenewalOptOutAction)}
          />
        )
      case "schedule_cancellation":
        return (
          <ConfirmStep
            title="Arrêter mon abonnement"
            consequence={a.consequence}
            triggerLabel="Arrêter mon abonnement"
            confirmLabel={a.confirmLabel}
            destructive
            pending={pending}
            onConfirm={() => handle(scheduleCancellationAction)}
          />
        )
      case "early_cancellation_request":
        return earlyOpen ? (
          <form
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            action={(fd) => handle(() => requestEarlyCancellationAction(fd))}
          >
            <p className="font-medium text-card-foreground">Demander une fin anticipée</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Votre demande sera examinée par le professionnel. Rien n&apos;est modifié tant qu&apos;il ne l&apos;a pas acceptée.
            </p>
            <label htmlFor="early-message" className="text-sm font-medium text-card-foreground">
              Message (facultatif)
            </label>
            <Textarea id="early-message" name="message" maxLength={1000} rows={3} />
            <Button type="submit" className="min-h-11 w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Envoyer ma demande
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={pending} onClick={() => setEarlyOpen(false)}>
              Revenir
            </Button>
          </form>
        ) : (
          <Button variant="link" className="min-h-11 w-full text-muted-foreground" onClick={() => setEarlyOpen(true)}>
            Demander une fin anticipée
          </Button>
        )
    }
  }

  return (
    <section aria-label="Gérer mon abonnement" className="flex flex-col gap-4">
      <div aria-live="polite" role="status">
        {feedback ? (
          <div
            className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${
              feedback.tone === "error" ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/10"
            } text-foreground`}
          >
            {feedback.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <p>{feedback.message}</p>
          </div>
        ) : null}
      </div>

      {actions.paymentIssue ? (
        <Notice tone="warning">
          <p className="font-medium">Un paiement est à régulariser.</p>
          <p>Le professionnel ou Stripe vous transmettra les instructions de paiement.</p>
        </Notice>
      ) : null}
      {actions.providerSyncPending && !feedback ? <Notice tone="info">Votre demande est enregistrée. La synchronisation du paiement est en cours.</Notice> : null}

      {actions.pendingEarlyCancellation ? (
        <Notice tone="info">
          <p>Votre demande de fin anticipée est en cours d&apos;examen.</p>
          <Button variant="outline" className="mt-3 min-h-11 w-full" disabled={pending} onClick={() => handle(withdrawEarlyCancellationAction)}>
            Retirer ma demande
          </Button>
        </Notice>
      ) : null}

      {renderAction(actions.primary)}
      {renderAction(actions.secondary)}
    </section>
  )
}
