"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, FilePlus2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createInvoiceFromBooking } from "@/lib/invoice/actions"

/**
 * Bouton « Générer / Voir la facture » affiché sur la fiche réservation et
 * dans le calendrier. N'apparaît que pour les réservations terminées.
 * L'action est idempotente : si une facture existe déjà, on y est redirigé.
 */
export function InvoiceButton({
  bookingId,
  bookingStatus,
  existingInvoiceId,
  size = "sm",
  variant = "default",
  onNavigate,
}: {
  bookingId: number
  bookingStatus: string
  existingInvoiceId?: number | null
  size?: "sm" | "default"
  variant?: "default" | "outline"
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (bookingStatus !== "completed") return null

  function go(id: number) {
    onNavigate?.()
    router.push(`/admin/factures/${id}`)
  }

  if (existingInvoiceId) {
    return (
      <Button size={size} variant={variant} onClick={() => go(existingInvoiceId)}>
        <FileText className="mr-1.5 h-4 w-4" />
        Voir la facture
      </Button>
    )
  }

  function generate() {
    setError(null)
    startTransition(async () => {
      const res = await createInvoiceFromBooking(bookingId)
      if (res.ok && res.data) go(res.data.invoiceId)
      else if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size={size} variant={variant} disabled={pending} onClick={generate}>
        {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1.5 h-4 w-4" />}
        Générer la facture
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
