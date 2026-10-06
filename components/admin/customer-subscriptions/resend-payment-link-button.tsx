"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resendPaymentLinkAction } from "@/app/admin/(dashboard)/abonnements-clients/actions"

export function ResendPaymentLinkButton({ subscriptionId }: { subscriptionId: number }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const resend = () =>
    startTransition(async () => {
      setMessage(null)
      const r = await resendPaymentLinkAction(subscriptionId)
      setMessage(r.ok ? { ok: true, text: "Lien de paiement renvoyé" } : { ok: false, text: r.message })
    })

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" className="min-h-11" disabled={pending} onClick={resend}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Renvoyer le lien de paiement
      </Button>
      <p aria-live="polite" className={message?.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
        {message?.text}
      </p>
    </div>
  )
}
