import type { Metadata } from "next"
import { Check } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import {
  SAAS_ADMIN_DISPLAY_PLANS,
  isSaasAdminCheckoutPlan,
  describeCurrentSaasPlanName,
  describeSaasPeriodEndLabel,
  describeSaasStatusBadges,
  getFreePlanDisplay,
} from "@/lib/billing/saas-admin"
import { SUBSCRIPTION_TRIAL_DAYS, describeSubscriptionPlan, isCompanyTrialEligible } from "@/lib/billing/subscription-core"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"
import { parseDesiredPlan } from "@/lib/pricing/desired-plan"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SaasCheckoutButton, SaasPortalButton } from "@/components/admin/saas-billing/billing-buttons"

export const metadata: Metadata = { title: "Mon abonnement DetailFlow", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })

export default async function SaasBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ annule?: string; plan?: string | string[] }>
}) {
  const { annule, plan: planParam } = await searchParams
  // Mise en avant visuelle uniquement : aucune écriture DB, aucun Checkout automatique.
  const desiredPlan = parseDesiredPlan(planParam)
  const member = await requireCompanyMember()
  const isOwner = member.role === "OWNER"
  const company = await createPgSubscriptionStore().getCompany(member.tenant.id)
  const hasSubscription = Boolean(company?.stripeSubscriptionId)
  const trialEligible = company ? isCompanyTrialEligible(company) : true
  const free = getFreePlanDisplay()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold text-foreground">Mon abonnement DetailFlow</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Votre formule DetailFlow. Les abonnements que vous vendez à vos propres clients se gèrent dans
          « Abonnements clients ».
        </p>
      </header>

      {annule ? (
        <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
          Souscription annulée. Aucun abonnement n&apos;a été créé.
        </p>
      ) : null}

      {!isOwner ? (
        <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
          Seul le propriétaire de l&apos;entreprise peut modifier l&apos;abonnement ou la facturation.
        </p>
      ) : null}

      {hasSubscription && company ? (
        <section aria-labelledby="current-plan" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Formule actuelle</p>
              <h2 id="current-plan" className="text-xl font-semibold">
                {describeCurrentSaasPlanName(company.licensePlan)}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {describeSaasStatusBadges(company).map((badge) => (
                <Badge key={badge.label} variant={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>
          {company.currentPeriodEnd ? (
            <dl className="flex flex-col gap-1 text-sm">
              <dt className="text-muted-foreground">{describeSaasPeriodEndLabel(company)}</dt>
              <dd className="font-medium">
                {company.currentPeriodEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </dd>
            </dl>
          ) : null}
          {company.subscriptionStatus === "trialing" ? (
            <p role="note" className="text-sm leading-relaxed text-muted-foreground">
              Ajoutez votre moyen de paiement avant la fin de l&apos;essai depuis l&apos;espace sécurisé Stripe. Sans moyen
              de paiement, votre espace reviendra à Essentiel.
            </p>
          ) : null}
          {isOwner ? (
            <div className="flex flex-col gap-2 border-t border-border pt-5">
              <SaasPortalButton />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Moyen de paiement, factures et résiliation, via l&apos;espace sécurisé Stripe.
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section aria-labelledby="current-plan" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Formule actuelle</p>
              <h2 id="current-plan" className="text-xl font-semibold">
                {free.name}
              </h2>
            </div>
            <p className="text-xl font-semibold">{euros(free.monthlyPriceCents)}</p>
          </section>

          <section aria-labelledby="upgrade" className="flex flex-col gap-4">
            <h2 id="upgrade" className="text-lg font-semibold text-foreground">
              Passer à la formule supérieure
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {SAAS_ADMIN_DISPLAY_PLANS.map((plan) => {
                const { name, monthlyPriceCents } = describeSubscriptionPlan(plan)
                const purchasable = isSaasAdminCheckoutPlan(plan)
                const chosen = desiredPlan === plan
                const featured = purchasable && (desiredPlan ? chosen : plan === "PRO")
                return (
                  <article
                    key={plan}
                    data-desired-plan={chosen ? "true" : undefined}
                    className={
                      featured
                        ? "flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-5 text-card-foreground"
                        : "flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground"
                    }
                  >
                    <div className="flex flex-col gap-1">
                      {chosen ? <Badge className="self-start">Votre choix</Badge> : null}
                      {purchasable ? null : (
                        <Badge variant="secondary" className="self-start">
                          Bientôt disponible
                        </Badge>
                      )}
                      <h3 className="font-semibold">{name}</h3>
                      <p>
                        <span className="text-2xl font-semibold">{euros(monthlyPriceCents)}</span>
                        <span className="text-sm text-muted-foreground">/mois</span>
                      </p>
                    </div>
                    {purchasable ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="size-4 text-primary" aria-hidden="true" />
                        {trialEligible ? `${SUBSCRIPTION_TRIAL_DAYS} jours gratuits` : "Essai gratuit déjà utilisé"}
                      </p>
                    ) : null}
                    {purchasable && trialEligible ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Sans carte bancaire. Ajoutez un moyen de paiement avant la fin de l&apos;essai pour continuer sur
                        Indépendant. Sinon, retour à Essentiel.
                      </p>
                    ) : null}
                    <div className="mt-auto">
                      {!isOwner ? null : isSaasAdminCheckoutPlan(plan) ? (
                        <SaasCheckoutButton plan={plan} label={`Essayer ${name}`} featured={featured} />
                      ) : (
                        <Button type="button" variant="outline" className="w-full" disabled aria-disabled="true">
                          Bientôt disponible
                        </Button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {isOwner && company?.stripeCustomerId ? <SaasPortalButton /> : null}
        </>
      )}
    </div>
  )
}
