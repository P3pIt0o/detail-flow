"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { markUseCompletedAction, undoUseCompletedAction, type UseActionResult } from "@/app/admin/(dashboard)/abonnements-clients/actions"

export type UsageDto = Extract<UseActionResult, { ok: true }>["usage"]

const dateFr = (iso: string, short = false) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: short ? "short" : "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso))

/**
 * Prestations de la période : marquage manuel par le pro (L27). Le nombre de
 * restantes affiché est renvoyé au serveur, qui refuse tout marquage si ce
 * nombre a changé (double clic, autre onglet) : jamais deux prestations.
 */
export function UsesCard({ subscriptionId, initial, noun, nextRightsAt }: { subscriptionId: number; initial: UsageDto; noun: { one: string; many: string }; nextRightsAt: string | null }) {
  const [usage, setUsage] = useState<UsageDto>(initial)
  const [confirming, setConfirming] = useState(false)
  const [justMarked, setJustMarked] = useState<{ useId: number; at: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!usage) {
    return <p className="text-sm text-muted-foreground">Les prestations seront disponibles dès le premier paiement.</p>
  }
  const { total, remaining, periodEndsAt } = usage
  const today = dateFr(new Date().toISOString())
  const word = (n: number) => (n > 1 ? noun.many : noun.one)

  function confirm() {
    startTransition(async () => {
      const r = await markUseCompletedAction(subscriptionId, remaining)
      setConfirming(false)
      if (!r.ok) return setMessage(r.message)
      setUsage(r.usage)
      if (r.outcome === "completed" && r.useId) {
        setJustMarked({ useId: r.useId, at: r.usage?.lastCompletedAt ?? new Date().toISOString() })
        setMessage(null)
      } else setMessage("Le compteur venait de changer : il a été mis à jour, rien n'a été marqué.")
    })
  }
  function undo() {
    if (!justMarked) return
    startTransition(async () => {
      const r = await undoUseCompletedAction(subscriptionId, justMarked.useId)
      setJustMarked(null)
      if (!r.ok) return setMessage(r.message)
      setUsage(r.usage)
      setMessage("Marquage annulé.")
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold text-foreground">
        Prestations : {remaining} {remaining > 1 ? "restantes" : "restante"} sur {total}{" "}
        <span className="font-normal text-muted-foreground">(jusqu&apos;au {dateFr(periodEndsAt, true)})</span>
      </p>
      <div className="flex gap-1.5" role="img" aria-label={`${total - remaining} ${word(total - remaining)} effectué${total - remaining > 1 ? "s" : ""} sur ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-2.5 flex-1 rounded-full", i < total - remaining ? "bg-muted-foreground/30" : "bg-primary")} />
        ))}
      </div>

      {justMarked && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          1 {noun.one} marqué comme effectué le {dateFr(justMarked.at)}.{" "}
          <button type="button" onClick={undo} disabled={pending} className="font-semibold underline underline-offset-4">
            Annuler
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <Button type="button" className="h-11 w-full sm:w-auto sm:self-start" disabled={remaining === 0 || pending} onClick={() => setConfirming(true)} aria-describedby={remaining === 0 ? "uses-empty" : undefined}>
        Marquer une prestation comme effectuée
      </Button>
      {remaining === 0 && (
        <p id="uses-empty" className="text-sm text-muted-foreground">
          Toutes les prestations de la période sont utilisées.{nextRightsAt ? ` Prochaines le ${dateFr(nextRightsAt)}.` : ""}
        </p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-sm:top-auto max-sm:bottom-4 max-sm:translate-y-0">
          <DialogHeader>
            <DialogTitle>
              Marquer 1 {noun.one} comme effectué le {today} ?
            </DialogTitle>
            <DialogDescription>
              Il en restera {remaining - 1}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => setConfirming(false)} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" className="h-11 w-full sm:w-auto" onClick={confirm} disabled={pending}>
              {pending ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
