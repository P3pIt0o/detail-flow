"use client"

import { createContext, useContext, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { updateBookingStatus } from "@/app/admin/(dashboard)/actions"
import { createInvoiceFromBooking } from "@/lib/invoice/actions"
import { finishAndInvoice } from "@/lib/admin/today"
import { formatPrice } from "@/lib/format"
import { withTenant } from "@/lib/tenant-link"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { btnOutline, btnPrimary } from "@/components/admin/booking-hub/styles"
import { cn } from "@/lib/utils"

type Target = { id: number; name: string; paidInFull: boolean; paymentNotes: string[] }

const FinishContext = createContext<(target: Target) => void>(() => {})

/**
 * « Terminer et encaisser » en 3 touches : le bouton, « Confirmer et facturer »,
 * puis « Émettre & marquer payée » sur la facture (écran existant).
 *
 * La confirmation vit ici, AU-DESSUS de l'écran : après le changement de statut,
 * la page est rafraîchie et le bloc du rendez-vous change, mais un message
 * d'erreur éventuel (quota de factures…) reste affiché.
 */
export function FinishVisitProvider({ tenant, children }: { tenant: string | null; children: React.ReactNode }) {
  const router = useRouter()
  const [target, setTarget] = useState<Target | null>(null)
  const [failure, setFailure] = useState<{ completed: boolean; error: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function open(next: Target) {
    setFailure(null)
    setTarget(next)
  }

  function confirm() {
    if (!target || pending) return
    startTransition(async () => {
      const result = await finishAndInvoice(target.id, {
        updateStatus: updateBookingStatus,
        createInvoice: createInvoiceFromBooking,
      })
      if (!result.ok) {
        setFailure(result)
        return
      }
      // Fermée avant la navigation : un second « Confirmer » est impossible.
      setTarget(null)
      router.push(withTenant(`/admin/factures/${result.invoiceId}`, tenant))
    })
  }

  return (
    <FinishContext.Provider value={open}>
      {children}
      <Dialog open={target !== null} onOpenChange={(next) => !next && !pending && setTarget(null)}>
        <DialogContent
          showCloseButton={false}
          className="flex flex-col gap-3 p-5 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-sm"
        >
          <DialogTitle className="text-lg font-semibold">
            {failure?.completed ? "Visite terminée, facture non créée" : `Terminer la visite de ${target?.name ?? ""} ?`}
          </DialogTitle>
          {failure ? (
            <p role="alert" className="text-sm text-destructive">
              {failure.error}
            </p>
          ) : (
            <DialogDescription>
              Le client reçoit l&apos;e-mail de fin de prestation. Cette action est définitive.
            </DialogDescription>
          )}
          {!failure
            ? target?.paymentNotes.map((note) => (
                <p key={note} className="text-sm font-semibold text-foreground">
                  {note}
                </p>
              ))
            : null}
          {failure ? (
            <Link href={withTenant(`/admin/reservations/${target?.id}`, tenant)} className={btnPrimary}>
              Voir la réservation
            </Link>
          ) : (
            <button type="button" onClick={confirm} disabled={pending} className={btnPrimary}>
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
              Confirmer et facturer
            </button>
          )}
          <button type="button" onClick={() => setTarget(null)} disabled={pending} className={btnOutline}>
            {failure ? "Fermer" : "Annuler"}
          </button>
        </DialogContent>
      </Dialog>
    </FinishContext.Provider>
  )
}

export function FinishVisitButton({
  amountCents,
  className,
  ...target
}: Target & { amountCents: number | null; className?: string }) {
  const open = useContext(FinishContext)
  return (
    <button type="button" onClick={() => open(target)} className={cn(btnPrimary, className)}>
      {target.paidInFull ? "Terminer et facturer" : "Terminer et encaisser"}
      {amountCents != null ? ` · ${formatPrice(amountCents)}` : ""}
    </button>
  )
}
