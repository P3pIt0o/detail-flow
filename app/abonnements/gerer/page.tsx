import { CustomerShell } from "@/components/customer-subscriptions/portal/customer-shell"
import { ContractCard } from "@/components/customer-subscriptions/portal/contract-card"
import { PortalActions } from "@/components/customer-subscriptions/portal/portal-actions"
import { loadCustomerPortal } from "@/lib/customer-subscriptions/customer-service"
import { customerDb, getCustomerRequestContext } from "@/lib/customer-subscriptions/customer-portal.server"
import { resolvePublicRequestTenant } from "@/lib/tenant"
import { serializePortalActions } from "@/components/customer-subscriptions/portal/serialize"

export const dynamic = "force-dynamic"

/** GET = lecture seule. Aucun paramètre d'URL (ex. ?action=cancel) n'est lu. */
export default async function ManageSubscriptionPage() {
  const [ctx, tenant] = await Promise.all([getCustomerRequestContext(), resolvePublicRequestTenant()])
  const view = await loadCustomerPortal(customerDb, ctx)

  if (!view) {
    return (
      <CustomerShell title="Mon abonnement" companyName={tenant?.name}>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-medium text-card-foreground">{"Ce lien n'est plus valide ou a expiré."}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Pour accéder à votre abonnement, ouvrez le bouton « Gérer mon abonnement » du dernier email reçu.
          </p>
        </div>
      </CustomerShell>
    )
  }

  return (
    <CustomerShell title="Mon abonnement" companyName={tenant?.name}>
      <ContractCard view={view} />
      <PortalActions
        actions={serializePortalActions(view)}
        price={view.summary.price}
        summary={{
          dueTodayCents: view.summary.dueToday.amountCents,
          followingPaymentCents: view.summary.followingPaymentCents,
          currency: view.summary.price.currency,
        }}
      />
    </CustomerShell>
  )
}
