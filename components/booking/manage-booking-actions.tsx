"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { cancelMyBookingAction } from "@/app/(site)/reservation/gerer/actions"

/**
 * Actions publiques de gestion d'un rendez-vous (client non authentifié).
 * L'autorité est le jeton ; aucune donnée tenant/booking n'est envoyée par le
 * navigateur en dehors du jeton lui-même.
 */
export function ManageBookingActions({
  token,
  newBookingHref,
  canCancel,
  hasDeposit,
}: {
  token: string
  newBookingHref: string
  canCancel: boolean
  hasDeposit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await cancelMyBookingAction(token)
      if (res.ok) {
        setDone(true)
        setOpen(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <p className="mt-4 font-medium text-card-foreground">Votre rendez-vous a bien été annulé.</p>
        <Link
          href={newBookingHref}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Réserver un nouveau créneau
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {canCancel && (
        <Button variant="destructive" onClick={() => setOpen(true)} className="sm:flex-1">
          Annuler mon rendez-vous
        </Button>
      )}
      <Link
        href={newBookingHref}
        className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:flex-1"
      >
        Choisir un autre créneau
      </Link>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Êtes-vous sûr de vouloir annuler ce rendez-vous ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive. Le créneau sera de nouveau proposé à d&apos;autres clients.
              {hasDeposit
                ? " Si un acompte ou un paiement a déjà été effectué, les conditions de remboursement dépendent de l'entreprise. Elle pourra vous contacter si nécessaire."
                : ""}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Retour
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>
              {pending ? "Annulation…" : "Confirmer l'annulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
