import Link from "next/link"
import type { PublicOffer } from "@/lib/customer-subscriptions/public-offer"
import { SubscriptionRequestForm } from "./subscription-request-form"

/**
 * Bloc générique « Formules d'entretien » : réutilisable par le site standard,
 * la page /formules (widget) et les sites personnalisés. Rendu null si aucune
 * offre (mode disabled, tenant indisponible, aucune formule publique).
 */
export function PublicPlans({
  offer,
  withForm = true,
  heading = "Formules d'entretien",
  contactHref = "/contact",
}: {
  offer: PublicOffer | null
  withForm?: boolean
  heading?: string
  contactHref?: string
}) {
  if (!offer) return null
  return (
    <section aria-labelledby="formules-titre" className="px-4 py-12 sm:py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 id="formules-titre" className="text-balance text-2xl font-semibold text-foreground sm:text-3xl">
            {heading}
          </h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Un entretien régulier de votre véhicule, à prix fixe.
          </p>
        </div>
        <ul className="grid gap-6 md:grid-cols-2">
          {offer.plans.map((plan) => (
            <li key={plan.id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-lg font-semibold">
                  {plan.priceLabel} <span className="text-sm font-normal text-muted-foreground">{plan.intervalLabel}</span>
                </p>
              </div>
              {plan.description && <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>}
              <ul className="flex flex-col gap-1 text-sm leading-relaxed">
                {[plan.includedLabel, plan.commitmentLabel, plan.renewalLabel, plan.stopRuleLabel, plan.noticeLabel, plan.initialCleaningLabel, ...plan.paymentOptions.map((o) => o.label)]
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
              {offer.mode === "request" && withForm ? (
                <details className="group rounded-md border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium text-primary">Demander cette formule</summary>
                  <div className="pt-4">
                    <SubscriptionRequestForm planId={plan.id} planName={plan.name} />
                  </div>
                </details>
              ) : (
                <Link href={offer.mode === "request" ? "/formules" : contactHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {offer.mode === "request" ? "Demander cette formule" : "Nous contacter pour souscrire"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
