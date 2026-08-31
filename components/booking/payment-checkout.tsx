"use client"

import { useCallback, useEffect, useState } from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { Loader2, ShieldCheck } from "lucide-react"
import { startBookingCheckout } from "@/app/(site)/reservation/paiement/checkout-actions"

/**
 * Checkout embarqué Stripe pour régler une réservation. En mode Connect,
 * Stripe.js doit être chargé pour le compte connecté du professionnel.
 * Aucune donnée bancaire ne transite par DetailFlow : Stripe gère la saisie.
 */
export function PaymentCheckout({
  bookingId,
  chosenType,
}: {
  bookingId: number
  /** Choix client transmis en mode "choice" (sinon le mode tenant décide). */
  chosenType?: "deposit" | "full_payment"
}) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "paid" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ;(async () => {
      const res = await startBookingCheckout(bookingId, chosenType)
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        setStatus("error")
        return
      }
      if ("alreadyPaid" in res) {
        setStatus("paid")
        return
      }
      if (!pk) {
        setError("Configuration de paiement incomplète.")
        setStatus("error")
        return
      }
      // Stripe.js chargé POUR le compte connecté (isolation Connect).
      setStripePromise(loadStripe(pk, { stripeAccount: res.connectedAccountId }))
      setClientSecret(res.clientSecret)
      setStatus("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId, chosenType])

  const fetchClientSecret = useCallback(async () => clientSecret ?? "", [clientSecret])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span>Préparation du paiement sécurisé…</span>
      </div>
    )
  }

  if (status === "paid") {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-6 text-center">
        <p className="font-semibold text-foreground">Paiement déjà réglé</p>
        <p className="mt-1 text-sm text-muted-foreground">Cette réservation a déjà été payée. Merci !</p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
        <p className="font-semibold text-foreground">Paiement indisponible</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Paiement sécurisé traité par Stripe
      </p>
      <div id="checkout" className="overflow-hidden rounded-xl border border-border">
        {stripePromise ? (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : null}
      </div>
    </div>
  )
}
