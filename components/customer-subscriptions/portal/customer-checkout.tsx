"use client"

import { useCallback, useState, useTransition } from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { startCustomerCheckoutAction } from "@/app/abonnements/gerer/actions"
import { startPaymentLinkCheckoutAction } from "@/app/abonnement-entretien/[token]/actions"
import { formatMoney } from "@/lib/customer-subscriptions/contract-summary"

/** Consentement : seul le booléen est envoyé ; date et version sont construites serveur. */
export function CustomerCheckout({
  step,
  dueTodayCents,
  followingPaymentCents,
  currency,
  paymentToken,
}: {
  step: "initial_cleaning" | "subscription"
  dueTodayCents: number
  followingPaymentCents: number | null
  currency: string
  /** Lien de paiement email : le token autorise le Checkout (sinon session du portail). */
  paymentToken?: string
}) {
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [session, setSession] = useState<{ stripe: Promise<Stripe | null>; clientSecret: string } | null>(null)

  const start = () =>
    startTransition(async () => {
      setError(null)
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      if (!pk) return setError("Le paiement en ligne n'est pas disponible pour le moment.")
      const r = paymentToken ? await startPaymentLinkCheckoutAction(paymentToken, accepted) : await startCustomerCheckoutAction(accepted)
      if (!r.ok) return setError(r.message)
      setSession({ stripe: loadStripe(pk, { stripeAccount: r.connectedAccountId }), clientSecret: r.clientSecret })
    })

  const fetchClientSecret = useCallback(async () => session!.clientSecret, [session])

  if (session)
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <EmbeddedCheckoutProvider stripe={session.stripe} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    )

  return (
    <section aria-labelledby="checkout-title" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <h2 id="checkout-title" className="font-semibold text-card-foreground">
        {step === "initial_cleaning" ? "Étape 1 — Régler le nettoyage initial" : "Activer ma formule"}
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{"Aujourd'hui"}</dt>
          <dd className="font-medium text-card-foreground">{formatMoney(dueTodayCents, currency)}</dd>
        </div>
        {followingPaymentCents != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Ensuite</dt>
            <dd className="font-medium text-card-foreground">{formatMoney(followingPaymentCents, currency)} par échéance</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Engagement, renouvellement, règle d&apos;arrêt et prestation incluse sont détaillés dans « Les modalités de ma formule » ci-dessus.
      </p>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed text-card-foreground">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
        />
        <span>
          {"J'ai lu et j'accepte les conditions de cette formule, son prix, sa fréquence de paiement et ses modalités de renouvellement."}
        </span>
      </label>
      <div aria-live="polite">{error ? <p className="text-sm text-destructive">{error}</p> : null}</div>
      <Button className="min-h-11 w-full" disabled={!accepted || pending} onClick={start}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Continuer vers le paiement
      </Button>
    </section>
  )
}
