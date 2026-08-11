"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deleteBookingAction } from "@/app/admin/(dashboard)/reservations/[id]/actions"

/**
 * Bouton destructif « Supprimer le rendez-vous » (détail réservation admin).
 * Confirmation native avant suppression, état de chargement pendant l'appel,
 * message d'erreur simple en cas d'échec. En cas de succès, retour à la liste.
 * La suppression et la vérification multi-tenant sont faites côté serveur.
 */
export function BookingDeleteButton({ bookingId }: { bookingId: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm("Supprimer définitivement ce rendez-vous ?")) return
    setError(null)
    startTransition(async () => {
      const res = await deleteBookingAction(bookingId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push("/admin/reservations")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="destructive" disabled={pending} onClick={handleDelete}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        {pending ? "Suppression…" : "Supprimer le rendez-vous"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
