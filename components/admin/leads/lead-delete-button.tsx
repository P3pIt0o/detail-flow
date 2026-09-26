"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { deleteLeadAction } from "@/app/admin/(dashboard)/leads/actions"

/**
 * Suppression d'un prospect (confirmation obligatoire). Supprime le prospect et
 * ses activités (cascade DB) mais JAMAIS la demande, la réservation, la facture
 * ni le client historique associés.
 */
export function LeadDeleteButton({ leadId, contactName }: { leadId: number; contactName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setError(null)
    const fd = new FormData()
    fd.set("leadId", String(leadId))
    startTransition(async () => {
      const res = await deleteLeadAction(fd)
      if (!res.ok) setError(res.error)
      else {
        setOpen(false)
        router.push("/admin/leads")
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer ce prospect ?</DialogTitle>
          <DialogDescription>
            {contactName} et son historique seront définitivement supprimés du CRM. La demande, la
            réservation et la facture éventuelles ne sont pas affectées.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
