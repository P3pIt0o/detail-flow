import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireCompanyMember } from "@/lib/admin"
import { isLifetimePreviewTestEnabled } from "@/lib/billing/lifetime-preview-test"
import {
  PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLANS,
  describeSubscriptionPlan,
  describeSubscriptionReturnState,
} from "@/lib/billing/subscription-core"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"
import { SubscriptionTestCheckoutButton, SubscriptionTestPortalButton } from "./test-subscription-buttons"

export const metadata: Metadata = { title: "Test Abonnements — Preview", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })

export default async function SubscriptionPreviewTestPage() {
  if (!isLifetimePreviewTestEnabled(process.env.VERCEL_ENV)) notFound()
  const member = await requireCompanyMember(["OWNER"])
  const company = await createPgSubscriptionStore().getCompany(member.tenant.id)
  const hasSubscription = Boolean(company?.stripeSubscriptionId)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <div
        role="alert"
        className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm font-semibold tracking-wide text-destructive"
      >
        ENVIRONNEMENT TEST — aucun abonnement réel
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold text-foreground">Test Abonnements — Preview</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Stripe TEST et base Preview isolée. 30 jours gratuits, sans carte bancaire. Vous pourrez ajouter votre moyen de paiement avant la fin de l&apos;essai.
        </p>
      </div>

      {hasSubscription && company ? (
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h2 className="font-semibold text-foreground">{describeSubscriptionReturnState(company).title}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm leading-relaxed">
            <dt className="text-muted-foreground">Formule</dt>
            <dd className="text-foreground">{company.licensePlan}</dd>
            <dt className="text-muted-foreground">Statut Stripe</dt>
            <dd className="text-foreground">{company.subscriptionStatus}</dd>
            <dt className="text-muted-foreground">Fin de période</dt>
            <dd className="text-foreground">{company.currentPeriodEnd?.toLocaleDateString("fr-FR") ?? "—"}</dd>
            <dt className="text-muted-foreground">Résiliation programmée</dt>
            <dd className="text-foreground">{company.cancelAtPeriodEnd ? "Oui" : "Non"}</dd>
          </dl>
          <SubscriptionTestPortalButton />
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const { name, monthlyPriceCents } = describeSubscriptionPlan(plan)
            const label = `Tester ${name} — ${euros(monthlyPriceCents)}/mois`
            if (!PREVIEW_PURCHASABLE_SUBSCRIPTION_PLANS.includes(plan)) {
              return (
                <p key={plan} className="text-sm leading-relaxed text-muted-foreground">
                  {name} — pas encore commercialisable
                </p>
              )
            }
            return (
              <div key={plan} className="flex flex-col gap-1">
                <SubscriptionTestCheckoutButton plan={plan} label={label} />
                <span className="text-sm text-muted-foreground">1er mois offert</span>
              </div>
            )
          })}
          {company?.stripeCustomerId ? <SubscriptionTestPortalButton /> : null}
        </section>
      )}
    </main>
  )
}
