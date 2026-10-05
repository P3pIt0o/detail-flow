import type { Metadata } from "next"
import { CustomerShell } from "@/components/customer-subscriptions/portal/customer-shell"
import { CustomerCheckout } from "@/components/customer-subscriptions/portal/customer-checkout"
import { customerDb } from "@/lib/customer-subscriptions/customer-portal.server"
import { loadPaymentLinkView } from "@/lib/customer-subscriptions/payment-link"
import { resolvePublicRequestTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Finaliser mon abonnement", robots: { index: false, follow: false }, referrer: "no-referrer" }

const MESSAGES = {
  invalid: { title: "Ce lien est invalide ou n’est plus disponible.", body: "Contactez le professionnel pour recevoir un nouveau lien." },
  active: { title: "Votre abonnement est déjà actif.", body: "Aucun paiement supplémentaire n’est nécessaire." },
  ended: { title: "Cet abonnement est terminé.", body: "Contactez le professionnel pour souscrire à nouveau." },
  unavailable: { title: "Le paiement n’est pas disponible pour le moment.", body: "Contactez le professionnel si le problème persiste." },
} as const

/** Le token est l'autorisation : contrat résolu serveur par son hash, tenant de l'hôte vérifié. */
export default async function PaymentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, tenant] = await Promise.all([params, resolvePublicRequestTenant()])
  const view = await loadPaymentLinkView(customerDb, token, tenant?.id ?? null)
  const companyName = view.state === "invalid" ? undefined : tenant?.name

  if (view.state !== "payable") {
    const m = MESSAGES[view.state]
    return (
      <div className="min-h-dvh bg-background font-sans text-foreground">
        <CustomerShell title={m.title} companyName={companyName}>
          <p className="text-sm leading-relaxed text-muted-foreground">{m.body}</p>
        </CustomerShell>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground">
      <CustomerShell title="Finaliser mon abonnement" companyName={companyName}>
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Formule</dt>
              <dd className="text-right font-medium text-card-foreground">{view.planName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tarif</dt>
              <dd className="text-right font-medium text-card-foreground">{view.priceLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Fréquence</dt>
              <dd className="text-right font-medium text-card-foreground">{view.intervalLabel}</dd>
            </div>
          </dl>
          <CustomerCheckout
            step={view.step}
            dueTodayCents={view.dueTodayCents}
            followingPaymentCents={view.followingPaymentCents}
            currency={view.currency}
            paymentToken={token}
          />
        </div>
      </CustomerShell>
    </div>
  )
}
