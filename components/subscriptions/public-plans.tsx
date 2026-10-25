import Link from "next/link"
import { Check } from "lucide-react"
import type { PublicOffer } from "@/lib/customer-subscriptions/public-offer"
import { SubscriptionRequestForm } from "./subscription-request-form"
import { subscriptionPlanCta } from "@/lib/public-site-links"

/**
 * Bloc générique « Formules d'entretien » : réutilisable par le site standard,
 * la page /formules (widget) et les sites personnalisés. Rendu null si aucune
 * offre (mode disabled, tenant indisponible, aucune formule publique).
 */
export function PublicPlans({
  offer,
  withForm = true,
  heading = "Formules d'entretien",
  tenantSlug = null,
}: {
  offer: PublicOffer | null
  withForm?: boolean
  heading?: string
  /** Slug résolu serveur : conserve le tenant dans le lien du bouton (Preview / domaine racine). */
  tenantSlug?: string | null
}) {
  if (!offer) return null
  const cta = subscriptionPlanCta(offer.mode, tenantSlug)
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
          {offer.plans.map((plan) =>
            plan.period ? (
              <li key={plan.id} className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5 text-card-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  {plan.period.badge && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{plan.period.badge}</span>}
                </div>
                <p className="text-3xl font-bold">
                  {plan.period.priceMain}
                  <span className="text-base font-medium text-muted-foreground"> {plan.period.priceSuffix}</span>
                </p>
                {plan.description && <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>}
                <ul className="flex flex-col gap-2.5 text-[15px]">
                  {[plan.period.usesLine, ...plan.period.features, plan.initialCleaningLabel].filter(Boolean).map((line, i) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                      <span className={i === 0 ? "font-semibold" : undefined}>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border pt-3 text-sm text-muted-foreground">{plan.period.footer}</p>
                {offer.mode === "request" && withForm ? (
                  <details className="group rounded-xl border border-border p-4">
                    <summary className="flex h-11 cursor-pointer items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground group-open:mb-4">
                      {cta.label}
                    </summary>
                    <SubscriptionRequestForm planId={plan.id} planName={plan.name} scheduleChoices={plan.period.choices} choiceNote={plan.period.choiceNote} />
                  </details>
                ) : (
                  <Link href={cta.href} className="flex h-11 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
                    {cta.label}
                  </Link>
                )}
                <p className="text-center text-xs text-muted-foreground">Aucun paiement à cette étape : vous verrez le récapitulatif avant.</p>
              </li>
            ) : (
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
                <Link href={cta.href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {cta.label}
                </Link>
              )}
            </li>
            ),
          )}
        </ul>
      </div>
    </section>
  )
}
