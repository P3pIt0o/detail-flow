import { CustomerShell } from "@/components/customer-subscriptions/portal/customer-shell"

export const dynamic = "force-dynamic"

export default function InvalidLinkPage() {
  return (
    <CustomerShell title="Mon abonnement">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-medium text-card-foreground">{"Ce lien n'est plus valide ou a expiré."}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Utilisez le lien le plus récent reçu par email, ou contactez le professionnel pour en recevoir un nouveau.
        </p>
      </div>
    </CustomerShell>
  )
}
