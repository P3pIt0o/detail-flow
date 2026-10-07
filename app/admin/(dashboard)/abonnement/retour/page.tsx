import type { Metadata } from "next"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { buildSaasAdminUrls, describeSaasPeriodEndLabel, shouldPollSubscriptionReturn } from "@/lib/billing/saas-admin"
import { describeSubscriptionReturnState } from "@/lib/billing/subscription-core"
import { createPgSubscriptionStore } from "@/lib/billing/subscription-server"
import { SubscriptionReturnPoller } from "@/components/admin/saas-billing/return-poller"

export const metadata: Metadata = { title: "Mon abonnement — confirmation", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Lit UNIQUEMENT l'état en base synchronisé par le webhook (jamais l'URL ni Stripe). */
export default async function SaasBillingReturnPage() {
  const member = await requireCompanyMember(["OWNER"])
  const company = await createPgSubscriptionStore().getCompany(member.tenant.id)
  const { state, title } = company
    ? describeSubscriptionReturnState(company)
    : { state: "pending" as const, title: "Confirmation en cours" }
  const polling = shouldPollSubscriptionReturn(state)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <SubscriptionReturnPoller active={polling} />
      {polling ? (
        <div role="status" className="flex flex-col gap-3">
          <h1 className="flex items-center gap-3 text-balance text-2xl font-semibold text-foreground">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            Confirmation de votre abonnement en cours…
          </h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Stripe nous transmet la confirmation. Cela prend généralement quelques secondes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="text-balance text-2xl font-semibold text-foreground">{title}</h1>
          {state === "trial_active" && company?.currentPeriodEnd ? (
            <p className="text-pretty leading-relaxed text-muted-foreground">
              {describeSaasPeriodEndLabel(company)} :{" "}
              {company.currentPeriodEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          ) : null}
          {state === "payment_issue" ? (
            <p className="text-pretty leading-relaxed text-muted-foreground">
              Mettez à jour votre moyen de paiement depuis « Gérer ma facturation ».
            </p>
          ) : null}
        </div>
      )}
      <Link
        href={buildSaasAdminUrls(member.tenant.slug).page}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Retour à mon abonnement
      </Link>
    </div>
  )
}
